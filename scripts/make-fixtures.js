/* Generates binary test fixtures (real XLSX and PDF files) used by
   scripts/xlsx-pdf-test.js. Run once with:  node scripts/make-fixtures.js
   The fixtures are committed, so this only needs re-running if the
   fixture content changes. Uses only Node's built-in zlib. */

"use strict";

var fs = require("fs");
var path = require("path");
var zlib = require("zlib");

var outDir = path.join(__dirname, "fixtures");

// ---------------- minimal ZIP writer (deflated entries, real CRC32) ----------------

var CRC_TABLE = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  var c = ~0;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function u16(n) { var b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { var b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

function makeZip(files) { // files: { name: string|Buffer }
  var locals = [];
  var centrals = [];
  var offset = 0;
  Object.keys(files).forEach(function (name) {
    var data = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(files[name], "utf8");
    var comp = zlib.deflateRawSync(data);
    var crc = crc32(data);
    var nameBuf = Buffer.from(name, "utf8");
    var local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(data.length),
      u16(nameBuf.length), u16(0), nameBuf, comp
    ]);
    var central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(data.length),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBuf
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  });
  var cd = Buffer.concat(centrals);
  var eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(centrals.length), u16(centrals.length),
    u32(cd.length), u32(offset), u16(0)
  ]);
  return Buffer.concat(locals.concat([cd, eocd]));
}

// ---------------- minimal XLSX writer ----------------

