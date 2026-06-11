/* XLSX + PDF-key parsing tests.
   Run with:  node scripts/xlsx-pdf-test.js
   Fixtures are REAL files (ZIP/deflate XLSX, FlateDecode PDFs) built by
   scripts/make-fixtures.js, so these tests exercise the same
   DecompressionStream path browsers use. Also proves uploaded
   XLSX/PDF-key data never falls back to demo numbers. */

"use strict";

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
  "js/xlsx-parse.js",
  "js/pdf-extract.js",
  "js/analysis-builder.js",
  "js/data-store.js",
  "js/report-blocks.js",
  "js/views/results.js"
].forEach(function (f) { require(path.join(root, f)); });

var ED = global.ED;
ED.actions = ED.actions || {};
var failures = [];
var passed = 0;

function ok(cond, name) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else failures.push(name);
}

function fixture(name) {
  var buf = fs.readFileSync(path.join(__dirname, "fixtures", name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Buffer.from(...).buffer would expose Node's shared 8KB pool (containing
// other test data!) — slice to exactly the string's bytes instead.
function bytesOf(str) {
  var buf = Buffer.from(str);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function main() {

  // ---------- 1. Student-rows XLSX ----------
  console.log("Student-rows XLSX:");
  var res = await ED.xlsx.parseResults(fixture("student-rows.xlsx"), { defaultSection: "fallback" });
  ok(res.ok === true, "parses successfully");
  ok(res.sections.length === 1, "ONE section detected");
  ok(res.sections[0].id === "8B", "section id read from the Section column inside the sheet");
  ok(res.sections[0].responses === 12, "student count from the XLSX (12, not the demo's 129)");
  ok(res.sections[0].questionCount === 10, "question count detected (10)");
  ok(/XLSX/.test(res.format), "format reported as XLSX");

  // same analysis results as the equivalent CSV
  var KEY = ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B"];
  var analysis = ED.builder.build({
    setup: { examName: "XLSX Test", subject: "ELA", grade: "8" },
    sections: res.sections,
    key: KEY,
    meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] }
  });
  ok(analysis.totalResponses === 12 && analysis.sections.length === 1, "analysis shows 12 students / 1 section — no demo fallback");
  ok(analysis.sections[0].average === 80, "same average as the equivalent CSV (80%)");
  var q5 = analysis.flagged.filter(function (f) { return f.number === 5; })[0];
  ok(!!q5 && q5.flag === "Possible Key Error", "Q5 key-error flag matches the CSV result");

  // ---------- 2. Question-rows (aggregate) XLSX with numeric cells ----------
  console.log("Question-rows XLSX:");
  var agg = await ED.xlsx.parseResults(fixture("question-rows.xlsx"), { defaultSection: "8A" });
  ok(agg.ok === true, "parses successfully");
  ok(agg.sections[0].responses === 28, "responses read from numeric cells (28)");
  ok(agg.sections[0].questions[4].missedPct === 82, "Q4 percent missed derived from numeric % Correct (82)");
  ok(agg.sections[0].questions[1].keyedFromFile === "A", "key column read");
  ok(agg.sections[0].id === "Item Summary", "meaningful sheet name used as the section label");

  // ---------- 3. Multi-sheet XLSX ----------
  console.log("Multi-sheet XLSX:");
  var multi = await ED.xlsx.parseResults(fixture("multi-sheet.xlsx"), { defaultSection: "file" });
  ok(multi.ok === true, "parses successfully");
  ok(multi.sections.length === 2, "two result sheets become two sections");
  var ids = multi.sections.map(function (s) { return s.id; }).sort().join(",");
  ok(ids === "8A,8B", "sheet names become section labels (8A, 8B)");
  ok(multi.sheetCount === 3, "all three sheets were seen");
  ok(multi.warnings.some(function (w) { return /Notes/.test(w) && /skipped/.test(w); }), "non-result sheet honestly reported as skipped");
  var multiAnalysis = ED.builder.build({
    setup: { examName: "Multi" }, sections: multi.sections,
    key: ["A", "B", "C", "D", "A"],
    meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [] }
  });
  ok(multiAnalysis.sections.length === 2 && multiAnalysis.totalResponses === 20, "analysis: 2 sections, 20 students — not demo's 5/129");

  // ---------- 4. XLSX answer key ----------
  console.log("XLSX answer key:");
  var xkey = await ED.xlsx.extractKey(fixture("answer-key.xlsx"));
  ok(xkey.ok === true, "extracts successfully");
  ok(xkey.key.join("") === "ABCDABCDAB", "all 10 letters correct");
  ok(xkey.found === 10, "reports 10 entries found");

  // ---------- 5. Bad XLSX ----------
  console.log("Bad XLSX input:");
  var notZip = await ED.xlsx.parseResults(bytesOf("this is just text pretending"), {});
  ok(notZip.ok === false && /ZIP|xlsx|CSV/i.test(notZip.error), "non-ZIP file rejected with a helpful message");
  var noResults = await ED.xlsx.extractKey(fixture("student-rows.xlsx"));
  ok(noResults.ok === false && /Key|Answer/i.test(noResults.error), "workbook without a key column explains what's needed");

  // ---------- 6. PDF answer key (text-based) ----------
  console.log("PDF answer key:");
  var pkey = await ED.pdf.extractKey(fixture("answer-key.pdf"));
  ok(pkey.ok === true, "extracts from a real FlateDecode text PDF");
  ok(pkey.key.join("") === "ABCDABCDAB", "all 10 letters correct");
  ok(pkey.missing.length === 0 && pkey.conflicts.length === 0, "complete key: nothing missing, no conflicts");

  // ---------- 7. Partial PDF key ----------
  console.log("Partial PDF key:");
  var partial = await ED.pdf.extractKey(fixture("answer-key-partial.pdf"));
  ok(partial.ok === true, "partial key still extracts");
  ok(partial.missing.join(",") === "6,7", "honestly reports questions 6 and 7 as missing");
  ok(partial.key[5] === "" && partial.key[6] === "", "missing entries left blank, not guessed");
  ok(partial.key[7] === "D", "present entries (Q8=D) extracted correctly");

  // ---------- 8. Scanned PDF ----------
  console.log("Scanned PDF:");
  var scanned = await ED.pdf.extractKey(fixture("scanned.pdf"));
  ok(scanned.ok === false, "image-only PDF is rejected, not faked");
  ok(scanned.kind === "scanned", "detected as a scan");
  ok(/OCR/.test(scanned.error), "error says honestly that there's no OCR");
  var notPdf = await ED.pdf.extractKey(bytesOf("not a pdf at all"));
  ok(notPdf.ok === false, "non-PDF rejected");

  // ---------- 9. Exports from XLSX-derived data stay scoped ----------
  console.log("Export scoping:");
  ED.data.setActiveUploaded(analysis);
  var rows = ED.exportData.rows(ED.data.activeAnalysis());
  var flat = rows.map(function (r) { return r.join(","); }).join("\n");
  ok(flat.indexOf("Uploaded data") !== -1 && flat.indexOf("DEMO") === -1, "XLSX-derived export says uploaded, never demo");
  ok(rows[4][1] === 12, "export carries the XLSX student count (12)");

  // ---------- 10. CSV key file path (same helper the wizard uses) ----------
  console.log("CSV key file:");
  var ckey = ED.csv.extractKeyFromTable(ED.csv.parseTable("Question,Key\n1,A\n2,B\n3,C"));
  ok(ckey.ok === true && ckey.key.join("") === "ABC", "key extracted from a CSV key file");
  var noKey = ED.csv.extractKeyFromTable(ED.csv.parseTable("Foo,Bar\n1,2"));
  ok(noKey.ok === false && /Question.*Key|Key.*Question/i.test(noKey.error), "missing columns explained");

  // ---------- result ----------
  if (failures.length) {
    console.error("\nFAILURES:");
    failures.forEach(function (f) { console.error("  ✗ " + f); });
    process.exit(1);
  } else {
    console.log("\nAll " + passed + " XLSX/PDF parsing tests passed.");
  }
}

main().catch(function (e) { console.error("Test run crashed:", e); process.exit(1); });
