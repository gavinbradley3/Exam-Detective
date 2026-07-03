/* Real-file regression suite — runs the four ACTUAL teacher uploads
   (SmartMarks results, compact multi-column key, questions booklet,
   readings booklet) through the full ingestion pipeline.
   Run with:  node scripts/real-pdf-test.js */

"use strict";

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
[
  "js/data/demo-data.js", "js/analysis.js", "js/csv-parse.js", "js/xlsx-parse.js",
  "js/pdf-extract.js", "js/ingest.js", "js/exam-parse.js", "js/analysis-builder.js",
  "js/ai-feedback.js", "js/deep-review.js", "js/data-store.js", "js/cloud.js", "js/report-blocks.js",
  "js/views/wizard.js", "js/views/results.js"
].forEach(function (f) { require(path.join(root, f)); });

var ED = global.ED;
ED.app = { rerender: function () {} };
var failures = [];
var passed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else failures.push(name);
}
function fx(n) {
  var b = fs.readFileSync(path.join(__dirname, "fixtures", "real", n));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

(async function () {

  // ---------- classification ----------
  console.log("Document classification:");
  var texts = {};
  for (var n of ["8C_2026.pdf", "answer_key_grade8.pdf", "questions_booklet.pdf", "readings_booklet.pdf"]) {
    texts[n] = await ED.pdf.extractText(fx(n));
    ok(texts[n].ok, n + " text-extracts (CID/CMap decoding)");
  }
  ok(ED.ingest.classify(texts["8C_2026.pdf"].text).type === "student_results", "8C classified student_results");
  ok(ED.ingest.classify(texts["answer_key_grade8.pdf"].text).type === "answer_key", "key classified answer_key");
  ok(ED.ingest.classify(texts["questions_booklet.pdf"].text).type === "questions_booklet", "questions classified questions_booklet");
  ok(ED.ingest.classify(texts["readings_booklet.pdf"].text).type === "readings_booklet", "readings classified readings_booklet");
  ok(ED.ingest.classify("random words here").type === "unknown_or_failed", "junk classified unknown_or_failed");

  // ---------- SmartMarks result PDF ----------
  console.log("SmartMarks result PDF (8C 2026):");
  var r = await ED.pdf.extractResults(fx("8C_2026.pdf"), { defaultSection: "8C", fileName: "8C_2026.pdf" });
  ok(r.ok === true && /SmartMarks/.test(r.format), "accepted by the SmartMarks adapter");
  var sec = r.sections[0];
  ok(sec.responses === 26, "26 responses extracted");
  ok(sec.questionCount === 75, "75 questions extracted");
  var contiguous = true;
  for (var q = 1; q <= 75; q++) if (!sec.questions[q]) contiguous = false;
  ok(contiguous, "question numbers are continuous 1–75");
  [[1, "D", 58, { A: 27, B: 12, C: 4, D: 58 }],
   [3, "B", 19, { A: 62, B: 19, C: 12, D: 8 }],
   [33, "D", 0, { A: 4, B: 4, C: 92, D: 0 }],
   [67, "C", 12, { A: 15, B: 50, C: 12, D: 23 }],
   [75, "C", 35, { A: 19, B: 12, C: 35, D: 35 }]].forEach(function (t) {
    var qd = sec.questions[t[0]];
    var distOk = qd.distribution && ["A", "B", "C", "D"].every(function (L) { return qd.distribution[L] === t[3][L]; });
    ok(qd.keyedFromFile === t[1] && (100 - qd.missedPct) === t[2] && distOk,
      "Q" + t[0] + " = " + t[1] + ", " + t[2] + "% correct, dist " + JSON.stringify(t[3]));
  });
  ok(r.warnings.some(function (w) { return /estimated/.test(w); }), "estimated-counts warning present");
  var allCorrect = true;
  for (q = 1; q <= 75; q++) if (!sec.questions[q].keyedFromFile) allCorrect = false;
  ok(allCorrect, "every question has exactly one Marks=1.0 correct answer");

  // ---------- answer key PDF ----------
  console.log("Answer key PDF (compact multi-column, 75 answers):");
  var k = await ED.pdf.extractKey(fx("answer_key_grade8.pdf"));
  ok(k.ok === true, "accepted");
  ok(k.found === 75 && k.key.length === 75, "75 answers extracted");
  ok(k.key[0] === "D", "Q1 = D");
  ok(k.key[32] === "B", "Q33 = B");
  ok(k.key[62] === "D", "Q63 = D");
  ok(k.key[74] === "C", "Q75 = C");
  ok(k.missing.length === 0 && k.conflicts.length === 0, "no missing or duplicate entries in this key");
  var dup = ED.pdf.keyFromText("1. A 2. B 3. C 2. D 5. A");
  ok(dup.conflicts.length === 1 && dup.missing.indexOf(4) !== -1, "duplicates and gaps are flagged (synthetic check)");

  // ---------- questions booklet ----------
  console.log("Questions booklet:");
  var qb = await ED.examText.parseExamPDF(fx("questions_booklet.pdf"));
  ok(qb.ok === true && qb.found === 75, "75 questions extracted");
  ok(Object.keys(qb.questions).every(function (n) { return ["A", "B", "C", "D"].every(function (L) { return qb.questions[n].options[L]; }); }),
    "every question has A/B/C/D answer choices");
  ok(qb.sections.length === 11, "11 section/question-range mappings extracted");
  ok([70, 71, 72, 73, 74, 75].every(function (n) { return qb.questions[n].visualDependency && qb.questions[n].visualType === "comic"; }),
    "Questions 70–75 marked comic-dependent");
  ok(qb.questions[63].visualDependency === true && qb.questions[63].visualType === "image",
    "Question 63 marked image-dependent (“There’s a Whole Lot of Shaking Going On”)");

  // ---------- readings booklet ----------
  console.log("Readings booklet:");
  var rb = await ED.examText.parseExamPDF(fx("readings_booklet.pdf"));
  ok(rb.isReadings === true && rb.selections.length === 11, "11 reading selections detected");
  [["The Strange Orchid", 1, 15], ["LOST", 16, 18], ["Missing Out on Joys of River Cruising", 19, 23],
   ["My Left Foot", 24, 30], ["Time", 31, 33], ["Unicorn-like Blind Fish", 34, 42],
   ["The King", 43, 53], ["To Look At Any Thing", 54, 56],
   ["Earhquakes: Rock the World", 57, 63], // (typo is in the source document)
   ["The Power of Love to Transform and to Heal", 64, 69]].forEach(function (t) {
    var s = rb.selections.filter(function (x) { return x.title.indexOf(t[0]) === 0; })[0];
    ok(!!s && s.from === t[1] && s.to === t[2], "“" + t[0] + "” → Q" + t[1] + "–" + t[2]);
  });
  var comic = rb.selections[10];
  ok(comic.title === "Calvin and Hobbes" || comic.genre === "comic", "Calvin and Hobbes selection found");
  ok(comic.from === 70 && comic.to === 75 && comic.isVisual === true, "comic mapped to Q70–75 and marked visual evidence");
  ok(rb.selections.filter(function (s) { return s.lineNumbered; }).length >= 7, "line-numbered passages detected");
  ok((texts["readings_booklet.pdf"].visualPages || []).length >= 3, "pages with embedded images detected");
  ok(rb.warnings && rb.warnings.some(function (w) { return /OCR|vision|by eye/i.test(w); }),
    "image pages honestly flagged as not machine-readable");

  // ---------- wrong-document routing ----------
  console.log("Cross-routing:");
  var wrong1 = await ED.pdf.extractResults(fx("answer_key_grade8.pdf"), { fileName: "answer_key_grade8.pdf" });
  ok(wrong1.ok === false && /Step 4/.test(wrong1.error), "key in the results slot → routed to Step 4");
  var wrong2 = await ED.pdf.extractResults(fx("questions_booklet.pdf"), { fileName: "q.pdf" });
  ok(wrong2.ok === false && /QUESTIONS BOOKLET/.test(wrong2.error), "questions booklet in results slot → routed to Step 3");
  var wrong3 = await ED.pdf.extractKey(fx("8C_2026.pdf"));
  ok(wrong3.ok === false && /Step 2/.test(wrong3.error), "results report in the key slot → routed to Step 2");

  // ---------- full flow: fresh analysis from the four real files ----------
  console.log("Full flow (results + key + questions + readings):");
  ED.wizard.startFresh();
  var evidence = ED.examText.assemble([
    { kind: "exam", name: "questions_booklet.pdf", exam: qb },
    { kind: "readings", name: "readings_booklet.pdf", selections: rb.selections }
  ]);
  ok(evidence.coverage.withText === 75, "evidence covers all 75 questions");
  ok(evidence.passages.length === 11 && evidence.passages.every(function (p) { return p.linked; }),
    "all 11 passages linked via explicit question ranges");
  var an = ED.builder.build({
    setup: { examName: "ELA 8 Final 2026", subject: "ELA", grade: "8" },
    sections: r.sections, key: k.key,
    meta: { filesUploaded: 4, filesParsed: 4, unparsedFiles: [], analysisId: "an-real" },
    examEvidence: evidence,
    keyInfo: { source: "answer_key_grade8.pdf — extracted", file: "answer_key_grade8.pdf", entries: 75, missing: [], conflicts: [] },
    uploadAudit: [
      { name: "8C_2026.pdf", type: "PDF · SmartMarks item analysis", pages: 15, images: 12, extracted: "26 students · 75 questions", warnings: 1, safe: true, note: "" },
      { name: "readings_booklet.pdf", type: "readings_booklet", pages: 21, images: 5, extracted: "11 reading selections", warnings: 1, safe: true, note: "" }
    ]
  });
  ok(an.totalResponses === 26 && an.totalQuestions === 75 && an.sections.length === 1,
    "analysis: 26 students / 75 questions / 1 section — never the demo's 129/75/5");
  ok(an.keyAudit.mismatchQuestions.indexOf(33) !== -1,
    "Q33 key conflict caught (key document says B, report Marks column says D)");
  var f33 = an.flagged.filter(function (f) { return f.number === 33; })[0];
  ok(!!f33 && f33.flag === "Possible Key Error", "Q33 flagged Possible Key Error");
  var visualFlagged = an.flagged.filter(function (f) { return f.visualDependency; });
  ok(visualFlagged.length > 0 && visualFlagged.every(function (f) {
    return f.limitations.some(function (l) { return /OCR|vision|by eye/i.test(l); });
  }), "flagged visual-dependent questions carry the visual-evidence-required limitation");
  var packet = ED.ai.buildPacket(an, visualFlagged[0] || f33);
  if (visualFlagged.length) {
    ok(packet.visualEvidence && packet.visualEvidence.required === true, "AI evidence packet carries the visual-evidence flag");
  }
  // Deep Review evidence packet for the real Q33 (the gold-report key error):
  // the packet must carry everything the AI needs to conclude "rescore".
  var dp33 = ED.deepReview.buildPacket(an, f33);
  ok(dp33 && dp33.questionNumber === 33 && dp33.uploadedKeyAnswer === "B",
    "deep packet Q33: keyed answer B from the uploaded key document");
  ok(dp33.strongestWrongAnswer && dp33.strongestWrongAnswer.beatsKey === true,
    "deep packet Q33: strongest wrong answer decisively beats the key");
  ok(dp33.questionStem !== null && /main idea/i.test(dp33.questionStem),
    "deep packet Q33: real extracted stem included");
  ok(dp33.totalStudents === 26 && dp33.aggregateOnly === true,
    "deep packet Q33: honest about aggregate-only data (SmartMarks report has no per-student rows)");
  ok(!/"S\d+"/.test(JSON.stringify(dp33)), "deep packet Q33: no student identifiers");

  ED.data.setActiveUploaded(an);
  var html = ED.views.results();
  ok(html.indexOf("26 students") !== -1 && html.indexOf("129") === -1 && html.indexOf("Strange Orchid (Questions") === -1,
    "results page shows real numbers, no demo fallback");
  ok(html.indexOf("Upload &amp; Readability Audit") !== -1 && html.indexOf("SmartMarks") !== -1,
    "upload/readability audit rendered with detected types");
  ok(html.indexOf("answer_key_grade8.pdf") !== -1, "results state which answer key was used");
  ok(html.indexOf("isn’t built yet") === -1 && html.indexOf("Export your results as CSV") === -1,
    "no stale CSV-fallback language anywhere");

  // clean slate: nothing of this survives a fresh start
  ED.wizard.startFresh();
  var ws = ED.wizard.getState();
  ok(ws.resultFiles.length === 0 && ws.examFiles.length === 0 && ws.key.length === 0 && ED.data.getActiveRecord() === null,
    "fresh start clears all four real files, the key, and the results");

  if (failures.length) {
    console.error("\nFAILURES:");
    failures.forEach(function (f) { console.error("  ✗ " + f); });
    process.exit(1);
  }
  console.log("\nAll " + passed + " real-file regression tests passed.");
})().catch(function (e) { console.error("Test run crashed:", e); process.exit(1); });
