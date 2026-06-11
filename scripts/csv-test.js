/* CSV parsing + data-honesty tests.
   Run with:  node scripts/csv-test.js
   Proves: uploaded CSVs are really parsed, one class in = one class out
   (never the demo's 5 sections / 129 students), the manual key reaches
   130 questions, settings start blank, exports state their source, and
   local save/reopen round-trips. */

"use strict";

// Minimal browser stubs.
global.window = global;
global.localStorage = {
  _s: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};
global.location = { hash: "#/" };

var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");

[
  "js/data/demo-data.js",
  "js/analysis.js",
  "js/csv-parse.js",
  "js/analysis-builder.js",
  "js/data-store.js",
  "js/report-blocks.js",
  "js/views/settings.js",
  "js/views/wizard.js",
  "js/views/results.js"
].forEach(function (f) { require(path.join(root, f)); });

var ED = global.ED;
var failures = [];
var passed = 0;

function ok(cond, name) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else failures.push(name);
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

// ---------- 1. Student-rows CSV: one class in, one class out ----------
console.log("Student-rows CSV (letters):");
var res = ED.csv.parseResults(fixture("sample-class-letters.csv"), { defaultSection: "fallback" });
ok(res.ok === true, "parses successfully");
ok(res.sections.length === 1, "ONE section detected (not the demo's 5)");
ok(res.sections[0].id === "8B", "section id read from the Section column");
ok(res.sections[0].responses === 12, "student count comes from the CSV (12, not the demo's 129)");
ok(res.sections[0].questionCount === 10, "question count detected (10)");
ok(res.sections[0].mode === "letters", "letters mode detected");

// ---------- 2. Build analysis from the upload ----------
console.log("Analysis built from uploaded data:");
var KEY = ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B"];
var analysis = ED.builder.build({
  setup: { examName: "Unit 3 Test", subject: "ELA", grade: "8" },
  sections: res.sections,
  key: KEY,
  meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] }
});
ok(analysis.source === "uploaded", "analysis is marked as uploaded data");
ok(analysis.sections.length === 1, "results show 1 section, not 5");
ok(analysis.totalResponses === 12, "results show 12 students, not 129");
ok(analysis.totalQuestions === 10, "results show 10 questions, not 75");
ok(analysis.sections[0].average === 80, "section average computed from real scores (80%)");
ok(analysis.sections[0].median === 80, "section median computed from real scores (80%)");

var q5 = analysis.flagged.filter(function (f) { return f.number === 5; })[0];
ok(!!q5 && q5.flag === "Possible Key Error", "Q5 flagged as Possible Key Error (8 of 12 chose B against keyed A)");
var q9 = analysis.flagged.filter(function (f) { return f.number === 9; })[0];
ok(!!q9 && q9.flag === "Watch List", "Q9 flagged as Watch List (75% missed, no decisive wrong answer)");
ok(analysis.flagged.filter(function (f) { return [1, 2, 3, 4, 6, 7, 8, 10].indexOf(f.number) !== -1; }).length === 0,
  "healthy questions are not flagged");
ok(analysis.keyAudit.mismatchQuestions.indexOf(5) !== -1, "key audit lists Q5");
ok(analysis.openingSummary.indexOf("12 students") !== -1, "opening summary states the real student count");

// ---------- 3. Aggregate CSV ----------
console.log("Aggregate CSV (one row per question):");
var agg = ED.csv.parseResults(fixture("aggregate-summary.csv"), { defaultSection: "8A" });
ok(agg.ok === true, "parses successfully");
ok(agg.sections[0].responses === 28, "responses read from the Responses column (28)");
ok(agg.sections[0].questions[4].missedPct === 82, "Q4 percent missed derived from % Correct (82)");
ok(agg.sections[0].questions[1].keyedFromFile === "A", "key column read from the file");
var aggAnalysis = ED.builder.build({ setup: { examName: "Agg" }, sections: agg.sections, key: null, meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] } });
ok(aggAnalysis.totalResponses === 28, "aggregate analysis shows 28 students");
ok(aggAnalysis.combinedMedian === null, "median honestly null for aggregate files");
ok(aggAnalysis.flagged.some(function (f) { return f.number === 4; }), "Q4 (82% missed) is flagged");

// ---------- 4. Messy / unusable CSVs don't crash, errors are friendly ----------
console.log("Messy input:");
var bad = ED.csv.parseResults("hello world\nthis,is,not,results");
ok(bad.ok === false, "nonsense file is rejected, not faked");
ok(/Question|columns|layout/i.test(bad.error), "error explains what columns are needed");
var empty = ED.csv.parseResults("");
ok(empty.ok === false, "empty file is rejected with a message");
var quoted = ED.csv.parseResults('Student,Section,Q1,Q2\n"Doe, Jane",8C,A,B\n"Smith ""Smitty"" Sam",8C,B,A');
ok(quoted.ok === true && quoted.sections[0].responses === 2, "quoted commas and escaped quotes are handled");

// ---------- 5. Manual answer key supports 130 questions ----------
console.log("130-question answer key:");
ok(ED.csv.MAX_QUESTIONS === 130, "parser accepts question columns up to Q130");
ok(ED.wizard.MAX_Q === 130, "wizard key limit is 130");

