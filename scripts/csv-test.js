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
  "js/ai-feedback.js",
  "js/data-store.js",
  "js/cloud.js",
  "js/report-blocks.js",
  "js/views/settings.js",
  "js/views/reports.js",
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

// ---------- 10. New Analysis must be a clean slate ----------
console.log("New Analysis clean slate:");
var s1 = ED.wizard.getState();
var oldId = s1.analysisId;
s1.setup = { examName: "Old Exam", subject: "ELA", grade: "8", sections: "", notes: "" };
s1.resultFiles = [{ name: "old.csv", label: "8B", status: "parsed", format: "student rows", sections: res.sections }];
s1.examFiles = [{
  name: "old-exam.pdf", status: "parsed", kind: "exam", rawText: "9. OLD STALE Q9 TEXT\nA. old\nB. older",
  exam: { isExam: true, questions: { 9: { stem: "OLD STALE Q9 TEXT", options: { A: "old", B: "older" }, complete: true } }, found: 1, complete: 1, incomplete: [], maxQ: 9, sections: [], warnings: [] }
}];
s1.key = ["A", "B"]; s1.keyCount = 2;
s1.keyExtraction = { file: "old-key.pdf", found: 2, missing: [], conflicts: [] };
ED.wizard.setState(s1);
ED.data.setActiveUploaded(analysis); // old results still open

ok(ED.wizard.hasProgress(ED.wizard.getState()) === true, "previous session counts as progress");
var chooser = ED.views.wizard("");
ok(chooser.indexOf("Start a fresh analysis") !== -1 && chooser.indexOf("Continue the previous one") !== -1,
  "bare New Analysis shows the start-fresh choice — never silently reuses old files");
ok(chooser.indexOf("exam/passage file") !== -1 && chooser.indexOf("Old Exam") !== -1, "chooser names what's left over");

ED.actions["wizard-start-fresh"]();
var s2 = ED.wizard.getState();
ok(s2.resultFiles.length === 0 && s2.examFiles.length === 0, "fresh start clears uploaded files and parsed result data");
ok(s2.keyCount === 0 && s2.key.length === 0 && !s2.keyExtraction, "fresh start clears the answer key and extraction notices");
ok(!s2.demoLoaded && !s2.setup.examName && !s2.setup.notes, "fresh start clears demo state and setup");
ok(!!s2.analysisId && s2.analysisId !== oldId, "fresh analysis gets a new unique analysis id");
ok(ED.data.getActiveRecord() === null, "fresh start closes the previous results");
var blankWizard = ED.views.wizard("");
ok(blankWizard.indexOf("Analysis Setup") !== -1 && blankWizard.indexOf("old.csv") === -1 &&
   blankWizard.indexOf("Old Exam") === -1 && blankWizard.indexOf("old-exam.pdf") === -1,
  "wizard renders a true blank slate after reset");
ok(ED.views.wizard("2").indexOf("old.csv") === -1 && ED.views.wizard("3").indexOf("old-exam.pdf") === -1 &&
   ED.views.wizard("4").indexOf("old-key.pdf") === -1,
  "steps 2–4 show no files, no extraction notices, no key from the previous analysis");
ok(ED.views.results().indexOf("no analysis has been run") !== -1, "results page shows the honest empty state, not stale results");

// ---------- 11. No stale evidence can attach to a new analysis ----------
console.log("No stale evidence across analyses:");
var ev1 = {
  questions: { 9: { stem: "OLD STALE Q9 TEXT", options: { A: "old", B: "older" }, complete: true } },
  sections: [], passages: [],
  coverage: { withText: 1, complete: 1, incomplete: [] }, warnings: []
};
var anOne = ED.builder.build({ setup: { examName: "One" }, sections: res.sections, key: KEY, meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [], analysisId: "an-one" }, examEvidence: ev1 });
var q9a = anOne.flagged.filter(function (f) { return f.number === 9; })[0];
ok(!!q9a && q9a.question.indexOf("OLD STALE Q9 TEXT") !== -1, "analysis #1 legitimately shows its own Q9 text");
var anTwo = ED.builder.build({ setup: { examName: "Two" }, sections: res.sections, key: KEY, meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [], analysisId: "an-two" }, examEvidence: null });
var q9b = anTwo.flagged.filter(function (f) { return f.number === 9; })[0];
ok(!!q9b && q9b.question.indexOf("OLD STALE") === -1, "analysis #2's Q9 carries no stale text from analysis #1");
ok(q9b.question.indexOf("no question text uploaded") !== -1 && q9b.evidence === "Data only",
  "Q9 without exam text says “Data only / no question text uploaded”");
