/* ============================================================
   Exam Detective — shared report building blocks
   Renders the pieces of the editorial report layout (header,
   question cards, fix boxes, takeaway). Used by both the
   Results page and the Reports page so they always match.
   Design contract: DESIGN_REFERENCE_NOTES.md
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var A = function () { return ED.analysis; };

  function flagBadge(label) {
    var info = A().flagInfo(label);
    return '<span class="flag ' + info.cls + '">' + A().esc(label) + '</span>';
  }

  // ----- Data source banner -----
  // Every results/report surface states where its numbers come from.
  function sourceBanner(an) {
    if (an.source === "uploaded") {
      var m = an.uploadedMeta || {};
      var bits = [
        (m.filesUploaded || 0) + " file" + (m.filesUploaded === 1 ? "" : "s") + " uploaded",
        (m.filesParsed || 0) + " parsed",
        an.totalResponses + " student" + (an.totalResponses === 1 ? "" : "s"),
        an.sections.length + " section" + (an.sections.length === 1 ? "" : "s")
      ];
      var unparsed = (m.unparsedFiles && m.unparsedFiles.length)
        ? '<span class="src-note">Not analyzed (parsing not yet supported): ' + m.unparsedFiles.map(A().esc).join(", ") + '</span>'
        : "";
      return '<div class="src-banner uploaded"><span class="src-chip">Uploaded Data</span>' +
        '<span class="src-meta">' + bits.join(" · ") + '</span>' + unparsed + '</div>';
    }
    return '<div class="src-banner demo"><span class="src-chip">Demo Data</span>' +
      '<span class="src-meta">A sample Grade 8 ELA exam built into the app — not your uploads. Run your own analysis from <a href="#/new-analysis">New Analysis</a>.</span></div>';
  }

  // ----- Report header (eyebrow / title / meta row / intro) -----
  function reportHeader(an, opts) {
    opts = opts || {};
    var eyebrow = opts.eyebrow || "Teacher Review &nbsp;·&nbsp; Combined Data Check";
    var title = opts.title || an.examTitle;
    var sectionsLabel = an.sections.length + (an.grade ? " Grade " + A().esc(an.grade) : "") +
      " section" + (an.sections.length === 1 ? "" : "s");
    return (
      '<div class="eyebrow">' + eyebrow + '</div>' +
      '<h1>' + title + '</h1>' +
      '<div class="meta-row">' +
        '<span><b>' + A().esc(an.examType) + '</b></span>' +
        '<span>' + sectionsLabel + ' &nbsp;·&nbsp; <b>' + an.totalResponses + ' students total</b></span>' +
        '<span>Reviewed <b>' + A().esc(an.reviewedLabel) + '</b></span>' +
      '</div>' +
      sourceBanner(an) +
      '<p class="intro">' + an.openingSummary + '</p>'
    );
  }

  // ----- Legend + key warning -----
  function legend() {
    return (
      '<div class="legend">' +
        '<div class="legend-row">' +
          '<span class="legend-item"><span class="dotchip green" aria-hidden="true">A</span> Correct answer on the key</span>' +
          '<span class="legend-item"><span class="dotchip red" aria-hidden="true">D</span> Where most students went instead</span>' +
        '</div>' +
        '<div class="legend-note">For each question, the percentages show the lowest and highest miss rates among the class sections, plus the combined rate across all of them.</div>' +
      '</div>'
    );
  }

  function keyWarning(an) {
    var ka = an.keyAudit;
    if (!ka || !ka.mismatchQuestions.length) return "";
    return (
      '<div class="key-warning" role="alert">' +
        '<span class="kw-label">Key / Scoring Warning</span>' +
        '<b>' + A().esc(ka.summary) + '</b> ' +
        'Affected questions: ' + ka.mismatchQuestions.map(function (q) { return "Q" + q; }).join(", ") + ". " +
        'See the Key Audit Summary below for the per-question fix.' +
      '</div>'
    );
  }

  // ----- Exam health snapshot -----
  function snapshot(an) {
    var keyErrs = an.keyAudit.mismatchQuestions.length;
    var urgent = an.flagged.filter(function (f) {
      return ["Possible Key Error", "Drop From Scoring", "Accept Multiple Answers", "Immediate Action"].indexOf(f.flag) !== -1;
    }).length;
    var snaps = [
      { lbl: "Students", val: an.totalResponses },
      { lbl: "Classes", val: an.sections.length },
      { lbl: "Average", val: an.combinedAverage + "%" },
      { lbl: "Median", val: an.combinedMedian === null ? "—" : an.combinedMedian + "%" },
      { lbl: "Questions", val: an.totalQuestions },
      { lbl: "Flagged", val: an.flagged.length, cls: an.flagged.length ? "alert" : "good" },
      { lbl: "Key Concerns", val: keyErrs, cls: keyErrs ? "alert" : "good" },
      { lbl: "Need Action Now", val: urgent, cls: urgent ? "alert" : "good" }
    ];
    return (
      '<div class="rhead">Exam Health Snapshot</div>' +
      '<div class="snapshot">' + snaps.map(function (s) {
        return '<div class="snap"><span class="lbl">' + s.lbl + '</span><span class="val ' + (s.cls || "") + '">' + s.val + '</span></div>';
      }).join("") + '</div>'
    );
  }

  // ----- Priority Action List -----
  function priorityTable(an, withLinks) {
    if (!an.flagged.length) {
      return '<div class="rhead">Priority Action List</div>' +
        '<p class="rhead-sub">No questions were flagged. Every question stayed under the review thresholds — no key conflicts, no extreme miss rates, no large section gaps.</p>';
    }
    var rows = A().priorityOrder(an.flagged.map(function (f) {
      var st = A().statsFor(an, f.number);
      return Object.assign({ combined: st.combinedMissed }, f);
    }));
    // With Deep Review verdicts, urgency comes from the AI action (rescore /
    // remove / accept-both first), not the deterministic flag label.
    if (window.ED && ED.deepReview && an.deepReview) {
      rows.sort(function (a, b) {
        var ra = an.deepReview[a.number], rb = an.deepReview[b.number];
        var pa = ra ? ED.deepReview.actionInfo(ra.recommendedActionType).priority : A().flagInfo(a.flag).priority + 10;
        var pb = rb ? ED.deepReview.actionInfo(rb.recommendedActionType).priority : A().flagInfo(b.flag).priority + 10;
        if (pa !== pb) return pa - pb;
        return b.combined - a.combined || a.number - b.number;
      });
    }
    return (
      '<div class="rhead">Priority Action List</div>' +
      '<p class="rhead-sub">The most urgent questions first. “% Missed” is the combined rate across all class sections.</p>' +
      '<div class="ptable-wrap"><table class="ptable">' +
      '<thead><tr><th scope="col">Question</th><th scope="col">% Missed</th><th scope="col">Classes Affected</th><th scope="col">Pattern Noticed</th><th scope="col">Recommended Action</th><th scope="col">Confidence</th>' +
      (withLinks ? '<th scope="col"><span class="visually-hidden">Details</span></th>' : '') +
      '</tr></thead><tbody>' +
      rows.map(function (f) {
        // Deep Review verdicts take over the action + confidence columns —
        // the miss-rate numbers and pattern stay deterministic.
        var review = (window.ED && ED.deepReview && an.deepReview && an.deepReview[f.number]) || null;
        var actionCell, confCell;
        if (review) {
          var ai = ED.deepReview.actionInfo(review.recommendedActionType);
          actionCell = '<span class="flag ' + ai.cls + '" title="AI Deep Review verdict">' + A().esc(ai.label) + '</span>';
          var c = String(review.confidence || "");
          confCell = A().esc(c.charAt(0).toUpperCase() + c.slice(1)) + ' <span class="flag flag-ai" style="margin-left:4px;">AI</span>';
        } else {
          actionCell = flagBadge(f.flag);
          confCell = A().esc(f.confidence);
        }
        return '<tr>' +
          '<td class="qn">Q' + f.number + '</td>' +
          '<td class="pct">' + (f.noData ? "—" : f.combined + "%") + '</td>' +
          '<td>' + (f.classesAffected.length === an.sections.length ? "All " + an.sections.length : f.classesAffected.join(", ")) + '</td>' +
          '<td>' + A().esc(f.pattern) + '</td>' +
          '<td>' + actionCell + '</td>' +
          '<td>' + confCell + '</td>' +
          (withLinks ? '<td><a href="#q' + f.number + '">View details</a></td>' : '') +
        '</tr>';
      }).join("") +
      '</tbody></table></div>'
    );
  }

  // ----- One answer-option row -----
  function optionRow(o) {
    var cls = o.state ? " " + o.state : "";
    var pill = "";
    if (o.pill) {
      var pillCls = o.state === "correct" ? "fill-green" : "outline-red";
      pill = '<span class="pill ' + pillCls + '">' + o.pill + '</span>';
    }
    return (
      '<li class="opt' + cls + '">' +
        '<span class="chip" aria-hidden="true">' + o.letter + '</span>' +
        '<span class="txt">' + o.text + '</span>' + pill +
      '</li>'
    );
  }

  // ----- Suggested rewrite block -----
  function rewriteBlock(rw) {
    return (
      '<div class="rq">' + rw.stem + '</div>' +
      '<ul class="ropts">' +
      rw.options.map(function (o) {
        return '<li class="ropt' + (o.correct ? " win" : "") + '">' +
          '<span class="rchip" aria-hidden="true">' + o.letter + '</span>' + o.text +
          (o.correct ? '<span class="check" aria-label="correct answer">&#10003;</span>' : '') +
        '</li>';
      }).join("") +
      '</ul>' +
      (rw.note ? '<p class="immediate rnote">' + rw.note + '</p>' : '')
    );
  }

  // ----- Full question card (the core repeating unit) -----
  function questionCard(an, f, opts) {
    opts = opts || {};
    var st = A().statsFor(an, f.number);
    var html = '<div class="qcard" id="q' + f.number + '">';

    // AI Deep Review verdict for this question, if one was produced.
    // When present it REPLACES the generic rule prose (problem / action /
    // next-year fix) — but never the deterministic stat block or options.
    var review = (window.ED && ED.deepReview && an.deepReview && an.deepReview[f.number]) || null;
    var aiParts = review ? ED.deepReview.renderReviewParts(review, review.extractionStatus || f.aiExtractionStatus || null) : null;

    // Stat block row — missing-data cards show dashes, never fake rates
    var noData = !!f.noData;
    var dash = function (v, suffix) { return noData ? "—" : v + (suffix || ""); };
    var sevLabel = aiParts && aiParts.severityLabel ? aiParts.severityLabel : f.severity;
    var sevCls = { "High": "sev-high", "Medium": "sev-med", "Low": "sev-low", "Data gap": "sev-gap" }[sevLabel] || "sev-low";
    html +=
      '<div class="qcard-top">' +
        '<div class="qnum-box"><span class="lbl">QUESTION</span><span class="num">' + f.number + '</span></div>' +
        '<div class="qstats">' +
          '<div class="qstat"><span class="lbl">MIN MISSED</span><span class="val maroon">' + dash(st.minMissed, "%") + '</span></div>' +
          '<div class="qstat"><span class="lbl">MAX MISSED</span><span class="val maroon">' + dash(st.maxMissed, "%") + '</span></div>' +
          '<div class="qstat"><span class="lbl">COMBINED</span><span class="val dark">' + (noData ? "—" : "~" + st.combinedMissed + "%") + '</span></div>' +
          (f.percentCorrect !== undefined
            ? '<div class="qstat"><span class="lbl">% CORRECT</span><span class="val dark">' + (f.percentCorrect === null ? "—" : f.percentCorrect + "%") + '</span></div>'
            : '') +
          (f.blankRate !== undefined && f.blankRate !== null && f.blankRate > 0 && !noData
            ? '<div class="qstat"><span class="lbl">BLANK</span><span class="val maroon">' + f.blankRate + '%</span></div>'
            : '') +
        '</div>' +
        '<div class="qflagline">' +
          (sevLabel ? '<span class="flag ' + sevCls + '" title="Severity">' + A().esc(sevLabel) + '</span> ' : '') +
          (aiParts
            ? '<span class="flag flag-ai" title="AI Deep Review verdict">AI Deep Review</span> ' + aiParts.flagline
            : flagBadge(f.flag) +
              (f.issueCategory ? ' <span class="flag flag-cat" title="Issue category (deterministic data rule)">' + A().esc(f.issueCategory) + '</span>' : '') +
              (f.secondaryCategory ? ' <span class="flag flag-cat">' + A().esc(f.secondaryCategory) + '</span>' : '') +
              (f.secondaryFlags || []).map(flagBadge).join(" ")) +
          (f.evidence ? ' <span class="flag flag-evidence" title="What uploaded evidence is available for this question">' + A().esc(f.evidence) + '</span>' : '') +
        '</div>' +
      '</div>';

    // Question + options
    html += '<div class="qtext">' + f.question +
      (f.badge ? ' <span class="badge">' + f.badge + '</span>' : '') + '</div>';
    if (f.options && f.options.length) {
      html += '<ul class="opts">' + f.options.map(optionRow).join("") + '</ul>';
    }

    // The Problem — AI verdict replaces the generic rule prose when present.
    html += '<div class="label-line problem"><span class="dot" aria-hidden="true"></span>THE PROBLEM</div>';
    html += '<p class="prose">' + (aiParts ? aiParts.problem : f.problem) + '</p>';

    // Immediate action + next-year fix
    html += '<div class="label-line fix"><span class="dot" aria-hidden="true"></span>THE IMMEDIATE ACTION &amp; NEXT-YEAR FIX</div>';
    html += '<div class="fixbox">';
    html += '<div class="fixlbl">Immediate Action for This Week</div>';
    html += '<p class="immediate">' + (aiParts ? aiParts.immediate : f.immediate) + '</p>';
    html += '<div class="fixlbl">Fix for Next Year’s Test Bank</div>';
    if (aiParts && aiParts.rewrite) {
      html += aiParts.rewrite;
    } else if (aiParts) {
      html += '<p class="immediate" style="margin-bottom:0;">' + aiParts.nextYear + '</p>';
    } else if (f.rewrite) {
      html += rewriteBlock(f.rewrite);
    } else {
      html += '<p class="immediate" style="margin-bottom:0;">' + (f.nextYearNote || "Keep the question as written.") + '</p>';
    }
    html += '</div>';

    // Per-card honesty: what can NOT be confidently established.
    var limitations = aiParts ? aiParts.limitations : f.limitations;
    if (limitations && limitations.length) {
      html += '<div class="label-line limits"><span class="dot" aria-hidden="true"></span>WHAT THE APP CAN’T CONFIDENTLY SAY</div>' +
        '<ul class="limits-list">' + limitations.map(function (l) {
          return '<li>' + A().esc(l) + '</li>';
        }).join("") + '</ul>';
    }

    // Advanced details — collapsed by default, hidden when printing
    if (f.advanced && !opts.hideAdvanced) {
      html +=
        '<details class="advanced">' +
          '<summary>Advanced Details</summary>' +
          '<div class="adv-body">' + f.advanced + '</div>' +
        '</details>';
    }

    // Optional AI layer: stored feedback is part of the analysis record and
    // always renders (incl. exports); the interactive button only appears on
    // the live Results page for uploaded data. AI never affects the
    // deterministic content above. When a Deep Review verdict already covers
    // this card, the older per-question button is redundant — skip it.
    if (window.ED && ED.ai && an.source === "uploaded" && !aiParts) {
      var storedAI = an.aiFeedback && an.aiFeedback[f.number];
      if (storedAI && storedAI.feedback) {
        html += ED.ai.renderFeedback(storedAI.feedback, storedAI.extractionStatus);
      } else if (opts.aiInteractive) {
        html += '<div class="ai-slot no-print" id="ai-slot-' + f.number + '">' + ED.ai.slotIdle(f.number) + '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  // ----- Grouped question sections (by passage) -----
  function groupedSections(an, opts) {
    if (!an.flagged.length) {
      return '<div class="qcard" style="text-align:center;padding:34px 24px;">' +
        '<p class="prose" style="font-size:14px;"><b>Nothing to review here.</b> No questions crossed the flag thresholds in this dataset, so there are no question cards to show.</p></div>';
    }
    var html = "";
    an.groups.forEach(function (g) {
      var qs = an.flagged.filter(function (f) {
        // each question belongs to exactly one group — matched by stable id
        // (object identity doesn't survive the JSON round-trip of saved
        // analyses), with range matching as the legacy fallback
        var fg = an.allQuestions[f.number - 1] && an.allQuestions[f.number - 1].group;
        if (fg && fg.id !== undefined && g.id !== undefined) return fg.id === g.id;
        return f.number >= g.range[0] && f.number <= g.range[1];
      });
      if (!qs.length) return;
      var actionCount = qs.filter(function (f) { return f.flag !== "Watch List" && f.flag !== "No Action Needed"; }).length;
      var watchCount = qs.length - actionCount;
      var countLabel =
        (actionCount ? actionCount + " question" + (actionCount > 1 ? "s" : "") + " requiring action" : "") +
        (actionCount && watchCount ? " · " : "") +
        (watchCount ? watchCount + " under observation" : "");
      html +=
        '<div class="section-head">' +
          '<span class="roman" aria-hidden="true">' + g.roman + '</span>' +
          '<span class="section-title">' + A().esc(g.title) + '</span>' +
          '<span class="section-count">' + countLabel + '</span>' +
        '</div>';
      html += qs.map(function (f) { return questionCard(an, f, opts); }).join("");
    });
    return html;
  }

  // ----- Key Audit Summary -----
  function keyAuditSection(an) {
    var ka = an.keyAudit;
    var html = '<div class="rhead" id="key-audit">Key Audit Summary</div>';
    // Provenance: every uploaded-data report states which key it used.
    var kp = an.keyProvenance;
    if (kp) {
      var countNote = kp.entries === an.totalQuestions
        ? " — matches the " + an.totalQuestions + " questions in the results."
        : " — <b>count mismatch:</b> the key has " + kp.entries + " answer" + (kp.entries === 1 ? "" : "s") + " but the student results contain " + an.totalQuestions + " questions.";
      html += '<p class="rhead-sub"><b>Answer key used:</b> ' +
        (kp.file ? A().esc(kp.file) + " (" + A().esc(kp.source) + ")" : A().esc(kp.source)) +
        " · " + kp.entries + " answer" + (kp.entries === 1 ? "" : "s") + " extracted" + countNote +
        ((kp.missing || []).length ? " Missing entries: Q" + kp.missing.slice(0, 12).join(", Q") + (kp.missing.length > 12 ? "…" : "") + "." : "") +
        ((kp.conflicts || []).length ? " <b>Conflicting entries</b> (most frequent letter kept): Q" + kp.conflicts.join(", Q") + "." : "") +
        '</p>';
    }
    if (!ka.findings.length) {
      return html + '<p class="rhead-sub">No key inconsistencies were detected across the uploaded files.</p>';
    }
    html += '<p class="rhead-sub">' + A().esc(ka.summary) + '</p>';
    html += '<div class="ptable-wrap"><table class="ptable">' +
      '<thead><tr><th scope="col">Question</th><th scope="col">What We Found</th><th scope="col">What To Do</th></tr></thead><tbody>' +
      ka.findings.map(function (fnd) {
        return '<tr><td class="qn">Q' + fnd.q + '</td><td>' + A().esc(fnd.type) + '</td><td>' + A().esc(fnd.detail) + '</td></tr>';
      }).join("") +
      '</tbody></table></div>';
    html += '<p class="rhead-sub" style="margin-top:10px;"><b>Pattern check:</b> ' + A().esc(ka.rowShiftNote) + '</p>';
    return html;
  }

  // ----- Upload / readability audit (uploaded data) -----
  function uploadAuditSection(an) {
    if (!an.uploadAudit || !an.uploadAudit.length) return "";
    var rows = an.uploadAudit.map(function (u) {
      return '<tr><td class="qn">' + A().esc(u.name) + '</td>' +
        '<td>' + A().esc(u.type) + '</td>' +
        '<td>' + (u.pages || "—") + '</td>' +
        '<td>' + (u.images || 0) + '</td>' +
        '<td>' + A().esc(u.extracted) + (u.note ? ' — ' + A().esc(u.note) : '') + '</td>' +
        '<td>' + (u.safe ? "✓ used" : "✕ not used") + (u.warnings ? " · " + u.warnings + " warning" + (u.warnings === 1 ? "" : "s") : "") + '</td></tr>';
    }).join("");
    var anyImages = an.uploadAudit.some(function (u) { return u.images > 0; });
    return '<div class="rhead">Upload &amp; Readability Audit</div>' +
      '<p class="rhead-sub">What was read from each uploaded file, and whether it was safe to use in this analysis. Extraction method: text (no OCR or vision model in this build' +
      (anyImages ? ' — pages with embedded images are flagged as visual evidence for review by eye' : '') + ').</p>' +
      '<div class="ptable-wrap"><table class="ptable">' +
      '<thead><tr><th scope="col">File</th><th scope="col">Detected As</th><th scope="col">Pages</th><th scope="col">Images</th><th scope="col">Extracted</th><th scope="col">Status</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // ----- Department Pattern Summary -----
  function departmentPatternSection(an) {
    var dp = an.departmentPattern;
    var list = function (arr) {
      return arr.length ? arr.map(function (q) { return "Q" + q; }).join(", ") : "none";
    };
    return (
      '<div class="rhead">Department Pattern Summary</div>' +
      '<p class="rhead-sub">' + A().esc(dp.note) + '</p>' +
      '<p class="rhead-sub"><b>Widespread (most or all classes):</b> ' + list(dp.widespread) +
        ' — likely question-design or key issues.<br>' +
        '<b>Section-specific:</b> ' + list(dp.sectionSpecific) +
        ' — possible pacing or class-specific patterns; a neutral conversation, not a verdict.</p>'
    );
  }

  // ----- Takeaway panel -----
  function takeawayPanel(an) {
    return (
      '<div class="takeaway">' +
        '<div class="eyebrow2">The Takeaway</div>' +
        '<h2>What the data tells us</h2>' +
        an.takeaway.map(function (t, i) {
          return '<div class="titem"><span class="tn" aria-hidden="true">' + (i + 1) + '</span>' +
            '<p class="tt"><b>' + A().esc(t.lead) + '</b> ' + A().esc(t.text) + '</p></div>';
        }).join("") +
      '</div>'
    );
  }

  function footerCap(an, label) {
    return '<p class="footer-cap">' + A().esc(an.examName) + ' &nbsp;·&nbsp; ' + (label || "Complete Consolidated Question Review") + ' &nbsp;·&nbsp; For Department Action</p>';
  }

  ED.blocks = {
    flagBadge: flagBadge,
    sourceBanner: sourceBanner,
    reportHeader: reportHeader,
    legend: legend,
    keyWarning: keyWarning,
    snapshot: snapshot,
    priorityTable: priorityTable,
    questionCard: questionCard,
    groupedSections: groupedSections,
    keyAuditSection: keyAuditSection,
    uploadAuditSection: uploadAuditSection,
    departmentPatternSection: departmentPatternSection,
    takeawayPanel: takeawayPanel,
    footerCap: footerCap
  };
})();
