/* Results / Question Review view — the heart of the app.
   Mirrors the uploaded HTML reference report (see DESIGN_REFERENCE_NOTES.md),
   with web-native additions: snapshot, priority list, key audit,
   department pattern summary, and collapsed Advanced Details. */

window.ED = window.ED || {};
ED.views = ED.views || {};

ED.views.results = function () {
  "use strict";
  var an = ED.demo.analysis;
  var B = ED.blocks;

  return (
    '<div class="page"><div class="container">' +

      '<div class="report-toolbar no-print">' +
        '<a class="back-link" href="#/dashboard" style="margin:0;">&larr; Back to Dashboard</a>' +
        '<span style="flex-grow:1;"></span>' +
        '<button class="btn btn-outline btn-sm" data-action="print">Print / Save as PDF</button>' +
        '<a class="btn btn-primary btn-sm" href="#/reports">Export Reports</a>' +
      '</div>' +

      '<article class="report" aria-label="Teacher review report">' +

        // 1. Teacher Review Header + 2. Opening Summary
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
        '<p class="rhead-sub">Grouped by reading passage, in exam order. Each card shows the original question, what went wrong, the action for this week, and the fix for next year’s test bank.</p>' +
        B.groupedSections(an) +

        // 7. Key Audit Summary
        B.keyAuditSection(an) +

        // 8. Department Pattern Summary
        B.departmentPatternSection(an) +

        // 9. The Takeaway
        B.takeawayPanel(an) +

        B.footerCap(an) +

      '</article>' +
    '</div></div>'
  );
};
