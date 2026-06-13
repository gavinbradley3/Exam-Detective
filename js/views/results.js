/* Results / Question Review view — the heart of the app.
   Renders the ACTIVE dataset only (demo or uploaded — never a mix),
   with the data source labeled at the top. Mirrors the design
   reference (see DESIGN_REFERENCE_NOTES.md). */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  function emptyState() {
    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Results</div>' +
          '<h1>No analysis yet</h1>' +
        '</div>' +
        '<div class="card" style="text-align:center;padding:44px 28px;">' +
          '<p style="font-size:15px;"><b>There’s nothing to show — no analysis has been run.</b></p>' +
          '<p class="muted mt-8">Exam Detective only shows results it actually computed. Run an analysis on your own files, or open the clearly-labeled demo.</p>' +
          '<div class="btn-row mt-24" style="justify-content:center;">' +
            '<a class="btn btn-primary" href="#/new-analysis">Start New Analysis</a>' +
            '<a class="btn btn-outline" href="#/results/demo">Open the demo results</a>' +
          '</div>' +
        '</div>' +
      '</div></div>'
    );
  }

  ED.views.results = function (param) {
    if (param === "demo") {
      // explicit choice to view the demo (e.g. "View Demo" buttons)
      ED.data.setActiveDemo();
      location.hash = "#/results";
      return "";
    }

    var an = ED.data.activeAnalysis();
    if (!an) return emptyState();
    var B = ED.blocks;

    return (
      '<div class="page"><div class="container">' +

        '<div class="report-toolbar no-print">' +
          '<a class="back-link" href="#/dashboard" style="margin:0;">&larr; Dashboard</a>' +
          '<span style="flex-grow:1;"></span>' +
          '<button class="btn btn-outline btn-sm" data-action="save-analysis">Save analysis</button>' +
          '<button class="btn btn-outline btn-sm" data-action="export-data-csv">Export data (CSV)</button>' +
          '<button class="btn btn-outline btn-sm" data-action="print">Print / Save as PDF</button>' +
          '<a class="btn btn-primary btn-sm" href="#/reports">Reports</a>' +
        '</div>' +
        '<p class="small muted no-print" id="results-toolbar-note" style="max-width:760px;margin:0 auto 14px;"></p>' +

        '<article class="report" aria-label="Teacher review report">' +

          // 1. Teacher Review Header + 2. Opening Summary (+ source banner)
          B.reportHeader(an) +

          // 3. Key / Scoring Warning (before everything else that matters)
          B.keyWarning(an) +

          // Legend (how to read the question cards)
          B.legend() +

          // 4. Exam Health Snapshot
          B.snapshot(an) +

          // 5. Priority Action List (with links into the cards)
          B.priorityTable(an, true) +

          // 6. Grouped Question Review Sections
          '<div class="rhead">Question-by-Question Review</div>' +
          '<p class="rhead-sub">' + (an.source === "uploaded"
            ? "In exam order. Each card shows the response data, what the numbers suggest, and what to check before acting. Question text isn’t available from results CSVs."
            : "Grouped by reading passage, in exam order. Each card shows the original question, what went wrong, the action for this week, and the fix for next year’s test bank.") + '</p>' +
          B.groupedSections(an, { aiInteractive: true }) +

          // 7. Key Audit Summary
          B.keyAuditSection(an) +

          // 7b. Upload & readability audit (uploaded data only)
          B.uploadAuditSection(an) +

          // 8. Department Pattern Summary
          B.departmentPatternSection(an) +

          // 9. The Takeaway
          B.takeawayPanel(an) +

          B.footerCap(an) +

        '</article>' +
      '</div></div>'
    );
  };

  // ----- actions -----

  ED.actions["save-analysis"] = function () {
    var an = ED.data.activeAnalysis();
    var name = an ? an.examName + " — saved " + new Date().toLocaleDateString() : "";
    var res = ED.data.saveCurrent(name);
    var note = document.getElementById("results-toolbar-note");
    if (note) {
      note.textContent = res.ok
        ? "Saved to this browser’s local storage (not the cloud). Find it under Saved Analyses."
        : res.error;
    }
  };

  // Build the rows for a data export of one analysis. Exposed (and
  // tested) so the export always reflects the ACTIVE dataset, with
  // its source stated inside the file itself.
  function exportRows(an) {
    var rows = [];
    rows.push(["Exam Detective data export"]);
    rows.push(["Source", an.source === "demo"
      ? "DEMO DATA — built-in sample exam, not uploaded results"
      : "Uploaded data (" + (an.uploadedMeta ? an.uploadedMeta.filesParsed : 0) + " parsed file(s))"]);
    rows.push(["Exam", an.examName]);
    rows.push(["Sections", an.sections.map(function (s) { return s.id; }).join("; ")]);
    rows.push(["Students", an.totalResponses]);
    rows.push([]);
    var header = ["Question", "Combined % Missed"];
    an.sections.forEach(function (s) { header.push(s.id + " % Missed"); });
    header.push("Flag", "Pattern noticed");
    rows.push(header);
    var flaggedBy = {};
    an.flagged.forEach(function (f) { flaggedBy[f.number] = f; });
    an.allQuestions.forEach(function (q) {
      var row = ["Q" + q.number, q.unscored ? "" : q.combinedMissed];
      an.sections.forEach(function (s) {
        var v = q.missedBySection[s.id];
        row.push(v === null || v === undefined ? "" : v);
      });
      var f = flaggedBy[q.number];
      row.push(f ? f.flag : "", f ? f.pattern : "");
      rows.push(row);
    });
    return rows;
  }
  ED.exportData = { rows: exportRows };

  // CSV export of the ACTIVE dataset only.
  ED.actions["export-data-csv"] = function () {
    var an = ED.data.activeAnalysis();
    if (!an) return;
    var blob = new Blob([ED.analysis.toCSV(exportRows(an))], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ED.analysis.exportName(an, "data", "csv");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };
})();