ok(anOne.analysisId === "an-one" && anTwo.analysisId === "an-two" && anOne.id !== anTwo.id,
  "each analysis carries its own id");

// ---------- 12. Questions with no usable answer data ----------
console.log("Questions with no recorded responses:");
var blankCsv = "Student,Section,Q1,Q2,Q3,Q4,Q5\n" +
  "S1,8A,A,B,C,D,\nS2,8A,A,B,C,D,\nS3,8A,A,B,A,D,\nS4,8A,B,B,C,D,\n";
var pb = ED.csv.parseResults(blankCsv, {});
ok(pb.ok === true && pb.sections[0].responses === 4, "csv with an all-blank question column parses");
var anBlank = ED.builder.build({ setup: { examName: "Blank Q" }, sections: pb.sections, key: ["A", "B", "C", "D", "A"], meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] } });
ok(anBlank.dataQuality.noResponses.indexOf(5) !== -1, "Q5 reported as missing response data");
var blankQ5 = anBlank.flagged.filter(function (f) { return f.number === 5; })[0];
ok(!!blankQ5 && blankQ5.flag === "Missing Response Data" && blankQ5.noData === true && blankQ5.options.length === 0,
  "Q5 gets only a Missing Response Data card — no answer-choice suggestions");
ok(anBlank.allQuestions[4].unscored === true, "Q5 is unscored — not treated as 100% missed");
ok(anBlank.openingSummary.indexOf("no recorded student responses") !== -1, "opening summary explains the exclusion in plain language");
ok(anBlank.sections[0].average === Math.round((100 + 100 + 75 + 75) / 4), "student averages exclude the blank question from the denominator");
var sBlank = ED.wizard.getState();
sBlank.setup = { examName: "Blank Q", subject: "ELA", grade: "8", sections: "", notes: "" };
sBlank.resultFiles = [{ name: "blank.csv", label: "8A", status: "parsed", format: "student rows", sections: pb.sections }];
ED.wizard.setState(sBlank);
ok(ED.views.wizard("5").indexOf("No responses for some questions") !== -1, "review step warns about blank questions before the run");

