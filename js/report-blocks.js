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

  // ----- Report header (eyebrow / title / meta row / intro) -----
  function reportHeader(an, opts) {
    opts = opts || {};
    var eyebrow = opts.eyebrow || "Teacher Review &nbsp;·&nbsp; Combined Data Check";
    var title = opts.title || an.examTitle;
    return (
      '<div class="eyebrow">' + eyebrow + '</div>' +
      '<h1>' + title + '</h1>' +
      '<div class="meta-row">' +
        '<span><b>' + A().esc(an.examType) + '</b></span>' +
        '<span>' + an.sections.length + ' Grade ' + A().esc(an.grade) + ' sections &nbsp;·&nbsp; <b>' + an.totalResponses + ' students total</b></span>' +
        '<span>Reviewed <b>' + A().esc(an.reviewedLabel) + '</b></span>' +
      '</div>' +
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
    var snaps = [
      { lbl: "Students", val: an.totalResponses },
      { lbl: "Classes", val: an.sections.length },
      { lbl: "Average", val: an.combinedAverage + "%" },
      { lbl: "Median", val: an.combinedMedian + "%" },
      { lbl: "Questions", val: an.totalQuestions },
      { lbl: "Flagged", val: an.flagged.length, cls: "alert" },
      { lbl: "Key Errors", val: an.keyAudit.mismatchQuestions.length, cls: "alert" },
      { lbl: "Need Action Now", val: an.flagged.filter(function (f) {
          return ["Possible Key Error", "Drop From Scoring", "Accept Multiple Answers", "Immediate Action"].indexOf(f.flag) !== -1;
        }).length, cls: "alert" }
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
    var rows = A().priorityOrder(an.flagged.map(function (f) {
      var st = A().statsFor(an, f.number);
      return Object.assign({ combined: st.combinedMissed }, f);
    }));
    return (
      '<div class="rhead">Priority Action List</div>' +
      '<p class="rhead-sub">The most urgent questions first. “% Missed” is the combined rate across all class sections.</p>' +
      '<div class="ptable-wrap"><table class="ptable">' +
      '<thead><tr><th scope="col">Question</th><th scope="col">% Missed</th><th scope="col">Classes Affected</th><th scope="col">Pattern Noticed</th><th scope="col">Recommended Action</th><th scope="col">Confidence</th>' +
      (withLinks ? '<th scope="col"><span class="visually-hidden">Details</span></th>' : '') +
      '</tr></thead><tbody>' +
      rows.map(function (f) {
        return '<tr>' +
          '<td class="qn">Q' + f.number + '</td>' +
          '<td class="pct">' + f.combined + '%</td>' +
          '<td>' + (f.classesAffected.length === an.sections.length ? "All " + an.sections.length : f.classesAffected.join(", ")) + '</td>' +
          '<td>' + A().esc(f.pattern) + '</td>' +
          '<td>' + flagBadge(f.flag) + '</td>' +
          '<td>' + A().esc(f.confidence) + '</td>' +
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

    // Stat block row
    html +=
      '<div class="qcard-top">' +
        '<div class="qnum-box"><span class="lbl">QUESTION</span><span class="num">' + f.number + '</span></div>' +
        '<div class="qstats">' +
          '<div class="qstat"><span class="lbl">MIN MISSED</span><span class="val maroon">' + st.minMissed + '%</span></div>' +
          '<div class="qstat"><span class="lbl">MAX MISSED</span><span class="val maroon">' + st.maxMissed + '%</span></div>' +
          '<div class="qstat"><span class="lbl">COMBINED</span><span class="val dark">~' + st.combinedMissed + '%</span></div>' +
        '</div>' +
        '<div class="qflagline">' + flagBadge(f.flag) +
          (f.secondaryFlags || []).map(flagBadge).join(" ") +
        '</div>' +
      '</div>';

    // Question + options
    html += '<div class="qtext">' + f.question +
      (f.badge ? ' <span class="badge">' + f.badge + '</span>' : '') + '</div>';
    html += '<ul class="opts">' + f.options.map(optionRow).join("") + '</ul>';

    // The Problem
    html += '<div class="label-line problem"><span class="dot" aria-hidden="true"></span>THE PROBLEM</div>';
    html += '<p class="prose">' + f.problem + '</p>';

    // Immediate action + next-year fix
    html += '<div class="label-line fix"><span class="dot" aria-hidden="true"></span>THE IMMEDIATE ACTION &amp; NEXT-YEAR FIX</div>';
    html += '<div class="fixbox">';
    html += '<div class="fixlbl">Immediate Action for This Week</div>';
    html += '<p class="immediate">' + f.immediate + '</p>';
    html += '<div class="fixlbl">Fix for Next Year’s Test Bank</div>';
    if (f.rewrite) {
      html += rewriteBlock(f.rewrite);
    } else {
      html += '<p class="immediate" style="margin-bottom:0;">' + (f.nextYearNote || "Keep the question as written.") + '</p>';
    }
    html += '</div>';

    // Advanced details — collapsed by default, hidden when printing
    if (f.advanced && !opts.hideAdvanced) {
      html +=
        '<details class="advanced">' +
          '<summary>Advanced Details</summary>' +
          '<div class="adv-body">' + f.advanced + '</div>' +
        '</details>';
    }

    html += '</div>';
    return html;
  }

  // ----- Grouped question sections (by passage) -----
  function groupedSections(an, opts) {
    var html = "";
    an.groups.forEach(function (g) {
      var qs = an.flagged.filter(function (f) {
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

  // ----- Department Pattern Summary -----
  function departmentPatternSection(an) {
    var dp = an.departmentPattern;
    return (
      '<div class="rhead">Department Pattern Summary</div>' +
      '<p class="rhead-sub">' + A().esc(dp.note) + '</p>' +
      '<p class="rhead-sub"><b>Widespread (most or all classes):</b> ' +
        dp.widespread.map(function (q) { return "Q" + q; }).join(", ") +
        ' — likely question-design or key issues.<br>' +
        '<b>Section-specific:</b> ' +
        dp.sectionSpecific.map(function (q) { return "Q" + q; }).join(", ") +
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
    reportHeader: reportHeader,
    legend: legend,
    keyWarning: keyWarning,
    snapshot: snapshot,
    priorityTable: priorityTable,
    questionCard: questionCard,
    groupedSections: groupedSections,
    keyAuditSection: keyAuditSection,
    departmentPatternSection: departmentPatternSection,
    takeawayPanel: takeawayPanel,
    footerCap: footerCap
  };
})();
