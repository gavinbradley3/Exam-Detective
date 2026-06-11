/* Dashboard view */

window.ED = window.ED || {};
ED.views = ED.views || {};

ED.views.dashboard = function () {
  "use strict";
  var an = ED.demo.analysis;
  var d = ED.demo.dashboard;
  var A = ED.analysis;

  var stats = [
    { lbl: "Recent analyses", num: d.analyses },
    { lbl: "Exams reviewed", num: d.examsReviewed },
    { lbl: "Questions flagged", num: d.questionsFlagged, cls: "warn" },
    { lbl: "Possible key errors", num: d.possibleKeyErrors, cls: "alert" },
    { lbl: "Classes compared", num: d.classesCompared },
    { lbl: "Reports generated", num: d.reportsGenerated, cls: "ok" }
  ];

  var top = A.priorityOrder(an.flagged.map(function (f) {
    return Object.assign({ combined: A.statsFor(an, f.number).combinedMissed }, f);
  })).slice(0, 5);

  return (
    '<div class="page"><div class="container">' +
      '<div class="page-head">' +
        '<div class="eyebrow">Dashboard</div>' +
        '<h1>Welcome back</h1>' +
        '<p class="lede">Here’s where your exam reviews stand. Start a new analysis, or pick up the demo review below.</p>' +
      '</div>' +

      '<div class="btn-row mb-16">' +
        '<a class="btn btn-primary" href="#/new-analysis">Start New Analysis</a>' +
        '<a class="btn btn-outline" href="#/comparison">Open Department Comparison</a>' +
      '</div>' +

      '<div class="cards-grid stats mt-16">' +
        stats.map(function (s) {
          return '<div class="stat-card"><div class="num ' + (s.cls || "") + '">' + s.num + '</div><div class="lbl">' + s.lbl + '</div></div>';
        }).join("") +
      '</div>' +

      '<div class="section-block">' +
        '<h2>Recent analyses</h2>' +
        '<p class="section-sub">Analyses stay on this device in the demo build. Delete them from Settings when you’re done.</p>' +
        '<div class="card">' +
          '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center;">' +
            '<div>' +
              '<div class="card-label">Demo · Created ' + an.dateCreated + '</div>' +
              '<h2 style="margin-bottom:4px;">' + A.esc(an.examName) + '</h2>' +
              '<p>' + A.esc(an.examType) + ' · ' + an.sections.length + ' sections (' +
                an.sections.map(function (s) { return s.id; }).join(", ") + ') · ' +
                an.totalResponses + ' students · ' + an.totalQuestions + ' questions</p>' +
              '<p class="mt-8">' + ED.blocks.flagBadge("Possible Key Error") + ' <span class="small muted" style="margin-left:6px;">3 suspected key errors — rescoring recommended before report cards</span></p>' +
            '</div>' +
            '<div class="btn-row">' +
              '<a class="btn btn-primary" href="#/results">Open Results</a>' +
              '<a class="btn btn-outline" href="#/reports">Reports</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section-block">' +
        '<h2>Top flagged questions</h2>' +
        '<p class="section-sub">The five most urgent items from your most recent analysis.</p>' +
        '<div class="table-wrap"><table class="data">' +
          '<thead><tr><th scope="col">Question</th><th scope="col" class="num">% Missed</th><th scope="col">Pattern noticed</th><th scope="col">Recommended action</th></tr></thead><tbody>' +
          top.map(function (f) {
            return '<tr>' +
              '<td><a class="qlink" href="#/results">Q' + f.number + '</a></td>' +
              '<td class="num">' + f.combined + '%</td>' +
              '<td>' + A.esc(f.pattern) + '</td>' +
              '<td>' + ED.blocks.flagBadge(f.flag) + '</td>' +
            '</tr>';
          }).join("") +
        '</tbody></table></div>' +
        '<p class="small muted mt-8">See every flagged question on the <a href="#/results">Results page</a>.</p>' +
      '</div>' +
    '</div></div>'
  );
};
