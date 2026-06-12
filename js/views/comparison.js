/* Department Comparison view — compares sections in the ACTIVE
   dataset. With one uploaded section, it says honestly that
   comparison needs more sections instead of faking a department. */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  function overviewCards(an) {
    var avgs = an.sections.map(function (s) { return s.average; });
    var cards = [
      { lbl: "Classes compared", num: an.sections.length },
      { lbl: "Total responses", num: an.totalResponses },
      { lbl: "Overall average", num: an.combinedAverage + "%" },
      { lbl: "Class average range", num: avgs.length > 1 ? Math.min.apply(null, avgs) + "–" + Math.max.apply(null, avgs) + "%" : (avgs[0] || 0) + "%" },
      { lbl: "Shared flagged questions", num: an.departmentPattern.widespread.length, cls: an.departmentPattern.widespread.length ? "warn" : "" },
      { lbl: "Section-specific concerns", num: an.departmentPattern.sectionSpecific.length, cls: an.departmentPattern.sectionSpecific.length ? "warn" : "" },
      { lbl: "Possible key concerns", num: an.keyAudit.mismatchQuestions.length, cls: an.keyAudit.mismatchQuestions.length ? "alert" : "" }
    ];
    return '<div class="cards-grid stats">' + cards.map(function (c) {
      return '<div class="stat-card"><div class="num ' + (c.cls || "") + '">' + c.num + '</div><div class="lbl">' + c.lbl + '</div></div>';
    }).join("") + '</div>';
  }

  function classTable(an) {
    var esc = ED.analysis.esc;
    return (
      '<div class="table-wrap"><table class="data">' +
      '<caption>Class comparison</caption>' +
      '<thead><tr><th scope="col">Section</th><th scope="col" class="num">Responses</th><th scope="col" class="num">Average</th><th scope="col" class="num">Median</th><th scope="col" class="num">Flagged questions</th><th scope="col" class="num">Possible key concerns</th><th scope="col">Strongest area</th><th scope="col">Area needing review</th></tr></thead><tbody>' +
      an.sections.map(function (s) {
        var flaggedHere = an.flagged.filter(function (f) { return f.classesAffected.indexOf(s.id) !== -1; }).length;
        var keyIssues = an.keyAudit.mismatchQuestions.filter(function (q) {
          var f = an.flagged.filter(function (x) { return x.number === q; })[0];
          return f && f.classesAffected.indexOf(s.id) !== -1;
        }).length;
        return '<tr><td><b>' + esc(s.id) + '</b></td><td class="num">' + (s.responses || 0) + '</td><td class="num">' + s.average + '%</td><td class="num">' + (s.median === null || s.median === undefined ? "—" : s.median + "%") + '</td><td class="num">' + flaggedHere + '</td><td class="num">' + (keyIssues || "—") + '</td><td>' + esc(s.strongest || "—") + '</td><td>' + esc(s.weakest || "—") + '</td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<p class="small muted mt-8">Averages within a few points of each other are normal class-to-class variation — this table is for spotting patterns, not ranking teachers.' +
      (an.source === "uploaded" ? ' “Strongest area” needs the exam text, which this build doesn’t read yet.' : '') + '</p>'
    );
  }

  function heatmap(an) {
    var flaggedNums = {};
    an.flagged.forEach(function (f) { flaggedNums[f.number] = f; });
    var header = '<tr><th scope="col" class="rowhead">Class</th>' +
      an.allQuestions.map(function (q) {
        return '<th scope="col">' + (q.number % 5 === 0 || q.number === 1 ? q.number : "") + '</th>';
      }).join("") + '</tr>';
    var rows = an.sections.map(function (s) {
      return '<tr><th scope="row" class="rowhead">' + ED.analysis.esc(s.id) + '</th>' +
        an.allQuestions.map(function (q) {
          var pct = q.missedBySection[s.id];
          if (pct === null || pct === undefined) {
            return '<td class="hm-none"><button type="button" aria-label="Question ' + q.number + ', class ' + ED.analysis.esc(s.id) + ': no scored data" title="No scored data" disabled></button></td>';
          }
          var band = ED.analysis.heatBand(pct);
          var label = "Question " + q.number + ", class " + s.id + ": " + pct + "% missed — " + ED.analysis.HEAT_LABELS[band];
          return '<td class="hm-' + band + (flaggedNums[q.number] ? " flagged" : "") + '">' +
            '<button type="button" data-action="hm-detail" data-q="' + q.number + '" data-s="' + ED.analysis.esc(s.id) + '" aria-label="' + label + '" title="' + label + '"></button></td>';
        }).join("") + '</tr>';
    }).join("");
    return (
      '<div class="heatmap-scroll" tabindex="0" role="region" aria-label="Question heat map — percent missed per class. Use the buttons in each cell for details.">' +
        '<table class="heatmap">' + header + rows + '</table>' +
      '</div>' +
      '<div class="hm-legend">' +
        ED.analysis.HEAT_LABELS.map(function (l, i) { return '<span><i class="hm-' + i + '"></i>' + l + '</span>'; }).join("") +
        '<span><i style="outline:2px solid var(--red);outline-offset:-2px;background:#fff;"></i>Flagged question</span>' +
      '</div>' +
      '<div class="hm-detail" id="hm-detail" aria-live="polite">Click any cell for details about that question and class.</div>'
    );
  }

  function issueLists(an) {
    var esc = ED.analysis.esc;
    if (an.sections.length < 2) {
      return '<div class="notice info"><span class="notice-title">Needs at least two sections</span>' +
        'Widespread-versus-section-specific patterns only exist when two or more class sections wrote the same exam. ' +
        'Upload more section CSVs in <a href="#/new-analysis/2">New Analysis</a> to unlock this comparison.</div>';
    }
    function rowFor(qn) {
      var f = an.flagged.filter(function (x) { return x.number === qn; })[0];
      if (!f) return "";
      var st = ED.analysis.statsFor(an, qn);
      return '<tr><td><a class="qlink" href="#/results">Q' + qn + '</a></td>' +
        '<td class="num">' + st.combinedMissed + '%</td>' +
        '<td>' + ED.blocks.flagBadge(f.flag) + '</td>' +
        '<td>' + esc(f.pattern) + '</td></tr>';
    }
    function listOrEmpty(nums, emptyText) {
      if (!nums.length) return '<p class="muted small">' + emptyText + '</p>';
      return '<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Q</th><th scope="col" class="num">% Missed</th><th scope="col">Label</th><th scope="col">Pattern</th></tr></thead><tbody>' +
        nums.map(rowFor).join("") + '</tbody></table></div>';
    }
    return (
      '<div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));">' +
        '<div class="card">' +
          '<h3>Widespread concerns</h3>' +
          '<p class="small muted mb-16">Missed across most or all classes. These usually point at question design, the answer key, a shared teaching gap, or simply a difficult skill — not at any one classroom.</p>' +
          listOrEmpty(an.departmentPattern.widespread, "No widespread concerns in this dataset.") +
        '</div>' +
        '<div class="card">' +
          '<h3>Section-specific concerns</h3>' +
          '<p class="small muted mb-16">One or two classes performed much lower than the others. Usual causes: pacing, a missed lesson, or a class-specific misunderstanding. Worth a friendly check-in, never a verdict.</p>' +
          listOrEmpty(an.departmentPattern.sectionSpecific, "No section-specific concerns in this dataset.") +
        '</div>' +
      '</div>'
    );
  }

  function reviewList(an) {
    var esc = ED.analysis.esc;
    if (!an.flagged.length) {
      return '<div class="card"><p class="muted">No flagged questions — there’s nothing on the department agenda from this dataset.</p></div>';
    }
    var rows = ED.analysis.priorityOrder(an.flagged.map(function (f) {
      return Object.assign({ combined: ED.analysis.statsFor(an, f.number).combinedMissed }, f);
    }));
    return (
      '<div class="table-wrap"><table class="data" id="dept-review-table">' +
      '<thead><tr><th scope="col">Question</th><th scope="col">Issue type</th><th scope="col">Affected classes</th><th scope="col">Suggested action</th><th scope="col">Next-year recommendation</th></tr></thead><tbody>' +
      rows.map(function (f) {
        var nextYear = f.rewrite ? "Use the suggested rewrite" : (f.nextYearNote ? f.nextYearNote : "Keep as written");
        return '<tr><td><b>Q' + f.number + '</b></td>' +
          '<td>' + ED.blocks.flagBadge(f.flag) + '</td>' +
          '<td>' + (f.classesAffected.length === an.sections.length ? "All sections" : f.classesAffected.map(esc).join(", ")) + '</td>' +
          '<td>' + esc(f.pattern) + '</td>' +
          '<td>' + esc(nextYear) + '</td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<div class="btn-row mt-16"><button class="btn btn-outline" data-action="export-dept-csv">Export this list (CSV)</button>' +
      '<a class="btn btn-outline" href="#/reports">Full reports</a></div>'
    );
  }

  ED.views.comparison = function () {
    var an = ED.data.activeAnalysis();
    if (!an) {
      return (
        '<div class="page"><div class="container narrow">' +
          '<div class="page-head"><div class="eyebrow">Department Comparison</div><h1>No analysis yet</h1></div>' +
          '<div class="card" style="text-align:center;padding:44px 28px;">' +
            '<p><b>Nothing to compare — no analysis has been run.</b></p>' +
            '<div class="btn-row mt-24" style="justify-content:center;">' +
              '<a class="btn btn-primary" href="#/new-analysis">Start New Analysis</a>' +
              '<a class="btn btn-outline" href="#/results/demo">Open the demo</a>' +
            '</div>' +
          '</div>' +
        '</div></div>'
      );
    }
    return (
      '<div class="page"><div class="container">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Department Comparison</div>' +
          '<h1>' + ED.analysis.esc(an.examName) + ' — ' + an.sections.length + ' section' + (an.sections.length === 1 ? "" : "s") + '</h1>' +
          '<p class="lede">How the same exam behaved in different classrooms. Wording here is deliberately neutral: the goal is a productive department conversation, not a ranking.</p>' +
        '</div>' +
        ED.blocks.sourceBanner(an) +

        '<div class="section-block">' + overviewCards(an) + '</div>' +

        '<div class="section-block"><h2>Class comparison</h2>' + classTable(an) + '</div>' +

        '<div class="section-block"><h2>Question heat map</h2>' +
          '<p class="section-sub">Each cell is one question in one class, shaded by percent missed. Red-outlined cells are flagged questions. Scroll sideways to see all ' + an.totalQuestions + ' questions; click a cell for details.</p>' +
          heatmap(an) +
        '</div>' +

        '<div class="section-block"><h2>Widespread vs. section-specific</h2>' + issueLists(an) + '</div>' +

        '<div class="section-block"><h2>Department review list</h2>' +
          '<p class="section-sub">A prioritized agenda for your next department meeting — most urgent first.</p>' +
          reviewList(an) +
        '</div>' +
      '</div></div>'
    );
  };

  // ----- actions -----

  ED.actions["hm-detail"] = function (el) {
    var an = ED.data.activeAnalysis();
    if (!an) return;
    var qn = parseInt(el.getAttribute("data-q"), 10);
    var sid = el.getAttribute("data-s");
    var q = an.allQuestions[qn - 1];
    var f = an.flagged.filter(function (x) { return x.number === qn; })[0];
    var box = document.getElementById("hm-detail");
    if (!box || !q) return;
    var pct = q.missedBySection[sid];
    var html = "<b>Question " + qn + " · Class " + ED.analysis.esc(sid) + ":</b> " +
      (pct === null || pct === undefined ? "no scored data. " : pct + "% missed (" +
        ED.analysis.HEAT_LABELS[ED.analysis.heatBand(pct)].toLowerCase() + "). ") +
      "Combined across all classes: " + q.combinedMissed + "%." +
      (q.group && q.group.title ? " Passage: " + ED.analysis.esc(q.group.title) + "." : "");
    if (f) {
      html += " " + ED.blocks.flagBadge(f.flag) + " — " + ED.analysis.esc(f.pattern) +
        ' <a href="#/results">See full review</a>.';
    } else {
      html += " This question is not flagged.";
    }
    box.innerHTML = html;
  };

  ED.actions["export-dept-csv"] = function () {
    var an = ED.data.activeAnalysis();
    if (!an) return;
    var rows = [
      ["Exam Detective — department review list"],
      ["Source", an.source === "demo" ? "DEMO DATA — built-in sample exam" : "Uploaded data"],
      ["Exam", an.examName],
      [],
      ["Question", "Issue type", "Affected classes", "Pattern noticed", "Next-year recommendation"]
    ];
    ED.analysis.priorityOrder(an.flagged.map(function (f) {
      return Object.assign({ combined: ED.analysis.statsFor(an, f.number).combinedMissed }, f);
    })).forEach(function (f) {
      rows.push([
        "Q" + f.number,
        f.flag,
        f.classesAffected.length === an.sections.length ? "All sections" : f.classesAffected.join(", "),
        f.pattern,
        f.rewrite ? "Use the suggested rewrite" : (f.nextYearNote || "Keep as written")
      ]);
    });
    var blob = new Blob([ED.analysis.toCSV(rows)], { type: "text/csv" });
    var aEl = document.createElement("a");
    aEl.href = URL.createObjectURL(blob);
    aEl.download = ED.analysis.exportName(an, "department-review", "csv");
    document.body.appendChild(aEl);
    aEl.click();
    document.body.removeChild(aEl);
    URL.revokeObjectURL(aEl.href);
  };
})();
