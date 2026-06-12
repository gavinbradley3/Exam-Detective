/* ============================================================
   Exam Detective — PDF text & answer-key extraction (real, honest)

   Scope (deliberately narrow, stated in the UI):
   - TEXT-BASED PDFs only. Content streams are inflated with the
     platform-native DecompressionStream (FlateDecode) and text is
     read from the standard text operators (Tj / TJ / ' / ").
   - Works when the PDF uses standard font encodings (most exports
     from word processors and assessment tools that don't subset
     with custom CMaps).
   - SCANNED / image-only PDFs are detected and rejected with an
     honest message — there is NO OCR in this build.
   - PDFs whose fonts use custom encodings produce unreadable bytes;
     we detect that (low printable-character ratio) and refuse to
     guess rather than deliver garbage.

   Used for ANSWER KEY extraction (wizard Step 4). Full exam-question
   and passage parsing are not built — see BUILD_NOTES.md.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var latin1 = new TextDecoder("latin1");

  function inflateZlib(bytes) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("no-decompressor"));
    }
    var ds = new DecompressionStream("deflate"); // PDF FlateDecode = zlib wrapper
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  // ---------- locate stream objects ----------

  // Find every `<<dict>> stream ... endstream` in the raw bytes.
  function findStreams(raw) {
    var src = latin1.decode(raw);
    var streams = [];
    var idx = 0;
    while (true) {
      var s = src.indexOf("stream", idx);
      if (s === -1) break;
      // must be the keyword, not part of "endstream"
      if (src.slice(s - 3, s) === "end") { idx = s + 6; continue; }

      // walk back to the matching `<<` of the dictionary before `stream`
      var dictEnd = src.lastIndexOf(">>", s);
      var depth = 1, dStart = -1;
      for (var i = dictEnd - 1; i >= 0 && i > dictEnd - 4000; i--) {
        if (src[i] === ">" && src[i - 1] === ">") { depth++; i--; }
        else if (src[i] === "<" && src[i - 1] === "<") {
          depth--;
          if (depth === 0) { dStart = i - 1; break; }
          i--;
        }
      }
      var dict = dStart >= 0 ? src.slice(dStart, dictEnd + 2) : "";

      // stream data starts after the EOL following `stream`
      var dataStart = s + 6;
      if (src[dataStart] === "\r") dataStart++;
      if (src[dataStart] === "\n") dataStart++;
      var end = src.indexOf("endstream", dataStart);
      if (end === -1) break;
      var dataEnd = end;
      while (dataEnd > dataStart && (src[dataEnd - 1] === "\n" || src[dataEnd - 1] === "\r")) dataEnd--;

      streams.push({ dict: dict, data: raw.subarray(dataStart, dataEnd) });
      idx = end + 9;
    }
    return streams;
  }

  // ---------- text operators -> text ----------

  function decodePdfString(s) {
    // contents of a ( ) string, with backslash escapes and octal codes
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c !== "\\") { out += c; continue; }
      var n = s[++i];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "b" || n === "f") out += "";
      else if (n >= "0" && n <= "7") {
        var oct = n;
        while (oct.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") oct += s[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else out += n; // \\, \(, \), line continuation
    }
    return out;
  }

  // Pull readable text from one decompressed content stream.
  function textFromContent(content) {
    var src = latin1.decode(content);
    if (!/\b(BT|Tj|TJ)\b/.test(src)) return null; // not a text stream

    var out = "";
    var re = /\(((?:[^()\\]|\\.)*)\)\s*(Tj|'|")|\[((?:[^\]\\]|\\.)*?)\]\s*TJ|(T\*|TD|Td|ET)/g;
    var m;
    while ((m = re.exec(src))) {
      if (m[2]) {                       // (string) Tj | ' | "
        out += decodePdfString(m[1]);
        out += " ";
      } else if (m[3] !== undefined) {  // [ ... ] TJ
        var inner = m[3];
        var sRe = /\(((?:[^()\\]|\\.)*)\)/g;
        var sm;
        while ((sm = sRe.exec(inner))) out += decodePdfString(sm[1]);
        out += " ";
      } else {                          // positioning -> line break
        out += "\n";
      }
    }
    return out;
  }

  function printableRatio(text) {
    if (!text.length) return 0;
    var good = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) good++;
    }
    return good / text.length;
  }

  // ---------- public: extract all text ----------

  var ERRORS = {
    "no-decompressor": "This browser can’t decompress PDF streams. Use a current version of Chrome, Edge, Firefox, or Safari.",
    "not-a-pdf": "This doesn’t look like a valid PDF file — it may be corrupted or mislabeled. Try re-exporting it.",
    scanned: "This PDF appears to be a scan (images of pages, no machine-readable text). Exam Detective doesn’t do OCR yet, so it can’t read it.",
    encoded: "This PDF stores its text with a custom font encoding we can’t decode yet. Rather than guess at garbled text, nothing was read from it.",
    empty: "We couldn’t find any readable text in this PDF."
  };

  // -> Promise<{ ok, text, kind: "text"|"scanned"|"encoded"|"empty", error }>
  function extractText(buffer) {
    var raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var head = latin1.decode(raw.subarray(0, 8));
    if (head.indexOf("%PDF") !== 0) {
      return Promise.resolve({ ok: false, kind: "empty", error: ERRORS["not-a-pdf"] });
    }

    var streams = findStreams(raw);
    var imageStreams = 0;
    var texts = [];
    var chain = Promise.resolve();

    streams.forEach(function (st) {
      chain = chain.then(function () {
        if (/\/Subtype\s*\/Image|\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(st.dict)) {
          imageStreams++;
          return;
        }
        if (/\/FontFile/.test(st.dict)) return; // embedded font programs
        var bytesP;
        if (/\/FlateDecode/.test(st.dict)) {
          bytesP = inflateZlib(st.data).catch(function (e) {
            if (e && e.message === "no-decompressor") throw e;
            return null; // corrupt single stream: skip it
          });
        } else if (/\/Filter/.test(st.dict)) {
          return; // other filters (LZW, ASCII85…) not supported — skip
        } else {
          bytesP = Promise.resolve(st.data);
        }
        return bytesP.then(function (bytes) {
          if (!bytes) return;
          var t = textFromContent(bytes);
          if (t !== null) texts.push(t);
        });
      });
    });

    return chain.then(function () {
      if (!texts.length) {
        if (imageStreams > 0) return { ok: false, kind: "scanned", error: ERRORS.scanned };
        return { ok: false, kind: "empty", error: ERRORS.empty };
      }
      var text = texts.join("\n");
      if (printableRatio(text) < 0.7) {
        return { ok: false, kind: "encoded", error: ERRORS.encoded };
      }
      return { ok: true, kind: "text", text: text };
    }).catch(function (e) {
      return { ok: false, kind: "empty", error: e && e.message === "no-decompressor" ? ERRORS["no-decompressor"] : ERRORS["not-a-pdf"] };
    });
  }

  // ---------- public: answer key from text ----------

  // Reads "1. A  2) B  Q3: C  4 D  5. b" patterns — numbered lists,
  // table cells (each on its own line: "1" / "B"), compact multi-column
  // rows ("1 B  26 C  51 D"), and keys split across pages. Lowercase
  // letters are accepted and normalized. Reports coverage and conflicts
  // honestly — extraction always needs teacher review.
  function keyFromText(text) {
    var seen = {};       // q -> { letter -> count }
    var re = /(?:\bQ\s*)?(\d{1,3})\s*[.):\-]*\s+([A-Ea-e])(?![a-zA-Z0-9])/g;
    var m;
    while ((m = re.exec(text))) {
      var q = parseInt(m[1], 10);
      if (q < 1 || q > ED.csv.MAX_QUESTIONS) continue;
      var L = m[2].toUpperCase();
      seen[q] = seen[q] || {};
      seen[q][L] = (seen[q][L] || 0) + 1;
    }
    var qs = Object.keys(seen).map(Number);
    if (qs.length < 3) {
      return { ok: false, error: "The answer key PDF was uploaded, but no question→answer pairs could be extracted (looked for patterns like “1. A”, “2) B”, “Q3: C”, or table cells of number/letter)." };
    }

    var maxQ = Math.max.apply(null, qs);
    var key = [];
    var conflicts = [];
    var missing = [];
    for (var q2 = 1; q2 <= maxQ; q2++) {
      if (!seen[q2]) { key.push(""); missing.push(q2); continue; }
      var letters = Object.keys(seen[q2]);
      if (letters.length > 1) {
        // pick the most frequent, but flag it
        letters.sort(function (a, b) { return seen[q2][b] - seen[q2][a]; });
        conflicts.push({ q: q2, letters: letters });
      }
      key.push(letters[0]);
    }
    return {
      ok: true,
      key: key,
      found: qs.length,
      maxQ: maxQ,
      missing: missing,
      conflicts: conflicts
    };
  }

  // -> Promise<{ ok, key, found, maxQ, missing, conflicts, kind, error }>
  function extractKey(buffer) {
    return extractText(buffer).then(function (res) {
      if (!res.ok) {
        if (res.kind === "scanned") res.error = "The answer key appears to be scanned or image-only. " + ERRORS.scanned + " Upload a text-based PDF, CSV, or XLSX answer key — or paste the key instead.";
        else if (res.kind === "encoded" || res.kind === "empty") res.error += " Copy the key out of the document and use the paste box instead.";
        return res;
      }
      var keyRes = keyFromText(res.text);
      if (!keyRes.ok) {
        // wrong-document detection: say what this PDF actually looks like
        var sniff = sniffType(res.text);
        if (sniff === "results") keyRes.error = "This PDF looks like a class RESULTS report (rows of question percentages), not an answer key. Upload it in Step 2 — and upload the key document here instead.";
        else if (sniff === "exam") keyRes.error = "This PDF looks like the EXAM QUESTIONS (numbered stems with A–D choices), not an answer key. Upload it in Step 3 — and upload the key document here instead.";
        return keyRes;
      }
      keyRes.kind = "text";
      return keyRes;
    });
  }

  // ---------- document-type sniffing (cross-routing wrong uploads) ----------

  // Lightweight, regex-only classification of extracted PDF text:
  // "results" (question + percent rows), "exam" (stems + option lines),
  // "key" (number→letter pairs), or "unknown" (likely a passage/other).
  function sniffType(text) {
    var lines = String(text || "").split(/\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var resultRows = 0, optionLines = 0, stems = 0;
    lines.forEach(function (l) {
      if (/^(?:q(?:uestion)?\s*)?\d{1,3}\b.*?\d{1,3}(?:\.\d+)?\s*%/i.test(l)) resultRows++;
      if (/^[A-E][.)]\s+\S/.test(l)) optionLines++;
      var sm = l.match(/^\d{1,3}[.)]\s+(.{4,})/);
      if (sm && !/^[A-Ea-e]\b/.test(sm[1])) stems++;
    });
    var keyPairs = (String(text).match(/(?:\bQ\s*)?\d{1,3}\s*[.):\-]*\s+[A-Ea-e](?![a-zA-Z0-9])/g) || []).length;
    if (resultRows >= 4) return "results";
    if (stems >= 2 && optionLines >= 4) return "exam";
    if (keyPairs >= 3) return "key";
    return "unknown";
  }

  // ---------- public: class results from an item-analysis PDF ----------

  // Real parsing of text-based item-analysis reports: rows that pair a
  // question number with a percent (e.g. "12   84%   B"), or table cells
  // split across lines ("12" / "84%"). Produces the same aggregate
  // section shape the CSV/XLSX parsers produce. Nothing is guessed:
  // distributions aren't invented, and unreadable layouts get a
  // specific refusal.
  function resultsFromText(text, opts) {
    opts = opts || {};
    var lines = String(text || "").split(/\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var warnings = [];

    var missedHeader = /(%\s*(missed|incorrect|wrong))|((missed|incorrect|wrong)\s*%)/i.test(text);
    var correctHeader = /(%\s*correct)|(correct\s*%)/i.test(text);
    var treatAsMissed = missedHeader && !correctHeader;

    var responses = 0;
    var rm = String(text).match(/(?:students|responses)\s*[:=]?\s*(\d{1,4})\b/i) ||  // "Students: 26"
             String(text).match(/(\d{1,4})\s+(?:students|responses)\b/i) ||           // "26 students"
             String(text).match(/\b[Nn]\s*=\s*(\d{1,4})\b/);                          // "N = 26"
    if (rm) responses = parseInt(rm[1], 10);

    var questions = {};
    var duplicates = [];
    var anyKeyed = false;
    function addRow(q, pct, keyed) {
      if (!q || q < 1 || q > 130 || isNaN(pct) || pct < 0 || pct > 100) return;
      if (questions[q]) { if (duplicates.indexOf(q) === -1) duplicates.push(q); return; }
      if (keyed) anyKeyed = true;
      questions[q] = {
        distribution: null, correctCount: 0, incorrectCount: 0, blankCount: 0,
        missedPct: treatAsMissed ? Math.round(pct) : 100 - Math.round(pct),
        keyedFromFile: keyed || null
      };
    }

    // pass 1: same-line rows — "12 ... 84% ... B"
    lines.forEach(function (l) {
      var m = l.match(/^(?:q(?:uestion)?\s*)?(\d{1,3})\b(.*)$/i);
      if (!m) return;
      var pm = m[2].match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (!pm) return;
      var km = m[2].match(/%\s*(?:.*?\s)?([A-E])(?![a-zA-Z0-9])\s*$/); // keyed letter after the percent
      addRow(parseInt(m[1], 10), parseFloat(pm[1]), km ? km[1] : null);
    });
    // pass 2: table cells on separate lines — "12" then "84%"
    for (var i = 0; i < lines.length - 1; i++) {
      var qm = lines[i].match(/^(\d{1,3})$/);
      if (!qm) continue;
      var nm = lines[i + 1].match(/^(\d{1,3}(?:\.\d+)?)\s*%$/);
      if (nm) addRow(parseInt(qm[1], 10), parseFloat(nm[1]), null);
    }

    var qs = Object.keys(questions).map(Number);
    if (qs.length < 4) {
      var sniff = sniffType(text);
      if (sniff === "key") {
        return { ok: false, error: "This PDF looks like an ANSWER KEY (question→answer pairs, no result percentages), not a results report. Upload it in Step 4 — Answer Key — and upload the class results report here instead." };
      }
      if (sniff === "exam") {
        return { ok: false, error: "This PDF looks like the EXAM QUESTIONS, not a results report. Upload it in Step 3 — and upload the class results report here instead." };
      }
      return { ok: false, error: "No question-results table could be read from this PDF. Exam Detective reads text-based item-analysis layouts with rows like “12 … 84%” (question number + percent correct/missed). If this report uses charts, images, or an unusual table layout, export it as CSV or XLSX from your assessment tool instead." };
    }

    var maxQ = Math.max.apply(null, qs);
    var missing = [];
    for (var q3 = 1; q3 <= maxQ; q3++) if (!questions[q3]) missing.push(q3);

    warnings.push("Percentages in this PDF were read as percent " + (treatAsMissed ? "MISSED" : "CORRECT") +
      (treatAsMissed ? " (the report mentions missed/incorrect)" : "") + " — spot-check one question on this Review step before running.");
    warnings.push("Answer-choice distributions aren’t extracted from PDF reports — key checks use " +
      (anyKeyed ? "the keyed answers found in the report and " : "") + "the key from Step 4.");
    if (duplicates.length) warnings.push("Question" + (duplicates.length === 1 ? "" : "s") + " " + duplicates.join(", ") + " appeared more than once in the PDF — the first row was kept.");
    if (missing.length) warnings.push("No result row was found for question" + (missing.length === 1 ? "" : "s") + " " + missing.slice(0, 12).join(", ") + (missing.length > 12 ? "…" : "") + ".");
    if (!responses) warnings.push("The PDF doesn’t state a student count we could read — this section will show 0 students unless the report includes “Students: N” or “N = …”.");

    var known = qs.map(function (q) { return 100 - questions[q].missedPct; });
    var avg = Math.round(known.reduce(function (a, b) { return a + b; }, 0) / known.length);
    warnings.push("This is an aggregate report (one row per question), so the class average (" + avg + "%) is estimated from question results and the median can’t be computed exactly.");

    return {
      ok: true,
      format: "PDF · item summary",
      warnings: warnings,
      sections: [{
        id: opts.defaultSection || "Class 1",
        responses: responses,
        questionCount: maxQ,
        mode: "aggregate",
        questions: questions,
        studentScores: null,
        estimatedAverage: avg,
        warnings: []
      }]
    };
  }

  // -> Promise<{ ok, sections, warnings, format, error, kind }>
  function extractResults(buffer, opts) {
    return extractText(buffer).then(function (res) {
      if (!res.ok) {
        if (res.kind === "scanned") res.error = ERRORS.scanned + " Export the report as CSV or XLSX from your assessment tool, or upload a text-based PDF.";
        return res;
      }
      return resultsFromText(res.text, opts);
    });
  }

  ED.pdf = {
    extractText: extractText,
    extractKey: extractKey,
    keyFromText: keyFromText,
    sniffType: sniffType,
    resultsFromText: resultsFromText,
    extractResults: extractResults
  };
})();