// ---------- 13. Deterministic issue categories & report quality ----------
console.log("Issue categories (deterministic rules):");
// 20 students, key A A A A A; distributions crafted per category rule.
var alloc = {
  1: { A: 2, B: 14, C: 2, D: 2 },  // decisive vote against key  -> Possible key error
  2: { A: 7, B: 8, C: 3, D: 2 },   // one strong distractor      -> Possible distractor issue
  3: { A: 6, B: 5, C: 5, D: 4 },   // scattered votes            -> Possible wording issue
  4: { A: 8, B: 4, C: 4, D: 4 },   // hard, keyed still leads    -> reteaching candidate
  5: null                          // all blank                  -> Missing response data
};
var catRows = ["Student,Section,Q1,Q2,Q3,Q4,Q5"];
for (var st = 0; st < 20; st++) {
  var cells = [];
  [1, 2, 3, 4, 5].forEach(function (q) {
    if (!alloc[q]) { cells.push(""); return; }
    var n = st, pick = "";
    ["A", "B", "C", "D"].some(function (L) {
      if (n < alloc[q][L]) { pick = L; return true; }
      n -= alloc[q][L]; return false;
    });
    cells.push(pick);
  });
  catRows.push("S" + (st + 1) + ",8A," + cells.join(","));
}
var catParsed = ED.csv.parseResults(catRows.join("\n"), {});
var catEv = {
  questions: { 3: { stem: "Which line shows the change?", options: { A: "line 1", B: "line 2", C: "line 3", D: "line 4" }, complete: true } },
  sections: [{ title: "The Story", from: 1, to: 5, passage: { title: "The Story" } }],
  passages: [{ title: "The Story", file: "p.pdf", linked: true, from: 1, to: 5, how: "marker", ranges: [] }],
  coverage: { withText: 1, complete: 1, incomplete: [] }, warnings: []
};
var catAn = ED.builder.build({
  setup: { examName: "Categories" }, sections: catParsed.sections,
  key: ["A", "A", "A", "A", "A"],
  meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] },
  examEvidence: catEv
});
function fOf(n) { return catAn.flagged.filter(function (x) { return x.number === n; })[0]; }
ok(fOf(1) && fOf(1).issueCategory === "Possible key error" && fOf(1).severity === "High", "Q1: decisive vote -> Possible key error (High)");
ok(fOf(2) && fOf(2).issueCategory === "Possible distractor issue" && fOf(2).severity === "Medium", "Q2: strong single distractor -> Possible distractor issue (Medium)");
ok(fOf(3) && fOf(3).issueCategory === "Possible wording issue", "Q3: scattered votes -> Possible wording issue");
ok(fOf(3).secondaryCategory === "Possible passage/text dependency", "Q3: linked passage adds passage/text dependency");
ok(fOf(3).question.indexOf("Which line shows the change?") !== -1, "Q3 quotes its real uploaded stem");
ok(fOf(4) && fOf(4).issueCategory === "High difficulty / reteaching candidate" && fOf(4).severity === "Low", "Q4: hard but keyed leads -> reteaching candidate (Low)");
ok(fOf(4).percentCorrect === 40, "Q4 reports percent correct (40%)");
var f5 = fOf(5);
ok(f5 && f5.flag === "Missing Response Data" && f5.issueCategory === "Missing or insufficient response data", "Q5: all blank -> Missing Response Data card");
ok(f5.noData === true && f5.options.length === 0 && f5.percentCorrect === null, "Q5 card has NO answer-choice analysis and no fake rates");
ok(catAn.flagged.every(function (f) { return f.limitations && f.limitations.length; }), "every card lists what the app can't confidently say");
ok(fOf(2).limitations.some(function (l) { return /No wording was uploaded/.test(l); }), "textless card's limitations say wording is unavailable");
ok(fOf(1).immediate !== fOf(3).immediate && fOf(2).immediate !== fOf(4).immediate, "teacher guidance differs by category (deterministic)");

// rendering: dashes for missing data, limitations block, chips
var card5 = ED.blocks.questionCard(catAn, f5);
ok(card5.indexOf("—") !== -1 && card5.indexOf('<ul class="opts">') === -1, "missing-data card renders dashes and no option rows");
ok(card5.indexOf("CAN’T CONFIDENTLY SAY") !== -1, "limitations block renders");
var card2 = ED.blocks.questionCard(catAn, fOf(2));
ok(card2.indexOf("flag-cat") !== -1 && card2.indexOf("sev-med") !== -1, "category and severity chips render");
ok(card2.indexOf("% CORRECT") !== -1, "percent-correct stat renders");

// ---------- 14. Saved-analysis management + honest cloud state ----------
console.log("Saved-analysis management:");
localStorage.setItem("examdetective.saved", "[]");
ED.data.setActiveUploaded(catAn);
var saveA = ED.data.saveCurrent("Period 3 ELA");
ok(saveA.ok && saveA.entry.summary.grade === "" && saveA.entry.summary.students === 20 && saveA.entry.archived === false,
  "saved entry carries metadata (students, archived flag)");
var ren = ED.data.renameSaved(saveA.entry.id, "Period 3 ELA — final");
ok(ren.ok && ED.data.listSaved()[0].name === "Period 3 ELA — final" && !!ren.entry.modifiedAt, "rename works and stamps modifiedAt");
ok(ED.data.renameSaved(saveA.entry.id, "  ").ok === false, "blank rename rejected with a message");

