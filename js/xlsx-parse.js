/* ============================================================
   Exam Detective — XLSX parsing (real, no libraries)
   An .xlsx file is a ZIP of XML files. This module reads the ZIP
   container directly (central directory + local entries) and
   inflates compressed entries with the platform-native
   DecompressionStream — available in all modern browsers and in
   Node 18+ (used by scripts/xlsx-pdf-test.js). Older browsers get
   an honest error instead of a fake parse.

   Sheet XML is machine-generated and predictable, so cells are
   extracted with targeted matching (shared strings, inline
   strings, numeric values) and handed to the SAME shape detection
   used for CSVs (ED.csv.parseRows) — both formats behave
   identically from the wizard's point of view.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  // ---------- inflate via DecompressionStream ----------

  function inflate(bytes, format) {
    // format: "deflate-raw" for ZIP entries
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("no-decompressor"));
    }
    var ds = new DecompressionStream(format);
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  // ---------- minimal ZIP reader ----------

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  var utf8 = new TextDecoder("utf-8");

  // Returns Promise<{ name -> Uint8Array }> for all entries.
  function readZip(buffer) {
    var b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // End-of-central-directory record: scan back for PK\x05\x06.
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd === -1) return Promise.reject(new Error("not-a-zip"));

    var count = u16(b, eocd + 10);
    var cdOffset = u32(b, eocd + 16);

    var entries = [];
    var p = cdOffset;
    for (var e = 0; e < count; e++) {
      if (u32(b, p) !== 0x02014b50) break; // central directory header
      var method = u16(b, p + 10);
      var compSize = u32(b, p + 20);
      var nameLen = u16(b, p + 28);
      var extraLen = u16(b, p + 30);
      var commentLen = u16(b, p + 32);
      var localOffset = u32(b, p + 42);
      var name = utf8.decode(b.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name: name, method: method, compSize: compSize, localOffset: localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }

    var out = {};
    var chain = Promise.resolve();
    entries.forEach(function (ent) {
      chain = chain.then(function () {
        var lp = ent.localOffset;
        if (u32(b, lp) !== 0x04034b50) return; // local header
        var nLen = u16(b, lp + 26);
        var xLen = u16(b, lp + 28);
        var dataStart = lp + 30 + nLen + xLen;
        var raw = b.subarray(dataStart, dataStart + ent.compSize);
        if (ent.method === 0) { out[ent.name] = raw; return; }          // stored
        if (ent.method === 8) {                                          // deflate
          return inflate(raw, "deflate-raw").then(function (inflated) { out[ent.name] = inflated; });
        }
        // other methods: skip entry (never seen from Excel)
      });
    });
    return chain.then(function () { return out; });
  }

  // ---------- worksheet XML -> table of strings ----------

  function unescapeXML(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&amp;/g, "&");
  }

  // All <t> runs inside an <si> or <is> block, concatenated.
  function textRuns(xml) {
    var out = "";
    var re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    var m;
    while ((m = re.exec(xml))) out += m[1] ? unescapeXML(m[1]) : "";
    return out;
  }

  function parseSharedStrings(xml) {
    var strings = [];
    if (!xml) return strings;
    var re = /<si>([\s\S]*?)<\/si>/g;
    var m;
    while ((m = re.exec(xml))) strings.push(textRuns(m[1]));
    return strings;
  }

  function colIndex(ref) {
    // "BC12" -> column index 54 (0-based)
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function sheetToTable(xml, shared) {
    var table = [];
    var rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    var rm;
    while ((rm = rowRe.exec(xml))) {
      var cells = [];
      var nextCol = 0;
      var cellRe = /<c\s([^>]*?)\/>|<c\s([^>]*?)>([\s\S]*?)<\/c>/g;
      var cm;
      while ((cm = cellRe.exec(rm[1]))) {
        var attrs = cm[1] || cm[2] || "";
        var inner = cm[3] || "";
        var refM = attrs.match(/\br="([A-Z]+)\d+"/);
        var col = refM ? colIndex(refM[1]) : nextCol;
        nextCol = col + 1;
        var typeM = attrs.match(/\bt="([^"]+)"/);
        var type = typeM ? typeM[1] : "n";
        var value = "";
        if (type === "inlineStr") {
          value = textRuns(inner);
        } else {
          var vM = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
          var v = vM ? unescapeXML(vM[1]) : "";
          if (type === "s") value = shared[parseInt(v, 10)] || "";
          else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
          else if (type === "e") value = "";
          else value = v; // numbers, formula strings (t="str")
        }
        cells[col] = value;
      }
      // normalize sparse arrays to ""
      for (var i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      table.push(cells);
    }
    // drop fully-empty rows
    return table.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
  }

  // ---------- workbook: sheet names in order ----------

  function sheetList(files) {
    var wb = files["xl/workbook.xml"] ? utf8.decode(files["xl/workbook.xml"]) : "";
    var rels = files["xl/_rels/workbook.xml.rels"] ? utf8.decode(files["xl/_rels/workbook.xml.rels"]) : "";
    var relMap = {};
    var rRe = /<Relationship\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
    var m;
    while ((m = rRe.exec(rels))) relMap[m[1]] = m[2].replace(/^\//, "").replace(/^(?!xl\/)/, "xl/");

    var sheets = [];
    var sRe = /<sheet\s([^>]*?)\/>/g;
    while ((m = sRe.exec(wb))) {
      var nameM = m[1].match(/\bname="([^"]*)"/);
      var idM = m[1].match(/\br:id="([^"]*)"/);
      var target = idM && relMap[idM[1]] ? relMap[idM[1]] : null;
      sheets.push({ name: nameM ? unescapeXML(nameM[1]) : "Sheet", target: target });
    }
    // fallback: enumerate worksheet entries directly
    if (!sheets.length || sheets.every(function (s) { return !s.target; })) {
      sheets = Object.keys(files)
        .filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
        .sort()
        .map(function (n, i) { return { name: "Sheet " + (i + 1), target: n }; });
    }
    return sheets.filter(function (s) { return s.target && files[s.target]; });
  }

  // ---------- public API (all Promise-based) ----------

  var BROWSER_TOO_OLD = "This browser can’t unpack XLSX files (it lacks built-in decompression). Use a current version of Chrome, Edge, Firefox, or Safari — or export the report as CSV.";
  var NOT_XLSX = "This doesn’t look like a real .xlsx file (it isn’t a ZIP container). If it came from an export tool, try re-exporting, or save it as CSV.";

  // -> Promise<{ ok, sheets: [{name, table}], error }>
  function parseWorkbook(arrayBuffer) {
    return readZip(arrayBuffer).then(function (files) {
      var shared = parseSharedStrings(files["xl/sharedStrings.xml"] ? utf8.decode(files["xl/sharedStrings.xml"]) : "");
      var sheets = sheetList(files).map(function (s) {
        return { name: s.name, table: sheetToTable(utf8.decode(files[s.target]), shared) };
      });
      if (!sheets.length) return { ok: false, error: "We unpacked the file but found no worksheets inside it." };
      return { ok: true, sheets: sheets };
    }).catch(function (e) {
      return { ok: false, error: e && e.message === "no-decompressor" ? BROWSER_TOO_OLD : NOT_XLSX };
    });
  }

  // Results from a workbook: every sheet that contains readable results
  // becomes one or more class sections. Sheet names become section labels
  // when the sheet has no Section column and the name looks meaningful.
  // -> Promise<{ ok, sections, warnings, format, sheetCount, parsedSheets, error }>
  function parseResults(arrayBuffer, opts) {
    opts = opts || {};
    return parseWorkbook(arrayBuffer).then(function (wb) {
      if (!wb.ok) return wb;
      var sections = [];
      var warnings = [];
      var parsedSheets = [];
      var formats = {};
      var firstError = null;

      wb.sheets.forEach(function (sheet) {
        var genericName = /^sheet\s*\d*$/i.test(sheet.name.trim());
        var fallback = (!genericName && sheet.name.trim()) ? sheet.name.trim() : (opts.defaultSection || "Class 1");
        var res = ED.csv.parseRows(sheet.table, { defaultSection: fallback });
        if (res.ok) {
          parsedSheets.push(sheet.name);
          formats[res.format] = true;
          res.sections.forEach(function (sec) { sections.push(sec); });
          res.warnings.forEach(function (w) {
            warnings.push((wb.sheets.length > 1 ? "Sheet “" + sheet.name + "”: " : "") + w);
          });
        } else {
          firstError = firstError || res.error;
          if (wb.sheets.length > 1) {
            warnings.push("Sheet “" + sheet.name + "” didn’t contain readable results and was skipped.");
          }
        }
      });

      if (!sections.length) {
        return { ok: false, error: firstError || "No sheet in this workbook contained readable results." };
      }
      return {
        ok: true,
        sections: sections,
        warnings: warnings,
        format: "XLSX · " + Object.keys(formats).join(" + "),
        sheetCount: wb.sheets.length,
        parsedSheets: parsedSheets
      };
    });
  }

  // Answer key from a workbook (first sheet that has Question + Key columns).
  // -> Promise<{ ok, key, found, sheetName, error }>
  function extractKey(arrayBuffer) {
    return parseWorkbook(arrayBuffer).then(function (wb) {
      if (!wb.ok) return wb;
      var firstError = null;
      for (var i = 0; i < wb.sheets.length; i++) {
        var res = ED.csv.extractKeyFromTable(wb.sheets[i].table);
        if (res.ok) {
          res.sheetName = wb.sheets[i].name;
          return res;
        }
        firstError = firstError || res.error;
      }
      return { ok: false, error: firstError || "No sheet had a readable answer key." };
    });
  }

  ED.xlsx = {
    parseWorkbook: parseWorkbook,
    parseResults: parseResults,
    extractKey: extractKey
  };
})();
