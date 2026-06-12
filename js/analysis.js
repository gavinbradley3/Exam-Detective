/* ============================================================
   Exam Detective — analysis helpers
   Flag definitions, priority ordering, plain-English wording,
   and the validation warnings shown in "Review Detected Data".
   When real parsing is added, it should feed this same shape.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  // Main flag labels, in priority order (most urgent first).
  // cls maps each flag to its badge style in css/main.css.
  var FLAGS = [
    { label: "Possible Key Error",      cls: "flag-key-error", priority: 1,
      meaning: "Several signals suggest the answer key itself may be wrong — not just that the question was hard." },
    { label: "Drop From Scoring",       cls: "flag-drop", priority: 2,
      meaning: "No answer choice is clearly correct, so the fairest move is to remove the question from scoring." },
    { label: "Accept Multiple Answers", cls: "flag-multiple", priority: 3,
      meaning: "Two answer choices are defensible. Giving credit for both is fairer than picking a winner." },
    { label: "Immediate Action",        cls: "flag-immediate", priority: 4,
      meaning: "This question may affect current marks and should be handled before report cards." },
    { label: "Revise for Next Year",    cls: "flag-revise", priority: 5,
      meaning: "Usable this year, but the wording or answer choices should be rebuilt before the exam is reused." },
    { label: "Hard but Fair",           cls: "flag-fair", priority: 6,
      meaning: "Many students missed it, but the key is defensible and the choices are reasonable. No grading change." },
    { label: "Watch List",              cls: "flag-watch", priority: 7,
      meaning: "The question is not clearly broken, but the data suggests possible concern. Worth a teacher's eyes." },
    { label: "Missing Response Data",   cls: "flag-watch", priority: 8,
      meaning: "No usable student responses were recorded for this question, so it can't be analyzed — check the source export." },
    { label: "No Action Needed",        cls: "flag-ok", priority: 9,
      meaning: "The question performed normally and the key appears correct." }
  ];

  function flagInfo(label) {
    for (var i = 0; i < FLAGS.length; i++) {
      if (FLAGS[i].label === label) return FLAGS[i];
    }
    return { label: label, cls: "flag-watch", priority: 9, meaning: "" };
  }

  // Flagged questions sorted for the Priority Action List.
  function priorityOrder(flagged) {
    return flagged.slice().sort(function (a, b) {
      var pa = flagInfo(a.flag).priority, pb = flagInfo(b.flag).priority;
      if (pa !== pb) return pa - pb;
      return b.combined - a.combined || a.number - b.number;
    });
  }

  // Look up combined-missed stats for a flagged question from the full grid.
  function statsFor(analysis, qNumber) {
    var q = analysis.allQuestions[qNumber - 1];
    return q || { minMissed: 0, maxMissed: 0, combinedMissed: 0, missedBySection: {} };
  }

  // Heat-map band for a percent-missed value (0–4). Bands are also
  // described in text (legend + cell labels), never color alone.
  function heatBand(pct) {
    if (pct < 25) return 0;
    if (pct < 40) return 1;
    if (pct < 60) return 2;
    if (pct < 80) return 3;
    return 4;
  }
  var HEAT_LABELS = [
    "Healthy (under 25% missed)",
    "Typical (25–39% missed)",
    "Worth a look (40–59% missed)",
    "Concern (60–79% missed)",
    "Serious concern (80%+ missed)"
  ];

  // Validation warnings for the demo "Review Detected Data" step.
  // Real parsing should produce warnings in this same plain-English shape.
  var DEMO_WARNINGS = [
    { level: "alert", title: "Possible key mismatch",
      text: "Questions 33, 36, and 66 appear to have a different keyed answer in 8C and 8E than in 8A, 8B, and 8D. Class marks may not be comparable until this is resolved." },
    { level: "alert", title: "Key vs. results conflict",
      text: "For Question 36, the uploaded answer key says D, but no students in any section chose D. This usually means the key document has an error." },
    { level: "warn", title: "Question count check",
      text: "We found 75 questions in the answer key and in 8A, 8B, 8C, and 8E — but the 8D file lists 75 questions with one unreadable row (Question 58). We assumed 75 questions; review the 8D file if Question 58 looks wrong." },
    { level: "warn", title: "Low-confidence page",
      text: "One page of the 8E PDF scanned at low quality. Response percentages for Questions 71–75 in 8E are estimates — double-check them before relying on those rows." },
    { level: "ok", title: "Class labels look good",
      text: "All five files have a unique class label (8A–8E) and response counts that add to 129 students." }
  ];

  // Escape user-entered text before inserting into HTML.
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function pct(n) { return n + "%"; }

  // Export filename with the analysis's own metadata — exam, grade,
  // subject, date, and an unmissable DEMO marker for demo data.
  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }
  function exportName(an, label, ext) {
    var parts = ["exam-detective", slug(an.examName)];
    if (an.grade) parts.push("grade" + slug(an.grade));
    if (an.subject) parts.push(slug(an.subject));
    parts.push(an.dateCreated || new Date().toISOString().slice(0, 10));
    parts.push(an.source === "demo" ? "DEMO" : "uploaded");
    if (label) parts.push(slug(label));
    return parts.filter(Boolean).join("_") + "." + ext;
  }

  // CSV builder for exportable lists (Department Review List).
  function toCSV(rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? "" : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\r\n");
  }

  ED.analysis = {
    FLAGS: FLAGS,
    flagInfo: flagInfo,
    priorityOrder: priorityOrder,
    statsFor: statsFor,
    heatBand: heatBand,
    HEAT_LABELS: HEAT_LABELS,
    DEMO_WARNINGS: DEMO_WARNINGS,
    esc: esc,
    pct: pct,
    toCSV: toCSV,
    exportName: exportName
  };
})();