var dup = ED.data.duplicateSaved(saveA.entry.id);
ok(dup.ok && dup.entry.id !== saveA.entry.id && /\(copy\)$/.test(dup.entry.name), "duplicate creates an independent copy");
ED.data.renameSaved(dup.entry.id, "Renamed copy");
ok(ED.data.listSaved().filter(function (e) { return e.id === saveA.entry.id; })[0].name === "Period 3 ELA — final",
  "editing the copy never touches the original");

ED.data.setArchived(dup.entry.id, true);
ok(ED.data.filterSaved(ED.data.listSaved(), "", "active").length === 1, "archived entries leave the active list");
ok(ED.data.filterSaved(ED.data.listSaved(), "", "archived").length === 1, "archived view shows them");
ok(ED.data.filterSaved(ED.data.listSaved(), "period 3", "active").length === 1 &&
   ED.data.filterSaved(ED.data.listSaved(), "zzz", "active").length === 0, "search filters by name");

// saving never contaminates a new analysis
ED.wizard.startFresh();
ok(ED.wizard.getState().resultFiles.length === 0 && ED.data.getActiveRecord() === null &&
   ED.data.listSaved().length === 2, "fresh start leaves saved analyses intact and the workspace empty");
var reA = ED.data.reopenSaved(saveA.entry.id);
ok(reA.ok && ED.data.activeAnalysis().totalResponses === 20, "reopening loads exactly that saved analysis");

console.log("Cloud status (honest):");
ok(ED.cloud.status().configured === false && /not configured|AUTH_AND_STORAGE/i.test(ED.cloud.status().message),
  "cloud sync says honestly that it isn't configured");
global.ED_CONFIG = { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "a-very-long-fake-anon-key-value" };
var cs = ED.cloud.status();
ok(cs.configured === false && cs.hasConfig === true && /isn’t built/.test(cs.message),
  "even with config present, the unbuilt sync layer is reported honestly");
delete global.ED_CONFIG;

// ---------- 15. Export filenames & AI feedback in exports ----------
console.log("Exports:");
catAn.grade = "8"; catAn.subject = "ELA"; catAn.dateCreated = "2026-06-12";
var fname = ED.analysis.exportName(catAn, "data", "csv");
ok(fname === "exam-detective_categories_grade8_ela_2026-06-12_uploaded_data.csv",
  "uploaded export filename carries exam/grade/subject/date/source (" + fname + ")");
var dname = ED.analysis.exportName(ED.data.demoAnalysis(), "teacher-review", "html");
ok(dname.indexOf("_DEMO_") !== -1 && dname.indexOf("grade8") !== -1, "demo export filename carries the DEMO marker");

var fbStub = {
  issueSummary: "Choice B competed with the key.",
  likelyIssueType: "Possible distractor issue",
  evidenceBasedExplanation: "B drew 40% against the keyed A.",
  teacherReviewActions: ["Read choice B against the key"],
  suggestedRevision: null, confidence: "Medium", limitations: []
};
catAn.aiFeedback = { 2: { feedback: fbStub, extractionStatus: "none" } };
ED.data.setActiveUploaded(catAn);
var reportHtml = ED.views.reports("teacher-review");
ok(reportHtml.indexOf("AI-ASSISTED FEEDBACK") !== -1 && reportHtml.indexOf("Choice B competed") !== -1,
  "stored AI feedback appears in the exported/printed report");
delete catAn.aiFeedback;
ED.data.setActiveUploaded(catAn);
ok(ED.views.reports("teacher-review").indexOf("AI-ASSISTED FEEDBACK") === -1,
  "no AI block in reports when no feedback exists");

// ---------- 16. Answer-key gate & provenance ----------
console.log("Answer-key gate (never guess, never reuse):");
ED.wizard.startFresh();
var gateState = ED.wizard.getState();
var noKeyAgg = ED.csv.parseResults("Question,Responses,% Correct\n1,20,80\n2,20,70\n3,20,60\n4,20,50\n5,20,40", { defaultSection: "8A" });
gateState.setup = { examName: "Gate", subject: "ELA", grade: "8", sections: "", notes: "" };
gateState.resultFiles = [{ name: "8A.csv", label: "8A", status: "parsed", format: "question summary", sections: noKeyAgg.sections }];
ED.wizard.setState(gateState);
var step6NoKey = ED.views.wizard("6");
ok(step6NoKey.indexOf("Can’t run yet") !== -1 && step6NoKey.indexOf("never guesses correct answers") !== -1,
  "analysis is blocked without an answer key, with a clear explanation");
