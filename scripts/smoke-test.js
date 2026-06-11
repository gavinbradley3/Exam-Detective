/* Smoke test — renders every view in Node and checks the output.
   Run with:  node scripts/smoke-test.js
   Catches syntax errors, broken data references, and missing
   sections before you ever open a browser. */

"use strict";

// Minimal browser stubs (views only need these at render time).
global.window = global;
global.localStorage = {
  _s: {},
  getItem: function (k) { return this._s[k] || null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};
global.location = { hash: "#/" };

var path = require("path");
var root = path.join(__dirname, "..");

// Load in the same order as index.html (app.js excluded — it touches the DOM).
[
  "js/data/demo-data.js",
  "js/analysis.js",
  "js/report-blocks.js",
  "js/views/landing.js",
  "js/views/dashboard.js",
  "js/views/wizard.js",
  "js/views/results.js",
  "js/views/comparison.js",
  "js/views/reports.js",
  "js/views/help.js",
  "js/views/settings.js"
].forEach(function (f) { require(path.join(root, f)); });

var ED = global.ED;
var failures = [];

function check(name, html, mustContain) {
  if (typeof html !== "string" || html.length < 400) {
    failures.push(name + ": output missing or suspiciously short (" + (html && html.length) + " chars)");
    return;
  }
  (mustContain || []).forEach(function (needle) {
    if (html.indexOf(needle) === -1) {
      failures.push(name + ': missing expected content "' + needle + '"');
    }
  });
  console.log("  ok  " + name + " (" + html.length + " chars)");
}

console.log("Rendering all views…");

check("landing", ED.views.landing(), ["Find the questions that need fixing", "Start New Analysis", "Responsible use"]);
check("dashboard", ED.views.dashboard(), ["Questions flagged", "Top flagged questions", "Grade 8 ELA Final Exam"]);

for (var step = 1; step <= 6; step++) {
  check("wizard step " + step, ED.views.wizard(String(step)), ["Step " + step]);
}

// Wizard with demo data loaded (exercises file rows, key grid, review tables).
var s = ED.wizard.getState();
s.demoLoaded = true;
s.resultFiles = [{ name: "8A_results.pdf", label: "8A", status: "ok" }];
s.key = ED.wizard.demoKey();
s.keySource = "demo";
ED.wizard.setState(s);
check("wizard step 2 (demo)", ED.views.wizard("2"), ["8A_results.pdf", "Question results detected"]);
check("wizard step 4 (demo)", ED.views.wizard("4"), ["Detected answer key", "Q33"]);
check("wizard step 5 (demo)", ED.views.wizard("5"), ["Review Detected Data", "Possible key mismatch", "129"]);

check("results", ED.views.results(), [
  "Teacher Review", "Questions We Need to Fix", "Key / Scoring Warning",
  "Exam Health Snapshot", "Priority Action List",
  "THE PROBLEM", "Immediate Action for This Week", "Fix for Next Year",
  "Key Audit Summary", "Department Pattern Summary", "The Takeaway",
  "The Strange Orchid", "MARKING ERROR IN GRADEBOOK", "Advanced Details"
]);

check("comparison", ED.views.comparison(), [
  "Class comparison", "Question heat map", "Widespread concerns",
  "Section-specific concerns", "Department review list", "Export this list"
]);

check("reports index", ED.views.reports(), ["Teacher Review Report", "Department / Admin Summary", "Question Bank Revision Report"]);
check("teacher review report", ED.views.reports("teacher-review"), ["Questions We Need to Fix", "The Takeaway", "Question-by-Question Review"]);
check("admin summary report", ED.views.reports("admin-summary"), ["Exam Health", "Recommended Next Steps", "Priority Action List"]);
check("question bank report", ED.views.reports("question-bank"), ["Keep, Revise, Remove", "Answer-Key Corrections", "Suggested Rewrites"]);

check("help", ED.views.help(), ["Possible Key Error", "Hard but Fair", "before changing marks"]);
check("settings", ED.views.settings(), ["Default subject", "Reset demo", "Responsible use"]);

// ---- Data sanity checks ----
console.log("Checking demo data…");
var an = ED.demo.analysis;

if (an.allQuestions.length !== 75) failures.push("expected 75 questions, got " + an.allQuestions.length);
var totalResponses = an.sections.reduce(function (a, s) { return a + s.responses; }, 0);
if (totalResponses !== 129) failures.push("section responses should total 129, got " + totalResponses);

// Every flagged question must reference a valid flag and have core fields.
an.flagged.forEach(function (f) {
  var info = ED.analysis.flagInfo(f.flag);
  if (info.priority === 9) failures.push("Q" + f.number + " has unknown flag: " + f.flag);
  ["question", "problem", "immediate", "pattern"].forEach(function (k) {
    if (!f[k]) failures.push("Q" + f.number + " missing field: " + k);
  });
  if (!f.rewrite && !f.nextYearNote) failures.push("Q" + f.number + " has no next-year guidance");
});

// Priority list must put key errors first.
var ordered = ED.analysis.priorityOrder(an.flagged.map(function (f) {
  return Object.assign({ combined: ED.analysis.statsFor(an, f.number).combinedMissed }, f);
}));
if (ordered[0].flag !== "Possible Key Error") {
  failures.push("priority list should start with Possible Key Error, got " + ordered[0].flag);
}

// CSV export sanity.
var csv = ED.analysis.toCSV([["a", 'b "quoted"'], ["c,d", "e"]]);
if (csv.indexOf('"b ""quoted"""') === -1 || csv.indexOf('"c,d"') === -1) {
  failures.push("CSV escaping is broken");
}

// ---- Result ----
if (failures.length) {
  console.error("\nFAILURES:");
  failures.forEach(function (f) { console.error("  ✗ " + f); });
  process.exit(1);
} else {
  console.log("\nAll smoke tests passed.");
}