// 130-question CSV end-to-end
var header130 = ["Student", "Section"];
for (var q = 1; q <= 130; q++) header130.push("Q" + q);
var row130a = ["S1", "9C"], row130b = ["S2", "9C"];
for (q = 1; q <= 130; q++) { row130a.push("A"); row130b.push(q === 130 ? "B" : "A"); }
var csv130 = header130.join(",") + "\n" + row130a.join(",") + "\n" + row130b.join(",");
var res130 = ED.csv.parseResults(csv130, {});
ok(res130.ok && res130.sections[0].questionCount === 130, "a 130-question CSV parses with all 130 questions");
var key130 = [];
for (q = 1; q <= 130; q++) key130.push("A");
var an130 = ED.builder.build({ setup: { examName: "Big exam" }, sections: res130.sections, key: key130, meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] } });
ok(an130.allQuestions.length === 130, "analysis covers question 130");
ok(an130.allQuestions[129].missedBySection["9C"] === 50, "question 130 is scored (1 of 2 students missed = 50%)");

// key entry actions (no DOM needed)
localStorage.removeItem("examdetective.wizard");
ED.app = { rerender: function () {} };
ED.actions["wizard-key-count"]({ value: "130", getAttribute: function () { return null; } });
var ws = ED.wizard.getState();
ok(ws.keyCount === 130 && ws.key.length === 130, "key grid state holds 130 entries");
ED.actions["wizard-key-edit"]({ value: "E", getAttribute: function (a) { return a === "data-q" ? "130" : null; } });
ws = ED.wizard.getState();
ok(ws.key[129] === "E", "question 130's key can be set and is saved");
ED.actions["wizard-key-count"]({ value: "200", getAttribute: function () { return null; } });
ok(ED.wizard.getState().keyCount === 130, "key count is clamped to the 130 maximum");

// ---------- 6. Settings start blank ----------
console.log("Settings:");
localStorage.removeItem("examdetective.settings");
var s = ED.settings.get();
ok(s.subject === "" && s.grade === "" && s.exportFormat === "", "settings start blank — no pre-filled choices");
var settingsHtml = ED.views.settings();
ok(settingsHtml.indexOf('id="set-subject" value=""') !== -1, "settings page renders empty subject field");
ok(settingsHtml.indexOf("Still to decide") !== -1, "settings page tells the user what's still unchosen");

// ---------- 7. Wizard step-1 validation ----------
console.log("Wizard validation:");
var fields = { "w-exam": "", "w-subject": "", "w-grade": "", "w-sections": "", "w-notes": "" };
global.document = { getElementById: function (id) { return { value: fields[id] !== undefined ? fields[id] : "" }; }, addEventListener: function () {} };
var sawErrors = null;
ED.app = { rerender: function () { sawErrors = ED.wizard._setupErrors; } };
location.hash = "#/new-analysis/1";
ED.actions["wizard-save-setup"]();
ok(sawErrors && sawErrors.examName && sawErrors.subject && sawErrors.grade, "blank required fields produce friendly errors");
ok(location.hash === "#/new-analysis/1", "user can't move forward with missing required settings");
fields["w-exam"] = "Unit 3 Test"; fields["w-subject"] = "ELA"; fields["w-grade"] = "8";
ED.actions["wizard-save-setup"]();
ok(location.hash === "#/new-analysis/2", "valid setup advances to step 2");

// ---------- 8. Exports state their source ----------
console.log("Exports:");
ED.data.setActiveUploaded(analysis);
var rows = ED.exportData.rows(ED.data.activeAnalysis());
var flat = rows.map(function (r) { return r.join(","); }).join("\n");
ok(flat.indexOf("Uploaded data") !== -1, "uploaded export says it's uploaded data");
ok(flat.indexOf("DEMO") === -1, "uploaded export contains no demo marker");
ok(flat.indexOf("8B") !== -1 && rows[4][1] === 12, "uploaded export carries the real section and 12 students");
ED.data.setActiveDemo();
var demoRows = ED.exportData.rows(ED.data.activeAnalysis());
ok(demoRows[1][1].indexOf("DEMO DATA") !== -1, "demo export clearly says DEMO DATA");

// ---------- 9. Local save / reopen ----------
console.log("Saved analyses (local storage):");
ED.data.setActiveUploaded(analysis);
var save = ED.data.saveCurrent("My class test");
ok(save.ok === true, "active analysis saves");
ok(ED.data.listSaved().length === 1, "saved list has one entry");
ED.data.setActiveDemo();
var reopen = ED.data.reopenSaved(save.entry.id);
ok(reopen.ok === true, "saved analysis reopens");
var reopened = ED.data.activeAnalysis();
ok(reopened.source === "uploaded" && reopened.totalResponses === 12, "reopened analysis is the uploaded one (12 students), not demo");
var backup = ED.data.exportBackup();
ok(JSON.parse(backup).saved.length === 1, "JSON backup includes the saved analysis");
localStorage.setItem("examdetective.saved", "[]");
var imp = ED.data.importBackup(backup);
ok(imp.ok === true && ED.data.listSaved().length === 1, "JSON backup imports back");
var badImp = ED.data.importBackup("{\"nope\":true}");
ok(badImp.ok === false, "invalid backup file is rejected with a message");

// ---------- result ----------
if (failures.length) {
  console.error("\nFAILURES:");
  failures.forEach(function (f) { console.error("  ✗ " + f); });
  process.exit(1);
} else {
  console.log("\nAll " + passed + " CSV/data-honesty tests passed.");
}
