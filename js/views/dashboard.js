/* Dashboard view — summarizes the ACTIVE analysis (demo or uploaded)
   and locally saved analyses. Shows zeros honestly when nothing
   has been run, instead of demo numbers. */

window.ED = window.ED || {};
ED.views = ED.views || {};

ED.views.dashboard = function () {
  "use strict";
  var A = ED.analysis;
  var an = ED.data.activeAnalysis();
  var saved = ED.data.listSaved();

  var stats = [
    { lbl: "Active analysis", num: an ? 1 : 0 },
    { lbl: "Questions flagged", num: an ? an.flagged.length : 0, cls: an && an.flagged.length ? "warn" : "" },
    { lbl: "Possible key concerns", num: an ? an.keyAudit.mismatchQuestions.length : 0, cls: an && an.keyAudit.mismatchQuestions.length ? "alert" : "" },
    { lbl: "Classes in analysis", num: an ? an.sections.length : 0 },
    { lbl: "Students in analysis", num: an ? an.totalResponses : 0 },
    { lbl: "Saved analyses (this browser)", num: saved.length, cls: saved.length ? "ok" : "" }
  ];

  var activeCard;
  if (an) {
    var srcChip = an.source === "demo"
      ? '<span class="src-chip-inline demo">Demo Data</span>'
      : '<span class="src-chip-inline uploaded">Uploaded Data</span>';
    activeCard =
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center;">' +
          '<div>' +
            '<div class="card-label">Active analysis · ' + an.dateCreated + '</div>' +
            '<h2 style="margin-bottom:4px;">' + A.esc(an.examName) + ' ' + srcChip + '</h2>' +
            '<p>' + A.esc(an.examType) + ' · ' + an.sections.length + ' section' + (an.sections.length === 1 ? "" : "s") + ' (' +
              an.sections.map(function (s) { return A.esc(s.id); }).join(", ") + ') · ' +
              an.totalResponses + ' students · ' + an.totalQuestions + ' questions</p>' +
            (an.keyAudit.mismatchQuestions.length
              ? '<p class="mt-8">' + ED.blocks.flagBadge("Possible Key Error") + ' <span class="small muted" style="margin-left:6px;">' + an.keyAudit.mismatchQuestions.length + ' question' + (an.keyAudit.mismatchQuestions.length === 1 ? "" : "s") + ' with key-conflict signals — check before finalizing marks</span></p>'
              : '<p class="mt-8 small muted">No key conflicts detected.</p>') +
          '</div>' +
          '<div class="btn-row">' +
            '<a class="btn btn-primary" href="#/results">Open Results</a>' +
            '<a class="btn btn-outline" href="#/reports">Reports</a>' +
          '</div>' +
        '</div>' +
      '</div>';
  } else {
    activeCard =
      '<div class="card empty-card">' +
        '<div class="empty-state" style="border:none;background:none;padding:18px 0;">' +
          '<b>No analysis yet.</b>' +
          '<span>Upload class result CSVs through New Analysis, or open the demo to see how results look.</span>' +
        '</div>' +
        '<div class="btn-row" style="justify-content:center;">' +
          '<a class="btn btn-primary" href="#/new-analysis">Start New Analysis</a>' +
          '<a class="btn btn-outline" href="#/results/demo">Open the demo</a>' +
        '</div>' +
      '</div>';
  }

  var topFlagged = "";
  if (an && an.flagged.length) {
    var top = A.priorityOrder(an.flagged.map(function (f) {
      return Object.assign({ combined: A.statsFor(an, f.number).combinedMissed }, f);
    })).slice(0, 5);
    topFlagged =
      '<div class="section-block">' +
        '<h2>Top flagged questions</h2>' +
        '<p class="section-sub">The most urgent items from the active analysis' + (an.source === "demo" ? " (demo data)" : "") + '.</p>' +
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
      '</div>';
  }

  var savedBlock =
    '<div class="section-block">' +
      '<h2>Saved analyses</h2>' +
      '<p class="section-sub">Stored in this browser only — not the cloud. Back them up from the Saved page.</p>' +
      (saved.length
        ? '<div class="card"><p>' + saved.length + ' saved ' + (saved.length === 1 ? "analysis" : "analyses") + ' on this device.</p>' +
          '<div class="btn-row mt-16"><a class="btn btn-outline" href="#/saved">Open Saved Analyses</a></div></div>'
        : '<div class="card"><p class="muted">Nothing saved yet. After running an analysis, use “Save analysis” on the Results page.</p></div>') +
    '</div>';

  return (
    '<div class="page"><div class="container">' +
      '<div class="page-head">' +
        '<div class="eyebrow">Dashboard</div>' +
        '<h1>Welcome back</h1>' +
        '<p class="lede">Here’s where your exam reviews stand.</p>' +
      '</div>' +

      '<div class="btn-row mb-16">' +
        '<a class="btn btn-primary" href="#/new-analysis">Start New Analysis</a>' +
        '<a class="btn btn-outline" href="#/comparison">Department Comparison</a>' +
        '<a class="btn btn-outline" href="#/saved">Saved Analyses</a>' +
      '</div>' +

      '<div class="cards-grid stats mt-16">' +
        stats.map(function (s) {
          return '<div class="stat-card"><div class="num ' + (s.cls || "") + '">' + s.num + '</div><div class="lbl">' + s.lbl + '</div></div>';
        }).join("") +
      '</div>' +

      '<div class="section-block"><h2>Active analysis</h2>' + activeCard + '</div>' +
      topFlagged +
      savedBlock +
    '</div></div>'
  );
};
