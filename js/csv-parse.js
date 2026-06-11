/* ============================================================
   Exam Detective — CSV parsing (the first REAL upload path)
   Pure functions, no DOM — tested by scripts/csv-test.js.

   Two CSV shapes are supported:

   A) Student rows — one row per student:
        Student, Section, Q1, Q2, Q3, ...
      Q-cells may contain answer letters (A–E) or correctness
      marks (1/0, correct/incorrect, true/false, y/n, ✓/✗).

   B) Question summary rows — one row per question (aggregate):
        Question, % Correct  (or Correct + Incorrect counts)
      Optional columns: Key, Responses, A, B, C, D (distribution).

   Output shape (one entry per class section):
     { id, responses, questionCount, mode: "letters"|"correctness"|"aggregate",
       questions: { 1: { distribution: {A:count,...} | null,
                         correctCount, incorrectCount, blankCount,
                         missedPct | null,            // null until a key scores letters
                         keyedFromFile | null } },
       studentScores: [pct, ...] | null,
       warnings: [string, ...] }
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  // ---------- low-level: text -> table ----------

  function parseTable(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var s = String(text || "").replace(/^﻿/, ""); // strip BOM
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    // Drop fully-empty rows.
    return rows.filter(function (r) {
      return r.some(function (cell) { return String(cell).trim() !== ""; });
    });
  }

  // ---------- header detection helpers ----------

  function norm(s) { return String(s || "").trim().toLowerCase(); }

  function findCol(header, patterns) {
    for (var i = 0; i < header.length; i++) {
      var h = norm(header[i]);
      for (var p = 0; p < patterns.length; p++) {
        if (patterns[p].test(h)) return i;
      }
    }
    return -1;
  }

  // "Q1", "q 1", "question 1", "Q.1" -> 1 ; otherwise null
  function questionColNumber(h) {
    var m = norm(h).match(/^q(?:uestion)?\s*\.?\s*#?\s*(\d{1,3})$/);
    return m ? parseInt(m[1], 10) : null;
  }

  var MAX_QUESTIONS = 130;

  // ---------- cell interpretation ----------

  var LETTER = /^[a-e]$/;
  var TRUTHY = { "1": 1, "true": 1, "t": 1, "y": 1, "yes": 1, "correct": 1, "right": 1, "✓": 1, "x": null };
  var FALSY = { "0": 1, "false": 1, "f": 1, "n": 1, "no": 1, "incorrect": 1, "wrong": 1, "✗": 1, "✘": 1 };

  function classifyCell(v) {
    var t = norm(v);
    if (t === "") return { kind: "blank" };
    if (LETTER.test(t)) return { kind: "letter", letter: t.toUpperCase() };
    if (TRUTHY[t]) return { kind: "correct" };
    if (FALSY[t]) return { kind: "incorrect" };
    return { kind: "unknown", raw: v };
  }

  function pctOf(part, whole) { return whole ? Math.round((part / whole) * 100) : 0; }

  function median(nums) {
    if (!nums.length) return 0;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  }

  // ---------- shape A: student rows ----------

  function parseStudentRows(header, rows, opts) {
    var qCols = [];   // [{col, q}]
    header.forEach(function (h, i) {
      var q = questionColNumber(h);
      if (q !== null && q >= 1 && q <= MAX_QUESTIONS) qCols.push({ col: i, q: q });
    });
    var sectionCol = findCol(header, [/^(section|class|classroom|period|block|homeroom)$/]);
    var studentCol = findCol(header, [/^(student|name|student\s*name|student\s*id|id)$/]);

    var bySection = {};
    var warnings = [];
    var unknownCells = 0;

    rows.forEach(function (r) {
      var secId = sectionCol >= 0 ? String(r[sectionCol] || "").trim() : "";
      if (!secId) secId = opts.defaultSection || "Class 1";
      var sec = bySection[secId];
      if (!sec) {
        sec = bySection[secId] = { id: secId, responses: 0, questions: {}, rows: [] };
        qCols.forEach(function (qc) {
          sec.questions[qc.q] = { distribution: {}, correctCount: 0, incorrectCount: 0, blankCount: 0, missedPct: null, keyedFromFile: null };
        });
      }
      sec.responses++;
      var studentRow = {};
      qCols.forEach(function (qc) {
        var cell = classifyCell(r[qc.col]);
        var qd = sec.questions[qc.q];
        if (cell.kind === "letter") {
          qd.distribution[cell.letter] = (qd.distribution[cell.letter] || 0) + 1;
          studentRow[qc.q] = cell.letter;
        } else if (cell.kind === "correct") {
          qd.correctCount++; studentRow[qc.q] = true;
        } else if (cell.kind === "incorrect") {
          qd.incorrectCount++; studentRow[qc.q] = false;
        } else if (cell.kind === "blank") {
          qd.blankCount++;
        } else {
          unknownCells++; qd.blankCount++;
        }
      });
      sec.rows.push(studentRow);
      if (studentCol >= 0 && String(r[studentCol] || "").trim()) sec.hasStudentNames = true;
    });

    if (unknownCells) {
      warnings.push(unknownCells + " answer cell" + (unknownCells > 1 ? "s" : "") +
        " couldn’t be read (expected a letter A–E, or correct/incorrect marks) and were treated as blank.");
    }

    var sections = Object.keys(bySection).map(function (id) {
      var sec = bySection[id];
      var qNums = Object.keys(sec.questions).map(Number);
      var lettersSeen = 0, marksSeen = 0;
      qNums.forEach(function (q) {
        var qd = sec.questions[q];
        var dTotal = Object.keys(qd.distribution).reduce(function (a, k) { return a + qd.distribution[k]; }, 0);
        lettersSeen += dTotal;
        marksSeen += qd.correctCount + qd.incorrectCount;
      });
      var mode = lettersSeen >= marksSeen ? "letters" : "correctness";
      var studentScores = null;

      if (mode === "correctness") {
        // missedPct directly from marks; per-student scores from rows
        qNums.forEach(function (q) {
          var qd = sec.questions[q];
          var answered = qd.correctCount + qd.incorrectCount;
          qd.missedPct = answered ? pctOf(qd.incorrectCount + qd.blankCount, answered + qd.blankCount) : null;
        });
        studentScores = sec.rows.map(function (row) {
          var c = 0;
          qNums.forEach(function (q) { if (row[q] === true) c++; });
          return pctOf(c, qNums.length);
        });
      }
      if (sec.hasStudentNames) {
        warnings.push("Section " + id + ": the file contains student names/IDs. They are used only to count responses and are not stored in results.");
      }
      return {
        id: id,
        responses: sec.responses,
        questionCount: qNums.length ? Math.max.apply(null, qNums) : 0,
        mode: mode,
        questions: sec.questions,
        rows: sec.rows, // per-student answers (no names) — lets the builder compute real medians
        studentScores: studentScores,
        warnings: []
      };
    });

    return { ok: true, sections: sections, warnings: warnings, format: "student rows" };
  }

  // ---------- shape B: aggregate question rows ----------

  function parseAggregateRows(header, rows, opts) {
    var qCol = findCol(header, [/^q(uestion)?\s*(#|no\.?|number)?$/, /^item$/]);
    var pctCorrectCol = findCol(header, [/^%?\s*correct$/, /^(pct|percent(age)?)\s*correct$/, /^correct\s*%$/]);
    var pctMissedCol = findCol(header, [/^%?\s*(missed|incorrect|wrong)$/, /^(pct|percent(age)?)\s*(missed|incorrect)$/]);
    var correctCountCol = pctCorrectCol === -1 ? findCol(header, [/^(#\s*)?correct(\s*count)?$/, /^(num|number)\s*correct$/]) : -1;
    var incorrectCountCol = findCol(header, [/^(#\s*)?(incorrect|missed|wrong)(\s*count)?$/, /^(num|number)\s*(incorrect|wrong)$/]);
    var keyCol = findCol(header, [/^key(ed)?(\s*answer)?$/, /^answer(\s*key)?$/, /^correct\s*answer$/]);
    var responsesCol = findCol(header, [/^(responses|students|n|count|total\s*(students|responses))$/]);
    var letterCols = {};
    ["A", "B", "C", "D", "E"].forEach(function (L) {
      var i = findCol(header, [new RegExp("^" + L.toLowerCase() + "$"), new RegExp("^%\\s*" + L.toLowerCase() + "$")]);
      if (i >= 0) letterCols[L] = i;
    });

    var questions = {};
    var warnings = [];
    var responses = 0;
    var skipped = 0;

    rows.forEach(function (r) {
      var qn = parseInt(String(r[qCol]).replace(/[^0-9]/g, ""), 10);
      if (!qn || qn < 1 || qn > MAX_QUESTIONS) { skipped++; return; }
      var n = responsesCol >= 0 ? parseInt(r[responsesCol], 10) || 0 : 0;
      var correctCount = correctCountCol >= 0 ? parseInt(r[correctCountCol], 10) || 0 : null;
      var incorrectCount = incorrectCountCol >= 0 ? parseInt(r[incorrectCountCol], 10) || 0 : null;
      if (!n && correctCount !== null && incorrectCount !== null) n = correctCount + incorrectCount;
      responses = Math.max(responses, n);

      var missedPct = null;
      if (pctMissedCol >= 0) missedPct = Math.round(parseFloat(r[pctMissedCol]));
      else if (pctCorrectCol >= 0) missedPct = 100 - Math.round(parseFloat(r[pctCorrectCol]));
      else if (correctCount !== null && incorrectCount !== null && (correctCount + incorrectCount) > 0) {
        missedPct = pctOf(incorrectCount, correctCount + incorrectCount);
      }
      if (missedPct !== null && (isNaN(missedPct) || missedPct < 0 || missedPct > 100)) {
        warnings.push("Question " + qn + ": the percent value didn’t make sense and was ignored.");
        missedPct = null;
      }

      var distribution = null;
      Object.keys(letterCols).forEach(function (L) {
        var v = parseFloat(r[letterCols[L]]);
        if (!isNaN(v)) { distribution = distribution || {}; distribution[L] = v; }
      });

      questions[qn] = {
        distribution: distribution,
        correctCount: correctCount || 0,
        incorrectCount: incorrectCount || 0,
        blankCount: 0,
        missedPct: missedPct,
        keyedFromFile: keyCol >= 0 && LETTER.test(norm(r[keyCol])) ? norm(r[keyCol]).toUpperCase() : null
      };
    });

    var qNums = Object.keys(questions).map(Number);
    if (!qNums.length) {
      return { ok: false, error: "We found a Question column but couldn’t read any question rows. Check that the question numbers are plain numbers (1, 2, 3 …)." };
    }
    if (skipped) warnings.push(skipped + " row" + (skipped > 1 ? "s" : "") + " had no readable question number and were skipped.");
    if (!responses) warnings.push("The file doesn’t say how many students responded. Add a “Responses” column, or enter the count when labeling the file.");

    var missing = qNums.filter(function (q) { return questions[q].missedPct === null; });
    if (missing.length === qNums.length) {
      return { ok: false, error: "This file lists questions but no results we can score. We need a “% Correct” column, or “Correct” and “Incorrect” count columns." };
    }
    if (missing.length) {
      warnings.push("No result could be read for question" + (missing.length > 1 ? "s" : "") + " " + missing.join(", ") + ".");
    }

    var avgCorrect = Math.round(qNums.reduce(function (a, q) {
      return a + (questions[q].missedPct === null ? 0 : 100 - questions[q].missedPct);
    }, 0) / (qNums.length - missing.length || 1));
    warnings.push("This is an aggregate file (one row per question), so the class average (" + avgCorrect + "%) is estimated from question results and the median can’t be computed exactly.");

    return {
      ok: true,
      format: "question summary",
      warnings: warnings,
      sections: [{
        id: opts.defaultSection || "Class 1",
        responses: responses || (opts.assumeResponses || 0),
        questionCount: Math.max.apply(null, qNums),
        mode: "aggregate",
        questions: questions,
        studentScores: null,
        estimatedAverage: avgCorrect,
        warnings: []
      }]
    };
  }

  // ---------- entry points ----------

  // Shape-detect and parse a table of rows (header + data). Shared by
  // CSV (text) and XLSX (sheets) so both formats get identical handling.
  function parseRows(table, opts) {
    opts = opts || {};
    if (!table || table.length < 2) {
      return { ok: false, error: "This file has no data rows. A results file needs a header row plus at least one row of results." };
    }
    var header = table[0];
    var rows = table.slice(1);

    var hasQCols = header.some(function (h) { return questionColNumber(h) !== null; });
    if (hasQCols) return parseStudentRows(header, rows, opts);

    var qCol = findCol(header, [/^q(uestion)?\s*(#|no\.?|number)?$/, /^item$/]);
    if (qCol >= 0) return parseAggregateRows(header, rows, opts);

    return {
      ok: false,
      error: "We couldn’t find question results in this file. Exam Detective reads two layouts: " +
        "(1) one row per student with columns like “Q1, Q2, Q3 …” containing answer letters or correct/incorrect marks, or " +
        "(2) one row per question with a “Question” column plus “% Correct” (or “Correct”/“Incorrect” counts). " +
        "Open the file in a spreadsheet and check the column headers, or try the sample CSV from the upload step."
    };
  }

  function parseResults(text, opts) {
    var table;
    try { table = parseTable(text); }
    catch (e) { return { ok: false, error: "We couldn’t read this file as a CSV at all. Try re-exporting it from your assessment tool." }; }
    return parseRows(table, opts || {});
  }

  // Try to read an ANSWER KEY from a table: needs a question column and
  // a key/answer column (the aggregate layout, results optional).
  // Returns { ok, key: ["A",...], found, maxQ } or { ok:false, error }.
  function extractKeyFromTable(table) {
    if (!table || table.length < 2) {
      return { ok: false, error: "This file has no data rows to read a key from." };
    }
    var header = table[0];
    var qCol = findCol(header, [/^q(uestion)?\s*(#|no\.?|number)?$/, /^item$/]);
    var keyCol = findCol(header, [/^key(ed)?(\s*answer)?$/, /^answer(\s*key)?$/, /^correct\s*answer$/]);
    if (qCol === -1 || keyCol === -1) {
      return { ok: false, error: "To read an answer key, the file needs a “Question” column and a “Key” (or “Answer”) column." };
    }
    var key = [];
    var found = 0;
    table.slice(1).forEach(function (r) {
      var qn = parseInt(String(r[qCol]).replace(/[^0-9]/g, ""), 10);
      var L = norm(r[keyCol]);
      if (qn >= 1 && qn <= MAX_QUESTIONS && LETTER.test(L)) {
        key[qn - 1] = L.toUpperCase();
        found++;
      }
    });
    if (!found) return { ok: false, error: "We found the key column but no readable entries (expected letters A–E next to question numbers)." };
    for (var i = 0; i < key.length; i++) if (key[i] === undefined) key[i] = "";
    return { ok: true, key: key, found: found, maxQ: key.length };
  }

  // ---------- sample CSV (downloadable from the upload step) ----------

  function sampleCSV() {
    var lines = ["Student,Section,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10"];
    var answers = [
      "A,B,C,D,A,B,C,D,A,B", "A,B,C,D,A,C,C,D,A,B", "A,B,A,D,A,B,C,D,C,B",
      "B,B,C,D,A,B,C,A,A,B", "A,B,C,D,B,B,C,D,A,D", "A,C,C,D,A,B,C,D,A,B",
      "A,B,C,C,A,B,B,D,A,B", "A,B,C,D,A,B,C,D,A,B"
    ];
    answers.forEach(function (a, i) { lines.push("Student " + (i + 1) + ",8A," + a); });
    return lines.join("\r\n");
  }

  ED.csv = {
    MAX_QUESTIONS: MAX_QUESTIONS,
    parseTable: parseTable,
    parseRows: parseRows,
    parseResults: parseResults,
    extractKeyFromTable: extractKeyFromTable,
    sampleCSV: sampleCSV
  };
})();
