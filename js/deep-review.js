/* ============================================================
   Exam Detective — AI Deep Review Mode (the judgment layer)

   The deterministic engine (js/analysis-builder.js) stays the
   EVIDENCE engine: it decides which questions are flagged and
   computes every number. This module turns those flags into a
   clean, structured evidence packet, sends the packet through the
   secure server route (server.js → /api/deep-review), and renders
   precise, teacher-facing verdicts in place of the generic rule
   text — WHEN the evidence supports a firm call.

   Hard rules (enforced here AND in server.js):
   - AI never decides what gets flagged. It only reasons over
     already-flagged questions, one clean packet at a time.
   - The packet is built from THIS analysis's aggregates and the
     wording genuinely extracted from THIS analysis's uploads.
     No student names, no raw files, no stale data.
   - Output must match a strict JSON contract; anything malformed
     is discarded (the deterministic card is kept) rather than
     paraphrased or "fixed".
   - Rewrites render only when the full question text was extracted.
   - Visual-dependent items force a human-review verdict — the app
     never pretends to interpret a comic/graph it cannot read.
   - The deterministic report works identically when Deep Review is
     off, unconfigured, or failing.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var esc = function (s) { return ED.analysis.esc(s); };

  // ---------- contract enums (shared with server.js) ----------

  var ISSUE_TYPES = [
    "key_error", "key_conflict_between_files", "ambiguous_multiple_defensible_answers",
    "flawed_line_reference", "missing_correct_answer", "distractor_too_plausible",
    "context_clue_trap", "visual_dependency", "section_specific_gap", "hard_but_fair",
    "insufficient_data"
  ];
  var ACTION_TYPES = [
    "rescore_with_different_answer", "accept_multiple_answers", "remove_from_scoring",
    "no_grading_change_revise_next_year", "no_action_needed",
    "human_review_required_visual", "insufficient_data"
  ];
  var SEVERITY = ["high", "medium", "low"];
  var CONFIDENCE = ["high", "medium", "low"];

  // How each firm action reads in the report, and which existing flag
  // badge style it borrows (see css/main.css / js/analysis.js FLAGS).
  var ACTION_LABEL = {
    rescore_with_different_answer:      { label: "Rescore with a different answer", cls: "flag-key-error", priority: 1 },
    accept_multiple_answers:            { label: "Accept multiple answers",         cls: "flag-multiple",  priority: 2 },
    remove_from_scoring:                { label: "Remove from scoring",             cls: "flag-drop",      priority: 3 },
    human_review_required_visual:       { label: "Human review required (visual)",  cls: "flag-watch",     priority: 4 },
    no_grading_change_revise_next_year: { label: "No grading change · revise next year", cls: "flag-revise", priority: 5 },
    insufficient_data:                  { label: "Insufficient data",               cls: "flag-watch",     priority: 6 },
    no_action_needed:                   { label: "No action needed",                cls: "flag-ok",        priority: 7 }
  };
  function actionInfo(t) { return ACTION_LABEL[t] || { label: t || "Review", cls: "flag-watch", priority: 6 }; }

  // ---------- evidence packet (pure; current analysis only) ----------

  function extractionStatus(an, f) {
    if (f.evidence === "Partial text — needs review") return "partial";
    if (f.evidence === "Question text available" || f.evidence === "Question + passage available") return "complete";
    return "none";
  }

  function linkedPassage(an, f) {
    var ps = (an.evidenceSummary && an.evidenceSummary.passages) || [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.linked && p.from !== null && f.number >= p.from && f.number <= p.to) return p;
    }
    return null;
  }

  // Strip the HTML the card builder wrapped around the stem, leaving
  // the verbatim extracted wording (or null when nothing was read).
  function plainStem(f, status) {
    if (status === "none") return null;
    return String(f.question)
      .replace(/<span[^>]*>[^<]*<\/span>/gi, "")
      .replace(/<[^>]*>/g, "")
      .trim() || null;
  }

  // Real answer-choice wording, only when the full text was extracted.
  function choicesFrom(f, status) {
    if (status !== "complete") return null;
    var choices = {};
    (f.options || []).forEach(function (o) {
      var m = String(o.text).match(/^“(.*)”\s+—\s+chosen by/);
      if (m) choices[o.letter] = m[1];
    });
    return Object.keys(choices).length ? choices : null;
  }

  // Response share per choice, parsed back out of the card's option rows.
  function distributionFrom(f) {
    var dist = null;
    (f.options || []).forEach(function (o) {
      var m = String(o.text).match(/chosen by (\d+)%/i);
      if (m) { dist = dist || {}; dist[o.letter] = parseInt(m[1], 10); }
    });
    return dist;
  }

  // Strongest wrong answer and whether it beat the key — the single
  // most decision-relevant signal for a key/distractor call.
  function strongestWrong(dist, keyed) {
    if (!dist || !keyed) return null;
    var letter = null, share = -1;
    Object.keys(dist).forEach(function (L) {
      if (L !== keyed && dist[L] > share) { share = dist[L]; letter = L; }
    });
    if (letter === null) return null;
    var keyedShare = dist[keyed] || 0;
    return { letter: letter, share: share, beatsKey: share > keyedShare, keyedShare: keyedShare };
  }

  // Line references named in the stem ("lines 30–33", "line 14").
  function lineRefs(stem) {
    if (!stem) return [];
    var out = [];
    var re = /lines?\s+(\d+)\s*(?:[–—-]\s*(\d+))?/gi, m;
    while ((m = re.exec(stem))) out.push(m[2] ? m[1] + "–" + m[2] : m[1]);
    return out;
  }

  // Section-by-section miss rates for this question, from the grid.
  function sectionMissed(an, qn) {
    var aq = an.allQuestions && an.allQuestions[qn - 1];
    if (!aq) return null;
    var out = {};
    Object.keys(aq.missedBySection || {}).forEach(function (sid) {
      out[sid] = aq.missedBySection[sid];
    });
    return out;
  }

  // File-vs-entered key conflict recorded for this question, if any.
  function keyConflict(an, qn) {
    var ka = an.keyAudit;
    if (!ka || !ka.findings) return null;
    for (var i = 0; i < ka.findings.length; i++) {
      if (ka.findings[i].q === qn) return ka.findings[i];
    }
    return null;
  }

  function buildPacket(an, f) {
    if (!an || an.source !== "uploaded" || !f) return null;
    var status = extractionStatus(an, f);
    var st = ED.analysis.statsFor(an, f.number);
    var stem = plainStem(f, status);
    var dist = distributionFrom(f);
    var keyed = f.keyedAnswer && f.keyedAnswer !== "—" ? f.keyedAnswer : null;
    var passage = linkedPassage(an, f);
    var conflict = keyConflict(an, f.number);
    var aggregateOnly = f.responseCount === null || f.responseCount === undefined;

    return {
      // ---- identity / context ----
      analysisId: an.analysisId || an.id,
      examTitle: an.examName || "Uploaded exam",
      subject: an.subject || null,
      grade: an.grade || null,
      sectionNames: (an.sections || []).map(function (s) { return s.id; }),
      totalStudents: an.totalResponses,
      // ---- the flag (deterministic) ----
      questionNumber: f.number,
      flagType: f.flag,
      deterministicIssueCategory: f.issueCategory || null,
      severityHint: f.severity || null,
      patternNoticed: f.pattern || null,
      // ---- the question ----
      questionStem: stem,
      answerChoices: choicesFrom(f, status),
      lineReferences: lineRefs(stem),
      // ---- the key ----
      uploadedKeyAnswer: keyed,
      resultReportKeyAnswer: conflict && conflict.type && /file/i.test(conflict.type) ? (conflict.detail || null) : null,
      keyConflict: conflict ? { type: conflict.type, detail: conflict.detail } : null,
      // ---- the responses ----
      answerDistribution: dist,
      combinedCorrectPct: f.percentCorrect !== undefined ? f.percentCorrect : null,
      combinedMissedPct: st.combinedMissed,
      minMissedPct: st.minMissed,
      maxMissedPct: st.maxMissed,
      sectionBySection: sectionMissed(an, f.number),
      strongestWrongAnswer: strongestWrong(dist, keyed),
      blankRate: f.blankRate !== undefined ? f.blankRate : null,
      responseCount: f.responseCount !== undefined ? f.responseCount : null,
      // ---- the passage ----
      linkedPassage: passage ? { title: passage.title, excerpt: passage.excerpt || null } : null,
      // ---- honest boundaries ----
      extractionStatus: status,
      evidenceAvailability: f.evidence || "Data only",
      visualEvidence: f.visualDependency
        ? { required: true, type: f.visualType || "visual",
            note: "The visual itself was not machine-readable (no OCR/vision in this build); only this flag is available." }
        : null,
      parserLimitations: f.limitations || [],
      aggregateOnly: aggregateOnly,
      perStudentDataUnavailable: aggregateOnly,
      surroundingTextUnavailable: lineRefs(stem).length > 0 && !(passage && passage.excerpt)
    };
  }

  // ---------- response contract (strict; discard on mismatch) ----------

  function validateReview(obj) {
    var errors = [];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, errors: ["response is not a JSON object"] };
    }
    ["teacherSummary", "problemExplanation", "immediateAction"].forEach(function (k) {
      if (typeof obj[k] !== "string" || !obj[k].trim()) errors.push("missing or empty field: " + k);
    });
    if (ISSUE_TYPES.indexOf(obj.issueType) === -1) errors.push("issueType must be one of the allowed values");
    if (ACTION_TYPES.indexOf(obj.recommendedActionType) === -1) errors.push("recommendedActionType must be one of the allowed values");
    if (SEVERITY.indexOf(String(obj.severity || "").toLowerCase()) === -1) errors.push("severity must be high, medium, or low");
    if (CONFIDENCE.indexOf(String(obj.confidence || "").toLowerCase()) === -1) errors.push("confidence must be high, medium, or low");
    ["evidenceFromResults", "evidenceFromQuestion", "evidenceFromPassage", "nextYearFix"].forEach(function (k) {
      if (obj[k] != null && typeof obj[k] !== "string") errors.push(k + " must be a string or null");
    });
    if (obj.rewrittenQuestion != null && typeof obj.rewrittenQuestion !== "string") errors.push("rewrittenQuestion must be null or a string");
    if (obj.rewrittenChoices != null && (typeof obj.rewrittenChoices !== "object" || Array.isArray(obj.rewrittenChoices))) {
      errors.push("rewrittenChoices must be null or an object");
    }
    ["limitations", "doNotOverclaim"].forEach(function (k) {
      if (obj[k] != null && !Array.isArray(obj[k])) errors.push(k + " must be a list");
    });
    return { ok: !errors.length, errors: errors };
  }

  // ---------- transport & per-question request ----------

  // Injectable for tests. Default: POST to the secure server route.
  var transport = function (packet) {
    return fetch("/api/deep-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packet: packet })
    }).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, body: t }; });
    });
  };

  // Injectable status probe (GET /api/ai-status).
  var statusProbe = function () {
    return fetch("/api/ai-status").then(function (r) { return r.json(); }).catch(function () {
      return { configured: false };
    });
  };
  function status() {
    return ED.deepReview.statusProbe().then(function (s) {
      return { configured: !!(s && s.configured), model: s && s.model ? s.model : null };
    }).catch(function () { return { configured: false, model: null }; });
  }

  // -> Promise<{ state, review?, message? }>
  function reviewQuestion(packet) {
    if (!packet) return Promise.resolve({ state: "rejected", message: "No evidence packet could be built for this question." });
    return ED.deepReview.transport(packet).then(function (res) {
      if (res.status === 503) return { state: "not-configured" };
      if (res.status === 429) return { state: "rate-limited" };
      if (res.status === 400) return { state: "rejected" };
      if (res.status !== 200) return { state: "unavailable" };
      var data;
      try { data = JSON.parse(res.body); } catch (e) { return { state: "malformed" }; }
      if (!data || !data.review) return { state: "empty" };
      var v = validateReview(data.review);
      if (!v.ok) return { state: "malformed", message: v.errors[0] };
      return { state: "ok", review: data.review };
    }).catch(function () { return { state: "unavailable" }; });
  }

  // ---------- orchestration (real progress, honest fallback) ----------

  // Runs Deep Review over the analysis's flagged questions.
  // opts.onStep(label) is called for every real progress step.
  // Resolves to { aiUsed, reason, reviews:{qn:review}, failures:[qn], synthesis }.
  function run(an, opts) {
    opts = opts || {};
    var onStep = opts.onStep || function () {};
    var flagged = (an.flagged || []).filter(function (f) { return !f.noData; });

    return status().then(function (s) {
      if (!s.configured) {
        onStep("AI Deep Review unavailable — no API key configured on the server. Showing the deterministic analysis.");
        return { aiUsed: false, reason: "not-configured", reviews: {}, failures: [], synthesis: null, model: null };
      }
      if (!flagged.length) {
        return { aiUsed: true, reason: null, reviews: {}, failures: [], synthesis: synthesize(an, {}), model: s.model };
      }
      onStep("Building evidence packets for " + flagged.length + " flagged question" + (flagged.length === 1 ? "" : "s") + "…");
      var reviews = {}, failures = [];
      var chain = Promise.resolve();
      flagged.forEach(function (f) {
        chain = chain.then(function () {
          onStep("Reviewing Q" + f.number + " with AI…");
          var packet = buildPacket(an, f);
          return reviewQuestion(packet).then(function (r) {
            if (r.state === "ok") {
              // remember what the AI actually saw, so rendering can gate rewrites
              r.review.extractionStatus = packet.extractionStatus;
              reviews[f.number] = r.review;
            } else {
              failures.push(f.number);
            }
          });
        });
      });
      return chain.then(function () {
        onStep("Writing the final teacher report…");
        var synth = synthesize(an, reviews);
        onStep("Finalizing exports…");
        return {
          aiUsed: true,
          reason: failures.length ? "partial" : null,
          reviews: reviews, failures: failures, synthesis: synth, model: s.model
        };
      });
    });
  }

  // ---------- whole-report synthesis (deterministic over AI outputs) ----------

  // Layer 2: aggregate the per-question verdicts into a department view.
  // Deterministic on purpose — cheap, testable, and never contradicts
  // the Layer-1 verdicts it is summarizing.
  function synthesize(an, reviews) {
    var items = Object.keys(reviews || {}).map(function (qn) {
      return { q: parseInt(qn, 10), r: reviews[qn] };
    }).sort(function (a, b) { return a.q - b.q; });

    var buckets = {
      immediateScoring: [], reviseNextYear: [], hardButFair: [], visualReview: [], insufficient: [], noAction: []
    };
    var keyIssues = [];
    var IMMEDIATE = ["rescore_with_different_answer", "accept_multiple_answers", "remove_from_scoring"];

    items.forEach(function (it) {
      var a = it.r.recommendedActionType;
      if (IMMEDIATE.indexOf(a) !== -1) buckets.immediateScoring.push(it);
      else if (a === "no_grading_change_revise_next_year") buckets.reviseNextYear.push(it);
      else if (a === "human_review_required_visual") buckets.visualReview.push(it);
      else if (a === "insufficient_data") buckets.insufficient.push(it);
      else if (a === "no_action_needed") buckets.noAction.push(it);
      if (it.r.issueType === "key_error" || it.r.issueType === "key_conflict_between_files") keyIssues.push(it);
      if (it.r.issueType === "hard_but_fair") buckets.hardButFair.push(it);
    });

    function qlist(list) { return list.map(function (it) { return "Q" + it.q; }); }
    function summarize(list) {
      return list.map(function (it) {
        return { q: it.q, action: actionInfo(it.r.recommendedActionType).label, summary: it.r.teacherSummary };
      });
    }

    var reviewed = items.length;
    var execParts = [];
    execParts.push(reviewed + " flagged question" + (reviewed === 1 ? "" : "s") + " were reviewed by AI Deep Review.");
    if (buckets.immediateScoring.length) execParts.push(buckets.immediateScoring.length + " need an immediate scoring decision (" + qlist(buckets.immediateScoring).join(", ") + ").");
    if (keyIssues.length) execParts.push(keyIssues.length + " point at the answer key itself (" + qlist(keyIssues).join(", ") + ").");
    if (buckets.visualReview.length) execParts.push(buckets.visualReview.length + " depend on a visual the app can't read and need human review (" + qlist(buckets.visualReview).join(", ") + ").");
    if (buckets.reviseNextYear.length) execParts.push(buckets.reviseNextYear.length + " are fair this year but should be rewritten before reuse (" + qlist(buckets.reviseNextYear).join(", ") + ").");

    return {
      reviewedCount: reviewed,
      executiveSummary: execParts.join(" "),
      immediateScoringAction: summarize(buckets.immediateScoring),
      reviseNextYear: summarize(buckets.reviseNextYear),
      hardButFair: summarize(buckets.hardButFair),
      visualReview: summarize(buckets.visualReview),
      insufficient: summarize(buckets.insufficient),
      keyAudit: summarize(keyIssues),
      departmentTakeaway: keyIssues.length
        ? "With " + keyIssues.length + " key-level issue" + (keyIssues.length === 1 ? "" : "s") + " on this exam, verify every entry in the answer-key document against the source before the exam is reused."
        : "No key-level errors surfaced in the AI review. Remaining items are question-design or difficulty concerns.",
      priorityActionList: summarize(buckets.immediateScoring)
    };
  }

  // ---------- rendering: AI-enhanced card layer ----------

  // Returns { flagline, problem, immediate, nextYear, rewrite, limitations }
  // HTML fragments the card builder drops into the deterministic shell,
  // so the stat block / options / evidence stay exactly as computed.
  function renderReviewParts(review, status) {
    var ai = actionInfo(review.recommendedActionType);
    var conf = String(review.confidence || "").toLowerCase();
    var sev = String(review.severity || "").toLowerCase();

    var flagline =
      '<span class="flag ' + ai.cls + '" title="AI Deep Review recommended action">' + esc(ai.label) + '</span>' +
      ' <span class="flag flag-cat" title="AI Deep Review issue type">' + esc(String(review.issueType).replace(/_/g, " ")) + '</span>' +
      ' <span class="ai-conf">AI confidence: ' + esc(conf || "—") + '</span>';

    var evidence = [];
    if (review.evidenceFromResults) evidence.push('<b>From the results:</b> ' + esc(review.evidenceFromResults));
    if (review.evidenceFromQuestion) evidence.push('<b>From the question:</b> ' + esc(review.evidenceFromQuestion));
    if (review.evidenceFromPassage) evidence.push('<b>From the passage:</b> ' + esc(review.evidenceFromPassage));

    var problem =
      '<b>' + esc(review.teacherSummary) + '</b> ' + esc(review.problemExplanation) +
      (evidence.length ? ' <span class="ai-evidence">' + evidence.join(' ') + '</span>' : '');

    var rewrite = null;
    if (status === "complete" && review.rewrittenQuestion) {
      var opts = review.rewrittenChoices && typeof review.rewrittenChoices === "object" ? review.rewrittenChoices : null;
      rewrite =
        '<div class="rq">' + esc(review.rewrittenQuestion) + '</div>' +
        (opts ? '<ul class="ropts">' + Object.keys(opts).map(function (L) {
          return '<li class="ropt"><span class="rchip" aria-hidden="true">' + esc(L) + '</span>' + esc(opts[L]) + '</li>';
        }).join("") + '</ul>' : '') +
        '<p class="immediate rnote">Verify this rewrite against the original exam before using it.</p>';
    }

    var lims = (review.limitations || []).slice();
    (review.doNotOverclaim || []).forEach(function (d) { lims.push("Don’t overclaim: " + d); });

    return {
      severityLabel: sev ? sev.charAt(0).toUpperCase() + sev.slice(1) : null,
      flagline: flagline,
      problem: problem,
      immediate: '<b class="act">' + esc(ai.label) + ".</b> " + esc(review.immediateAction),
      nextYear: review.nextYearFix ? esc(review.nextYearFix) : "Keep the question as written.",
      rewrite: rewrite,
      limitations: lims
    };
  }

  // ---------- rendering: whole-report synthesis block ----------

  function renderSynthesis(synth, opts) {
    if (!synth) return "";
    opts = opts || {};
    function bucketTable(title, rows, emptyNote) {
      if (!rows.length) return emptyNote ? '<p class="rhead-sub"><b>' + esc(title) + ':</b> ' + esc(emptyNote) + '</p>' : "";
      return '<p class="rhead-sub"><b>' + esc(title) + '</b></p>' +
        '<div class="ptable-wrap"><table class="ptable"><thead><tr>' +
        '<th scope="col">Question</th><th scope="col">Recommended Action</th><th scope="col">AI Summary</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td class="qn">Q' + r.q + '</td><td>' + esc(r.action) + '</td><td>' + esc(r.summary) + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    }
    return (
      '<div class="rhead" id="deep-review-synthesis">AI Deep Review — Department Synthesis</div>' +
      '<p class="rhead-sub">' + esc(synth.executiveSummary) + '</p>' +
      bucketTable("Immediate scoring action", synth.immediateScoringAction, "None — no question needs a scoring change right now.") +
      bucketTable("Revise for next year only", synth.reviseNextYear) +
      bucketTable("Hard but fair", synth.hardButFair) +
      bucketTable("Visual / comic / image-dependent — human review needed", synth.visualReview) +
      bucketTable("Insufficient data", synth.insufficient) +
      '<p class="rhead-sub" style="margin-top:10px;"><b>Key audit:</b> ' +
        (synth.keyAudit.length ? "AI flagged the answer key on " + synth.keyAudit.map(function (r) { return "Q" + r.q; }).join(", ") + "." : "No key-level errors surfaced in the AI review.") +
      '</p>' +
      '<p class="rhead-sub"><b>Department takeaway:</b> ' + esc(synth.departmentTakeaway) + '</p>' +
      '<p class="rhead-sub ai-muted">These conclusions were produced by an AI model from each question’s evidence packet and summarized deterministically. Verify against your documents before changing marks.</p>'
    );
  }

  // ---------- availability banner (top of report) ----------

  function renderBanner(an) {
    var st = an.deepReviewStatus;
    if (!st) return "";
    if (st.aiUsed) {
      var extra = st.reason === "partial" && st.failures && st.failures.length
        ? " " + st.failures.length + " question" + (st.failures.length === 1 ? "" : "s") + " (Q" + st.failures.join(", Q") + ") fell back to the deterministic analysis."
        : "";
      return '<div class="notice ok" style="margin:0 0 16px;"><span class="notice-title">AI Deep Review applied</span>' +
        'The flagged questions below carry AI verdicts built from their evidence packets' +
        (st.model ? " (" + esc(st.model) + ")" : "") + ". The deterministic stats are unchanged." + esc(extra) + '</div>';
    }
    var why = st.reason === "not-configured"
      ? "no API key is configured on the server (see AI_SETUP.md)"
      : "the AI service couldn’t be reached";
    return '<div class="notice info" style="margin:0 0 16px;"><span class="notice-title">AI Deep Review unavailable</span>' +
      'This report uses the deterministic analysis because ' + esc(why) + '. Every number below is still computed from your uploads.' + '</div>';
  }

  ED.deepReview = {
    ISSUE_TYPES: ISSUE_TYPES,
    ACTION_TYPES: ACTION_TYPES,
    actionInfo: actionInfo,
    buildPacket: buildPacket,
    validateReview: validateReview,
    transport: transport,
    statusProbe: statusProbe,
    status: status,
    reviewQuestion: reviewQuestion,
    run: run,
    synthesize: synthesize,
    renderReviewParts: renderReviewParts,
    renderSynthesis: renderSynthesis,
    renderBanner: renderBanner
  };
})();