ok(ED.views.wizard("5").indexOf("Answer key needed") !== -1, "review step says the key is missing");
gateState = ED.wizard.getState();
gateState.key = ["A", "B", "C", "D", "A"]; gateState.keyCount = 5;
ED.wizard.setState(gateState);
ok(ED.views.wizard("6").indexOf("Run Analysis") !== -1, "entering the key unblocks the run");
// key/results count mismatch warning (the user's exact failure mode)
gateState = ED.wizard.getState();
gateState.key = ["A", "B", "C"]; gateState.keyCount = 3;
ED.wizard.setState(gateState);
var mism = ED.views.wizard("5");
ok(mism.indexOf("answers for 3 questions, but the student results contain 5") !== -1,
  "key/results count mismatch reported in plain language");
// files that carry their own keys (aggregate Key column) may run without a typed key
gateState = ED.wizard.getState();
gateState.key = []; gateState.keyCount = 0;
gateState.resultFiles = [{ name: "8A.csv", label: "8A", status: "parsed", format: "question summary", sections: ED.csv.parseResults(fixture("aggregate-summary.csv"), { defaultSection: "8A" }).sections }];
ED.wizard.setState(gateState);
ok(ED.views.wizard("6").indexOf("Run Analysis") !== -1, "files with embedded keyed answers can run without a typed key");

console.log("Key provenance on results:");
var provAnalysis = ED.builder.build({
  setup: { examName: "Prov", subject: "ELA", grade: "8" },
  sections: res.sections, key: KEY,
  meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [], analysisId: "an-prov" },
  keyInfo: { source: "8C key.pdf — extracted, review below", file: "8C key.pdf", entries: 10, missing: [], conflicts: [4] }
});
ED.data.setActiveUploaded(provAnalysis);
var provHtml = ED.views.results();
ok(provHtml.indexOf("Answer key used:") !== -1 && provHtml.indexOf("8C key.pdf") !== -1,
  "results page states which answer key file was used");
ok(provHtml.indexOf("10 answers extracted") !== -1 && provHtml.indexOf("matches the 10 questions") !== -1,
  "results state extraction count and that it matches the question count");
ok(provHtml.indexOf("Conflicting entries") !== -1 && provHtml.indexOf("Q4") !== -1,
  "key warnings (conflicts) surface on the results page");
var mismatchAnalysis = ED.builder.build({
  setup: { examName: "Prov2" }, sections: res.sections, key: KEY,
  meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] },
  keyInfo: { source: "Entered manually", file: null, entries: 8, missing: [], conflicts: [] }
});
ED.data.setActiveUploaded(mismatchAnalysis);
ok(ED.views.results().indexOf("count mismatch") !== -1,
  "key shorter than the results is flagged as a count mismatch on the results page");

console.log("No key reuse across analyses:");
var withKey = ED.wizard.getState();
withKey.key = ["A", "B", "C"]; withKey.keyCount = 3;
withKey.keyExtraction = { file: "old-key.pdf", found: 3, missing: [], conflicts: [] };
withKey.keySource = "old-key.pdf — extracted";
ED.wizard.setState(withKey);
ED.wizard.startFresh();
var freshKeyState = ED.wizard.getState();
ok(freshKeyState.key.length === 0 && freshKeyState.keyCount === 0 && !freshKeyState.keyExtraction && !freshKeyState.keySource,
  "a new analysis never reuses the previous analysis's answer key");
ok(ED.views.wizard("4").indexOf("old-key.pdf") === -1, "step 4 shows no trace of the old key file");

// ---------- result ----------
if (failures.length) {
  console.error("\nFAILURES:");
  failures.forEach(function (f) { console.error("  ✗ " + f); });
  process.exit(1);
} else {
  console.log("\nAll " + passed + " CSV/data-honesty tests passed.");
}
