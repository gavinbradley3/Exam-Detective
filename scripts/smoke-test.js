/* Smoke test — renders every view in Node and checks the output.
   Run with:  node scripts/smoke-test.js
   (Data-honesty and CSV parser tests live in scripts/csv-test.js.)
   Catches syntax errors, broken data references, and missing
   sections before you ever open a browser. */

"use strict";

// Minimal browser stubs (views only need these at render time).
global.window = global;
global.localStorage = {
  _s: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};
global.location = { hash: "#/" };
global.document = { getElementById: function () { return null; }, addEventListener: function () {} };

var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");

// Load in the same order as index.html (app.js excluded — it touches the DOM).
[
  "js/data/demo-data.js",
  "js/analysis.js",
  "js/csv-parse.js",
  "js/analysis-builder.js",
  "js/data-store.js",
  "js/report-blocks.js",
  "js/views/landing.js",
  "js/views/dashboard.js",
  "js/views/wizard.js",
  "js/views/results.js",
  "js/views/comparison.js",
  "js/views/reports.js",
  "js/views/saved.js",
  "js/views/login.js",
  "js/views/help.js",
  "js/views/settings.js"
].forEach(function (f) { require(path.join(root, f)); });

var ED = global.ED;
ED.app = { rerender: function () {} }; // actions call this after state changes
var failures = [];

function check(name, html, mustContain, mustNotContain) {
  if (typeof html !== "string" || html.length < 300) {
    failures.push(name + ": output missing or suspiciously short (" + (html && html.length) + " chars)");
    return;
  }
  (mustContain || []).forEach(function (needle) {
    if (html.indexOf(needle) === -1) {
      failures.push(name + ': missing expected content "' + needle + '"');
    }
  });
  (mustNotContain || []).forEach(function (needle) {
    if (html.indexOf(needle) !== -1) {
      failures.push(name + ': contains forbidden content "' + needle + '"');
    }
  });
  console.log("  ok  " + name + " (" + html.length + " chars)");
}

console.log("— Views with NO active analysis (honest empty states) —");
check("landing", ED.views.landing(), ["Find the questions that need fixing", "Start New Analysis", "Responsible use"]);
check("dashboard (empty)", ED.views.dashboard(), ["No analysis yet", "Saved analyses"], ["129 students"]);
check("results (empty)", ED.views.results(), ["no analysis has been run", "Open the demo results"], ["129"]);
check("comparison (empty)", ED.views.comparison(), ["Nothing to compare"]);
check("reports (empty)", ED.views.reports(), ["none has been run"]);
check("login", ED.views.login(), ["Sign in with Google", "Not connected", "local profile", "AUTH_AND_STORAGE_PLAN"]);
check("saved (empty)", ED.views.saved(), ["Nothing saved yet", "local storage"]);
check("help", ED.views.help(), ["Possible Key Error", "Hard but Fair", "before changing marks"]);
check("settings", ED.views.settings(), ["Default subject", "Still to decide", "Responsible use", 'value=""']);

console.log("— Wizard (fresh) —");
for (var step = 1; step <= 6; step++) {
  check("wizard step " + step, ED.views.wizard(String(step)), ["Step " + step]);
}
check("wizard step 1 required fields", ED.views.wizard("1"), ["required", "Exam name"]);
check("wizard step 2 honest formats", ED.views.wizard("2"), ["not yet parsed", "sample CSV", "No result files yet"]);
check("wizard step 5 (no files)", ED.views.wizard("5"), ["Nothing to review yet"]);
check("wizard step 6 (blocked)", ED.views.wizard("6"), ["Can’t run yet"]);

console.log("— Wizard (demo mode) —");
ED.actions["wizard-load-demo"]();
check("wizard step 2 (demo)", ED.views.wizard("2"), ["Demo mode", "Leave demo mode"]);
check("wizard step 4 (demo key)", ED.views.wizard("4"), ["Number of questions", "Paste a key", "1–10", "71–75"]);
check("wizard step 5 (demo)", ED.views.wizard("5"), ["Demo mode", "Possible key mismatch", "129"]);
check("wizard step 6 (demo)", ED.views.wizard("6"), ["Run Analysis", "Demo mode"]);

console.log("— Wizard (uploaded mode) —");
var csvText = fs.readFileSync(path.join(__dirname, "fixtures", "sample-class-letters.csv"), "utf8");
var parsed = ED.csv.parseResults(csvText, { defaultSection: "8B" });
var ws = ED.wizard.getState();
ws.demoLoaded = false;
ws.setup = { examName: "Unit 3 Test", subject: "ELA", grade: "8", sections: "", notes: "" };
ws.resultFiles = [
  { name: "8B-results.csv", label: "8B", status: "parsed", format: parsed.format, sections: parsed.sections, parseWarnings: parsed.warnings },
  { name: "8C-results.pdf", status: "unsupported", statusText: "PDF parsing isn’t built yet. Export this report as CSV to analyze it now." }
];
ws.key = ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B"];
ws.keyCount = 10;
ED.wizard.setState(ws);
check("wizard step 2 (uploaded)", ED.views.wizard("2"), ["8B-results.csv", "Parsed — 12 students", "Accepted, not analyzed"]);
check("wizard step 5 (uploaded)", ED.views.wizard("5"), ["Uploaded Data", "12 students", "won’t be analyzed"], ["129", "Possible key mismatch"]);
check("wizard step 6 (uploaded)", ED.views.wizard("6"), ["Run Analysis"], ["Demo mode"]);