function colRef(i) {
  var s = "";
  i++;
  while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// rows: arrays of values; numbers stay numeric cells, strings go to sharedStrings
function makeXlsx(sheets) { // sheets: [{name, rows}]
  var sst = [];
  var sstIndex = {};
  function sharedIdx(s) {
    if (sstIndex[s] === undefined) { sstIndex[s] = sst.length; sst.push(s); }
    return sstIndex[s];
  }

  var files = {};
  var sheetTags = [];
  var relTags = [];
  var typeTags = [];
  sheets.forEach(function (sheet, si) {
    var n = si + 1;
    var rowsXml = sheet.rows.map(function (row, ri) {
      var cells = row.map(function (v, ci) {
        var ref = colRef(ci) + (ri + 1);
        if (typeof v === "number") return '<c r="' + ref + '"><v>' + v + "</v></c>";
        if (v === null || v === undefined || v === "") return "";
        return '<c r="' + ref + '" t="s"><v>' + sharedIdx(String(v)) + "</v></c>";
      }).join("");
      return '<row r="' + (ri + 1) + '">' + cells + "</row>";
    }).join("");
    files["xl/worksheets/sheet" + n + ".xml"] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      rowsXml + "</sheetData></worksheet>";
    sheetTags.push('<sheet name="' + escXml(sheet.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>');
    relTags.push('<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>');
    typeTags.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  });

  files["[Content_Types].xml"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    typeTags.join("") + "</Types>";
  files["_rels/.rels"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files["xl/workbook.xml"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" + sheetTags.join("") + "</sheets></workbook>";
  files["xl/_rels/workbook.xml.rels"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relTags.join("") + "</Relationships>";
  files["xl/sharedStrings.xml"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + sst.length + '" uniqueCount="' + sst.length + '">' +
    sst.map(function (s) { return "<si><t>" + escXml(s) + "</t></si>"; }).join("") + "</sst>";

  return makeZip(files);
}

// ---------------- minimal PDF writer ----------------

function makePdf(contentStream, extras) {
  extras = extras || {};
  var content = Buffer.from(contentStream, "latin1");
  var deflated = zlib.deflateSync(content); // zlib wrapper = PDF FlateDecode

  var objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  var resources = "<< /Font << /F1 5 0 R >> " + (extras.imageObj ? "/XObject << /Im1 6 0 R >> " : "") + ">>";
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources " + resources + " >>");
  objects.push({ dict: "<< /Length " + deflated.length + " /Filter /FlateDecode >>", stream: deflated });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  if (extras.imageObj) {
    var img = Buffer.from("notarealjpegjustbytes-".repeat(40), "latin1");
    objects.push({ dict: "<< /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.length + " >>", stream: img });
  }

  var parts = [Buffer.from("%PDF-1.4\n", "latin1")];
  var offsets = [];
  var pos = parts[0].length;
  objects.forEach(function (obj, i) {
    offsets.push(pos);
    var head = (i + 1) + " 0 obj\n";
    var body;
    if (typeof obj === "string") body = Buffer.from(head + obj + "\nendobj\n", "latin1");
    else body = Buffer.concat([
      Buffer.from(head + obj.dict + "\nstream\n", "latin1"),
      obj.stream,
      Buffer.from("\nendstream\nendobj\n", "latin1")
    ]);
    parts.push(body);
    pos += body.length;
  });
  var xrefPos = pos;
  var xref = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n" +
    offsets.map(function (o) { return String(o).padStart(10, "0") + " 00000 n \n"; }).join("");
  var trailer = "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
  parts.push(Buffer.from(xref + trailer, "latin1"));
  return Buffer.concat(parts);
}

function textContent(lines) {
  var ops = ["BT", "/F1 12 Tf", "72 720 Td"];
  lines.forEach(function (line, i) {
    if (i) ops.push("0 -16 Td");
    ops.push("(" + line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ") Tj");
  });
  ops.push("ET");
  return ops.join("\n");
}

// ---------------- the fixtures ----------------

// 1. Student-rows XLSX: same data as sample-class-letters.csv (12 students, Q5/Q9 patterns)
var csv = fs.readFileSync(path.join(outDir, "sample-class-letters.csv"), "utf8").trim().split(/\r?\n/);
var studentRows = csv.map(function (line) { return line.split(","); });
fs.writeFileSync(path.join(outDir, "student-rows.xlsx"), makeXlsx([{ name: "Results", rows: studentRows }]));

// 2. Question-rows (aggregate) XLSX: numbers as real numeric cells
var aggRows = [["Question", "Responses", "% Correct", "Key"]];
[[1, 28, 82, "A"], [2, 28, 75, "B"], [3, 28, 40, "C"], [4, 28, 18, "D"],
 [5, 28, 90, "A"], [6, 28, 71, "B"], [7, 28, 64, "C"], [8, 28, 88, "D"]].forEach(function (r) { aggRows.push(r); });
fs.writeFileSync(path.join(outDir, "question-rows.xlsx"), makeXlsx([{ name: "Item Summary", rows: aggRows }]));

// 3. Multi-sheet XLSX: two class sections as separate sheets, no Section column
function classSheet(seed) {
  var rows = [["Student", "Q1", "Q2", "Q3", "Q4", "Q5"]];
  var keys = ["A", "B", "C", "D", "A"];
  for (var s2 = 0; s2 < 10; s2++) {
    var row = ["Student " + (s2 + 1)];
    for (var q = 0; q < 5; q++) {
      // a few wrong answers, deterministic per seed
      row.push((s2 + q + seed) % 4 === 0 ? "B" : keys[q]);
    }
    rows.push(row);
  }
  return rows;
}
fs.writeFileSync(path.join(outDir, "multi-sheet.xlsx"), makeXlsx([
  { name: "8A", rows: classSheet(1) },
  { name: "8B", rows: classSheet(2) },
  { name: "Notes", rows: [["Just a note sheet, no results here"]] }
]));

// 4. Answer-key XLSX
var keyRows = [["Question", "Key"]];
"ABCDABCDAB".split("").forEach(function (L, i) { keyRows.push([i + 1, L]); });
fs.writeFileSync(path.join(outDir, "answer-key.xlsx"), makeXlsx([{ name: "Key", rows: keyRows }]));

// 5. Text-based PDF answer key, complete (10 questions)
var keyLines = ["Grade 8 ELA Final Exam - Answer Key", ""];
"ABCDABCDAB".split("").forEach(function (L, i) { keyLines.push((i + 1) + ". " + L); });
fs.writeFileSync(path.join(outDir, "answer-key.pdf"), makePdf(textContent(keyLines)));

// 6. Partial PDF key: questions 6 and 7 missing
var partialLines = ["Answer Key (page damaged)", ""];
[1, 2, 3, 4, 5, 8, 9, 10].forEach(function (q, i) { partialLines.push(q + ". " + "ABCDABCDAB"[q - 1]); });
fs.writeFileSync(path.join(outDir, "answer-key-partial.pdf"), makePdf(textContent(partialLines)));

// 7. "Scanned" PDF: image XObject only, no text operators
fs.writeFileSync(path.join(outDir, "scanned.pdf"), makePdf("q\n612 0 0 792 0 0 cm\n/Im1 Do\nQ", { imageObj: true }));

console.log("Fixtures written to scripts/fixtures/:");
["student-rows.xlsx", "question-rows.xlsx", "multi-sheet.xlsx", "answer-key.xlsx",
 "answer-key.pdf", "answer-key-partial.pdf", "scanned.pdf"].forEach(function (f) {
  console.log("  " + f + " (" + fs.statSync(path.join(outDir, f)).size + " bytes)");
});
