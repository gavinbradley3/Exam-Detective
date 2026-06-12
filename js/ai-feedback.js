/* ============================================================
   Exam Detective — controlled AI-assisted feedback (optional layer)

   Hard rules (enforced here AND in server.js):
   - AI never decides which questions are flagged; the deterministic
     rules in js/analysis-builder.js do that. AI only comments on
     already-flagged questions.
   - The AI sees ONLY a structured evidence packet built from the
     CURRENT analysis: numbers, plus extracted text that genuinely
     came from this analysis's uploads. No student names, no raw
     files, no stale data.
   - Responses must be structured JSON; anything malformed is shown
     as an honest error, never paraphrased or "fixed".
   - Suggested revisions render ONLY when the full question text was
     extracted — no rewrites of wording the AI never saw.
   - The deterministic report works identically when AI is off,
     unconfigured, or failing.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var esc = function (s) { return ED.analysis.esc(s); };

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

  function buildPacket(an, f) {
    if (!an || an.source !== "uploaded" || !f) return null;
    var status = extractionStatus(an, f);
    var distribution = null;
    (f.options || []).forEach(function (o) {
      var m = String(o.text).match(/chosen by (\d+)%/i);
      if (m) { distribution = distribution || {}; distribution[o.letter] = parseInt(m[1], 10); }
    });
    // extracted wording comes from the flag card itself, which was built
    // from this analysis's uploads only (see analysis-builder.js)
    var stem = null, choices = null;
    if (status !== "none") {
      stem = String(f.question).replace(/<[^>]*>[^<]*<\/[^>]*>/g, "").replace(/<[^>]*>/g, "").trim();
      if (status === "complete") {
        choices = {};
        (f.options || []).forEach(function (o) {
          var tm = String(o.text).match(/^“(.*)” — chosen by/);
          if (tm) choices[o.letter] = tm[1];
        });
        if (!Object.keys(choices).length) choices = null;
      }
    }
    var passage = linkedPassage(an, f);
    return {
      analysisId: an.analysisId || an.id,
      questionNumber: f.number,
      flagType: f.flag,
      issueCategory: f.issueCategory || null,
      secondaryCategory: f.secondaryCategory || null,
      severity: f.severity || null,
      confidence: f.confidence || null,
      keyedAnswer: f.keyedAnswer || null,
      mostChosenAnswer: f.mostChosen || null,
      answerDistribution: distribution,
      percentCorrect: f.percentCorrect !== undefined ? f.percentCorrect : null,
      blankRate: f.blankRate !== undefined ? f.blankRate : null,
      responseCount: f.responseCount !== undefined ? f.responseCount : null,
      patternNoticed: f.pattern || null,
      questionStem: stem,
      answerChoices: choices,
      linkedPassage: passage ? { title: passage.title, excerpt: passage.excerpt || null } : null,
      extractionStatus: status,
      evidenceAvailability: f.evidence || "Data only",
      knownLimitations: f.limitations || []
    };
  }

  // ---------- response contract ----------

  var CONFIDENCE = ["High", "Medium", "Low"];

  function validateResponse(obj) {
    var errors = [];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, errors: ["response is not a JSON object"] };
    }
    ["issueSummary", "likelyIssueType", "evidenceBasedExplanation"].forEach(function (k) {
      if (typeof obj[k] !== "string" || !obj[k].trim()) errors.push("missing or empty field: " + k);
    });
    if (!Array.isArray(obj.teacherReviewActions) || !obj.teacherReviewActions.length ||
        !obj.teacherReviewActions.every(function (a) { return typeof a === "string" && a.trim(); })) {
      errors.push("teacherReviewActions must be a non-empty list of strings");
    }
    if (CONFIDENCE.indexOf(obj.confidence) === -1) errors.push("confidence must be High, Medium, or Low");
    if (!Array.isArray(obj.limitations)) errors.push("limitations must be a list");
    if (obj.suggestedRevision !== null && obj.suggestedRevision !== undefined &&
        typeof obj.suggestedRevision !== "string" &&
        !(typeof obj.suggestedRevision === "object" && typeof obj.suggestedRevision.stem === "string")) {
      errors.push("suggestedRevision must be null, a string, or {stem, options}");
    }
    return { ok: !errors.length, errors: errors };
  }

  // ---------- rendering (everything escaped; revision gated) ----------

  function renderFeedback(fb, status, opts) {
    opts = opts || {};
    var html = '<div class="ai-box">' +
      '<div class="ai-label">AI-ASSISTED FEEDBACK · ADVISORY ONLY</div>' +
      '<p class="ai-line"><b>' + esc(fb.issueSummary) + '</b></p>' +
      '<p class="ai-line"><b>Likely issue type:</b> ' + esc(fb.likelyIssueType) +
        ' <span class="ai-conf">AI confidence: ' + esc(fb.confidence) + '</span></p>' +
      '<p class="ai-line">' + esc(fb.evidenceBasedExplanation) + '</p>' +
      '<p class="ai-line"><b>Suggested review steps:</b></p>' +
      '<ol class="ai-actions">' + fb.teacherReviewActions.map(function (a) {
        return '<li>' + esc(a) + '</li>';
      }).join("") + '</ol>';

    // Revisions only when the FULL question text was in the packet.
    if (fb.suggestedRevision && status === "complete") {
      var rev = typeof fb.suggestedRevision === "string" ? { stem: fb.suggestedRevision } : fb.suggestedRevision;
      html += '<p class="ai-line"><b>Suggested revision (verify against the exam before using):</b> ' + esc(rev.stem) + '</p>';
      if (rev.options && typeof rev.options === "object") {
        html += '<ul class="ai-rev-opts">' + Object.keys(rev.options).map(function (L) {
          return '<li><b>' + esc(L) + '.</b> ' + esc(rev.options[L]) + '</li>';
        }).join("") + '</ul>';
      }
    } else if (fb.suggestedRevision && status !== "complete") {
      html += '<p class="ai-line ai-muted">A revision was suggested but is hidden: the full question text wasn’t extracted, so rewrites can’t be checked against the real wording.</p>';
    }

    var lims = (fb.limitations || []).slice();
    if (status === "none") lims.unshift("This feedback is based on response data only — the AI never saw the question wording.");
    if (status === "partial") lims.unshift("Extraction was partial — review the original document before acting.");
    if (lims.length) {
      html += '<p class="ai-line ai-muted"><b>AI-stated limitations:</b> ' + lims.map(esc).join(" · ") + '</p>';
    }
    html += '<p class="ai-line ai-muted">Generated by an AI model from this question’s evidence packet. It can be wrong — verify against your documents before changing anything.</p>';
    html += '</div>';
    return html;
  }

  // ---------- transport & request flow ----------

  // Injectable for tests. Default: POST to the local API boundary.
  var transport = function (packet) {
    return fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packet: packet })
    }).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, body: t }; });
    });
  };

  // -> Promise<{ state: "ok"|"not-configured"|"unavailable"|"rate-limited"|"malformed"|"empty"|"rejected", feedback?, message? }>
  function request(packet) {
    if (!packet) return Promise.resolve({ state: "rejected", message: "No evidence packet could be built for this question." });
    return ED.ai.transport(packet).then(function (res) {
      if (res.status === 503) return { state: "not-configured", message: "AI feedback isn’t configured on this server. The deterministic report above is unaffected. Setup: see AI_SETUP.md (an API key on the server — never in the browser)." };
      if (res.status === 429) return { state: "rate-limited", message: "The AI service is rate-limiting requests. Try again in a minute — nothing else is affected." };
      if (res.status === 400) return { state: "rejected", message: "The server rejected the evidence packet. This is a bug worth reporting — the deterministic report is unaffected." };
      if (res.status !== 200) return { state: "unavailable", message: "The AI service couldn’t be reached (status " + res.status + "). The deterministic report above is unaffected." };
      var data;
      try { data = JSON.parse(res.body); } catch (e) {
        return { state: "malformed", message: "The AI returned something that isn’t valid JSON. Showing nothing rather than guessing." };
      }
      if (!data || !data.feedback) return { state: "empty", message: "The AI returned an empty response. Try again, or rely on the deterministic report above." };
      var v = validateResponse(data.feedback);
      if (!v.ok) return { state: "malformed", message: "The AI response didn’t match the required structure (" + v.errors[0] + "). Showing nothing rather than guessing." };
      return { state: "ok", feedback: data.feedback };
    }).catch(function () {
      return { state: "unavailable", message: "Couldn’t reach the AI service (network error or the app isn’t running through server.js). The deterministic report above is unaffected." };
    });
  }

  // ---------- card slot UI (results page, uploaded data only) ----------

  function slotIdle(qn) {
    return '<button class="btn btn-sm btn-outline" data-action="ai-ask" data-q="' + qn + '">AI-assisted feedback (optional)</button>';
  }

  function slotConfirm(qn) {
    return '<div class="ai-box">' +
      '<div class="ai-label">BEFORE SENDING</div>' +
      '<p class="ai-line">This sends <b>this question’s evidence packet</b> — the response numbers plus any wording extracted from your uploads — to the AI service configured on the server. No student names are included. API use may cost money.</p>' +
      '<div class="btn-row mt-8">' +
        '<button class="btn btn-sm btn-primary" data-action="ai-send" data-q="' + qn + '">Send &amp; get feedback</button>' +
        '<button class="btn btn-sm btn-outline" data-action="ai-cancel" data-q="' + qn + '">Cancel</button>' +
      '</div></div>';
  }

  function slotMessage(kind, message) {
    var cls = kind === "ok" ? "ok" : (kind === "not-configured" ? "info" : "warn");
    return '<div class="notice ' + cls + '" style="margin:10px 0 0;"><span class="notice-title">AI feedback — ' +
      esc(kind.replace(/-/g, " ")) + '</span>' + esc(message) + '</div>';
  }

  ED.ai = {
    buildPacket: buildPacket,
    validateResponse: validateResponse,
    renderFeedback: renderFeedback,
    request: request,
    transport: transport,
    slotIdle: slotIdle,
    slotConfirm: slotConfirm,
    slotMessage: slotMessage,
    extractionStatus: extractionStatus
  };

  // ---------- actions (delegated from app.js) ----------

  function slot(qn) { return document.getElementById("ai-slot-" + qn); }
  function flagFor(an, qn) {
    return (an.flagged || []).filter(function (f) { return f.number === qn; })[0];
  }

  ED.actions = ED.actions || {};

  ED.actions["ai-ask"] = function (el) {
    var qn = parseInt(el.getAttribute("data-q"), 10);
    var s = slot(qn);
    if (s) s.innerHTML = slotConfirm(qn);
  };

  ED.actions["ai-cancel"] = function (el) {
    var qn = parseInt(el.getAttribute("data-q"), 10);
    var s = slot(qn);
    if (s) s.innerHTML = slotIdle(qn);
  };

  ED.actions["ai-send"] = function (el) {
    var qn = parseInt(el.getAttribute("data-q"), 10);
    var s = slot(qn);
    var an = ED.data.activeAnalysis();
    if (!s || !an || an.source !== "uploaded") return;
    var f = flagFor(an, qn);
    var packet = buildPacket(an, f);
    s.innerHTML = '<p class="small muted">Asking the AI service… the deterministic report above is final either way.</p>';
    request(packet).then(function (res) {
      if (res.state === "ok") {
        var status = packet.extractionStatus;
        s.innerHTML = renderFeedback(res.feedback, status);
        // persist with the analysis so saved analyses & exports include it
        an.aiFeedback = an.aiFeedback || {};
        an.aiFeedback[qn] = { feedback: res.feedback, extractionStatus: status, at: new Date().toISOString() };
        ED.data.setActiveUploaded(an);
      } else {
        s.innerHTML = slotMessage(res.state, res.message) +
          '<p class="small" style="margin-top:6px;"><button class="btn-link" data-action="ai-ask" data-q="' + qn + '">Try again</button></p>';
      }
    });
  };
})();