console.log("— Results & reports from UPLOADED data —");
var analysis = ED.builder.build({
  setup: ws.setup,
  sections: parsed.sections,
  key: ws.key,
  meta: { filesUploaded: 2, filesParsed: 1, unparsedFiles: ["8C-results.pdf"] }
});
ED.data.setActiveUploaded(analysis);
check("results (uploaded)", ED.views.results(), [
  "Uploaded Data", "12 students", "1 section", "8C-results.pdf",
  "Priority Action List", "The Takeaway", "hasn’t read the exam text"
], ["129 students", "Demo Data", "Strange Orchid"]);
check("dashboard (uploaded)", ED.views.dashboard(), ["Unit 3 Test", "Uploaded Data"], ["129"]);
check("comparison (uploaded, 1 section)", ED.views.comparison(), ["Needs at least two sections", "Uploaded Data"], ["129"]);
check("teacher review (uploaded)", ED.views.reports("teacher-review"), ["Uploaded Data", "The Takeaway"], ["129", "Strange Orchid"]);
check("admin summary (uploaded)", ED.views.reports("admin-summary"), ["Exam Health", "Recommended Next Steps"], ["129"]);
check("question bank (uploaded)", ED.views.reports("question-bank"), ["Keep, Revise, Remove", "doesn’t do yet"], ["129"]);

console.log("— Results & reports from DEMO data (explicitly chosen) —");
ED.data.setActiveDemo();
check("results (demo)", ED.views.results(), [
  "Demo Data", "Questions We Need to Fix", "Key / Scoring Warning",
  "Exam Health Snapshot", "Priority Action List",
  "THE PROBLEM", "Immediate Action for This Week", "Fix for Next Year",
  "Key Audit Summary", "Department Pattern Summary", "The Takeaway",
  "The Strange Orchid", "MARKING ERROR IN GRADEBOOK", "Advanced Details"
]);
check("dashboard (demo)", ED.views.dashboard(), ["Demo Data", "Top flagged questions"]);
check("comparison (demo)", ED.views.comparison(), [
  "Demo Data", "Class comparison", "Question heat map", "Widespread concerns",
  "Section-specific concerns", "Department review list", "Export this list"
]);
check("reports index (demo)", ED.views.reports(), ["Demo Data", "Teacher Review Report", "Department / Admin Summary", "Question Bank Revision Report"]);
check("teacher review (demo)", ED.views.reports("teacher-review"), ["Questions We Need to Fix", "The Takeaway", "Demo Data"]);
check("admin summary (demo)", ED.views.reports("admin-summary"), ["Exam Health", "Recommended Next Steps", "Priority Action List"]);
check("question bank (demo)", ED.views.reports("question-bank"), ["Keep, Revise, Remove", "Answer-Key Corrections", "Suggested Rewrites"]);

console.log("— Saved analyses view with content —");
ED.data.saveCurrent("Demo save");
check("saved (with entry)", ED.views.saved(), ["Demo save", "Reopen", "Export backup"]);

// ---- Data sanity checks (demo dataset) ----
console.log("— Demo data sanity —");
var an = ED.demo.analysis;
if (an.allQuestions.length !== 75) failures.push("expected 75 demo questions, got " + an.allQuestions.length);
var totalResponses = an.sections.reduce(function (a, s) { return a + s.responses; }, 0);
if (totalResponses !== 129) failures.push("demo section responses should total 129, got " + totalResponses);

an.flagged.forEach(function (f) {
  var info = ED.analysis.flagInfo(f.flag);
  if (info.priority === 9) failures.push("Q" + f.number + " has unknown flag: " + f.flag);
  ["question", "problem", "immediate", "pattern"].forEach(function (k) {
    if (!f[k]) failures.push("Q" + f.number + " missing field: " + k);
  });
  if (!f.rewrite && !f.nextYearNote) failures.push("Q" + f.number + " has no next-year guidance");
});

var ordered = ED.analysis.priorityOrder(an.flagged.map(function (f) {
  return Object.assign({ combined: ED.analysis.statsFor(an, f.number).combinedMissed }, f);
}));
if (ordered[0].flag !== "Possible Key Error") {
  failures.push("priority list should start with Possible Key Error, got " + ordered[0].flag);
}

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
