/* Department Comparison view */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  function overviewCards(an) {
    var avgs = an.sections.map(function (s) { return s.average; });
    var shared = an.departmentPattern.widespread.length;
    var sectionSpecific = an.departmentPattern.sectionSpecific.length;
    var cards = [
      { lbl: "Classes compared", num: an.sections.length },
      { lbl: "Total responses", num: an.totalResponses },
      { lbl: "Overall average", num: an.combinedAverage + "%" },
      { lbl: "Class average range", num: Math.min.apply(null, avgs) + "–" + Math.max.apply(null, avgs) + "%" },
      { lbl: "Shared flagged questions", num: shared, cls: "warn" },
      { lbl: "Section-specific concerns", num: sectionSpecific, cls: "warn" },
      { lbl: "Possible key mismatches", num: an.keyAudit.mismatchQuestions.length, cls: "alert" }
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
      '<thead><tr><th scope="col">Section</th><th scope="col" class="num">Responses</th><th scope="col" class="num">Average</th><th scope="col" class="num">Median</th><th scope="col" class="num">Flagged questions</th><th scope="col" class="num">Possible key issues</th><th scope="col">Strongest area</th><th scope="col">Area needing review</th></tr></thead><tbody>' +
      an.sections.map(function (s) {
        var flaggedHere = an.flagged.filter(function (f) { return f.classesAffected.indexOf(s.id) !== -1; }).length;
        var keyIssues = an.keyAudit.mismatchQuestions.filter(function (q) {
          var f = an.flagged.filter(function (x) { return x.number === q; })[0];
          return f && f.classesAffected.indexOf(s.id) !== -1;
        }).length;
        return '<tr><td><b>' + s.id + '</b></td><td class="num">' + s.responses + '</td><td class="num">' + s.average + '%</td><td class="num">' + s.median + '%</td><td class="num">' + flaggedHere + '</td><td class="num">' + (keyIssues || "—") + '</td><td>' + esc(s.strongest) + '</td><td>' + esc(s.weakest) + '</td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<p class="small muted mt-8">Averages within a few points of each other are normal class-to-class variation — this table is for spotting patterns, not ranking teachers.</p>'
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
      return '<tr><th scope="row" class="rowhead">' + s.id + '</th>' +
        an.allQuestions.map(function (q) {
          var pct = q.missedBySection[s.id];
          var band = ED.analysis.heatBand(pct);
          var label = "Question " + q.number + ", class " + s.id + ": " + pct + "% missed — " + ED.analysis.HEAT_LABELS[band];
          return '<td class="hm-' + band + (flaggedNums[q.number] ? " flagged" : "") + '">' +
            '<button type="button" data-action="hm-detail" data-q="' + q.number + '" data-s="' + s.id + '" aria-label="' + label + '" title="' + label + '"></button></td>';
        }).join("") + '</tr>';
    }).join("");
    return (
      '<div class="heatmap-scroll" tabindex="0" role="region" aria-label="Question heat map — percent missed per class. Use the buttons in each cell for details.">' +
        '<table class="heatmap">' + header + rows + '</table>' +
      '</div>' +
      '<div class="hm-legend" aria-hidden="false">' +
        ED.analysis.HEAT_LABELS.map(function (l, i) { return '<span><i class="hm-' + i + '"></i>' + l + '</span>'; }).join("") +
        '<span><i style="outline:2px solid var(--red);outline-offset:-2px;background:#fff;"></i>Flagged question</span>' +
      '</div>' +
      '<div class="hm-detail" id="hm-detail" aria-live="polite">Click any cell for details about that question and class.</div>'
    );
  }

  function issueLists(an) {
    var esc = ED.analysis.esc;
    function rowFor(qn) {
      var f = an.flagged.filter(function (x) { return x.number === qn; })[0];
      if (!f) return "";
      var st = ED.analysis.statsFor(an, qn);
      return '<tr><td><a class="qlink" href="#/results">Q' + qn + '</a></td>' +
        '<td class="num">' + st.combinedMissed + '%</td>' +
        '<td>' + ED.blocks.flagBadge(f.flag) + '</td>' +
        '<td>' + esc(f.pattern) + '</td></tr>';
    }
    return (
      '<div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));">' +
        '<div class="card">' +
          '<h3>Widespread concerns</h3>' +
          '<p class="small muted mb-16">Missed across most or all classes. These usually point at question design, the answer key, a shared teaching gap, or simply a difficult skill — not at any one classroom.</p>' +
          '<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Q</th><th scope="col" class="num">% Missed</th><th scope="col">Label</th><th scope="col">Pattern</th></tr></thead><tbody>' +
          an.departmentPattern.widespread.map(rowFor).join("") +
          '</tbody></table></div>' +
        '</div>' +
        '<div class="card">' +
          '<h3>Section-specific concerns</h3>' +
          '<p class="small muted mb-16">One or two classes performed much lower than the others. Usual causes: pacing, a missed lesson, or a class-specific misunderstanding. Worth a friendly check-in, never a verdict.</p>' +
          '<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Q</th><th scope="col" class="num">% Missed</th><th scope="col">Label</th><th scope="col">Pattern</th></tr></thead><tbody>' +
          an.departmentPattern.sectionSpecific.map(rowFor).join("") +
          '</tbody></table></div>' +
        '</div>' +
      '</div>'
    );
  }

  function reviewList(an) {
    var esc = ED.analysis.esc;
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
          '<td>' + (f.classesAffected.length === an.sections.length ? "All sections" : f.classesAffected.join(", ")) + '</td>' +
          '<td>' + esc(f.pattern) + '</td>' +
          '<td>' + esc(nextYear) + '</td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<div class="btn-row mt-16"><button class="btn btn-outline" data-action="export-dept-csv">Export this list (CSV)</button>' +
      '<a class="btn btn-outline" href="#/reports">Full reports</a></div>'
    );
  }

  ED.views.comparison = function () {
    var an = ED.demo.analysis;
    return (
      '<div class="page"><div class="container">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Department Comparison</div>' +
          '<h1>' + ED.analysis.esc(an.examName) + ' — across ' + an.sections.length + ' sections</h1>' +
          '<p class="lede">How the same exam behaved in different classrooms. Wording here is deliberately neutral: the goal is a productive department conversation, not a ranking.</p>' +
        '</div>' +

        overviewCards(an) +

        '<div class="section-block"><h2>Class comparison</h2>' + classTable(an) + '</div>' +

        '<div class="section-block"><h2>Question heat map</h2>' +
          '<p class="section-sub">Each cell is one question in one class, shaded by percent missed. Red-outlined cells are flagged questions. Scroll sideways to see all 75 questions; click a cell for details.</p>' +
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
    var an = ED.demo.analysis;
    var qn = parseInt(el.getAttribute("data-q"), 10);
    var sid = el.getAttribute("data-s");
    var q = an.allQuestions[qn - 1];
    var f = an.flagged.filter(function (x) { return x.number === qn; })[0];
    var box = document.getElementById("hm-detail");
    if (!box || !q) return;
    var pct = q.missedBySection[sid];
    var html = "<b>Question " + qn + " · Class " + sid + ":</b> " + pct + "% missed (" +
      ED.analysis.HEAT_LABELS[ED.analysis.heatBand(pct)].toLowerCase() + "). " +
      "Combined across all classes: " + q.combinedMissed + "%. Passage: " + ED.analysis.esc(q.group.title) + ".";
    if (f) {
      html += " " + ED.blocks.flagBadge(f.flag) + " — " + ED.analysis.esc(f.pattern) +
        ' <a href="#/results">See full review</a>.';
    } else {
      html += " This question is not flagged.";
    }
    box.innerHTML = html;
  };

  ED.actions["export-dept-csv"] = function () {
    var an = ED.demo.analysis;
    var rows = [["Question", "Issue type", "Affected classes", "Pattern noticed", "Next-year recommendation"]];
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
    aEl.download = "department-review-list.csv";
    document.body.appendChild(aEl);
    aEl.click();
    document.body.removeChild(aEl);
    URL.revokeObjectURL(aEl.href);
  };
})();
