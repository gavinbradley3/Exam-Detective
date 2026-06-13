/* ============================================================
   Exam Detective — exam-question & reading-passage parsing
   Builds on ED.pdf.extractText (text-based PDFs only; scanned and
   custom-encoded PDFs are refused honestly there). Plain .txt files
   go through the same text parsers.

   What this does:
   - Finds numbered questions ("1. …", "Q2) …") and their answer
     choices ("A. …" – "E. …") in exam text.
   - Finds section/source markers like “The Story (Questions 1–5)”.
   - Reads passage files: title (first short line) + word count.
   - Links passages to question ranges ONLY when there is explicit
     evidence: a "Questions X–Y" marker whose title matches the
     passage title (or a marker inside the passage itself). No
     guessing — everything else is reported as unmatched.

   What this does NOT do:
   - Invent missing wording. A question with no extracted text stays
     textless and is labeled that way.
   - Judge content. Extracted text is quoted as evidence; the
     analysis rules stay data-driven (js/analysis-builder.js).
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var MAX_Q = 130;
  var STEM_RE = /^(?:Q\s*)?(\d{1,3})\s*[.)]\s+(.+)$/;
  var OPTION_RE = /^([A-E])\s*[.)]\s+(.+)$/;
  var RANGE_RE = /questions?\s+(\d{1,3})\s*(?:[–—-]|to|through)\s*(\d{1,3})/i;

  function trunc(s, n) {
    s = String(s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
  }

  // ---------- layout hardening (real-world PDF noise) ----------
  // Removes page furniture and untangles common layout quirks. It only
  // ever DROPS noise or SPLITS lines — it never invents or merges content,
  // so the worst case is still honest partial extraction.
  function preprocessLines(lines) {
    // 1) obvious page furniture
    lines = lines.filter(function (l) {
      if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(l)) return false;  // "Page 3 of 12"
      if (/^-\s*\d+\s*-$/.test(l)) return false;                // "- 7 -"
      if (/^\d{1,3}$/.test(l)) return false;                    // bare page number
      return true;
    });
    // 2) repeated running headers/footers: the same short line 3+ times
    //    that is neither a question, an option, nor a section marker
    var counts = {};
    lines.forEach(function (l) { if (l && l.length <= 70) counts[l] = (counts[l] || 0) + 1; });
    lines = lines.filter(function (l) {
      return !(counts[l] >= 3 && !STEM_RE.test(l) && !OPTION_RE.test(l) && !RANGE_RE.test(l));
    });
    // 3) inline answer choices: "1. Stem? A. x B. y" or "A. x B. y C. z"
    //    on one line. Split only when the pieces genuinely look like
    //    options — a sentence that merely contains "B. " stays intact.
    var out = [];
    lines.forEach(function (l) {
      var parts = l.split(/\s+(?=[A-E][.)]\s)/);
      if (parts.length >= 2) {
        var optionish = parts.filter(function (p) { return OPTION_RE.test(p); }).length;
        if (optionish >= 2 || (optionish >= 1 && STEM_RE.test(parts[0]))) {
          out.push.apply(out, parts);
          return;
        }
      }
      out.push(l);
    });
    return out;
  }

  // ---------- exam text -> questions + section markers ----------

  // -> { isExam, questions: {n:{stem, options, complete}}, found,
  //      complete, incomplete:[n], maxQ, sections:[{title, from, to}], warnings }
  function parseExamText(text) {
    var lines = preprocessLines(
      String(text || "").split(/\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); })
    );
    var questions = {};
    var sections = [];
    var current = null;     // {n, stem, options, lastOption}
    var warnings = [];

    function closeCurrent() {
      if (!current) return;
      var q = questions[current.n] = questions[current.n] || { stem: "", options: {} };
      q.stem = current.stem.trim();
      Object.keys(current.options).forEach(function (L) {
        q.options[L] = current.options[L].trim();
      });
      current = null;
    }

    lines.forEach(function (line) {
      if (!line) return;

      // Section/source marker, e.g. “The Strange Orchid (Questions 1–10)”
      var rm = line.match(RANGE_RE);
      if (rm && !STEM_RE.test(line)) {
        var from = parseInt(rm[1], 10), to = parseInt(rm[2], 10);
        if (from >= 1 && to >= from && to <= MAX_Q) {
          var title = line.replace(RANGE_RE, "").replace(/[()\[\]:–—-]+\s*$/, "").replace(/^\s*[()\[\]:–—-]+/, "").trim();
          sections.push({ title: title, from: from, to: to });
        }
        closeCurrent();
        return;
      }

      var sm = line.match(STEM_RE);
      if (sm) {
        var n = parseInt(sm[1], 10);
        var rest = sm[2].trim();
        // "1. A" alone is an answer-key line, not a question stem
        if (n >= 1 && n <= MAX_Q && !/^[A-E]$/.test(rest)) {
          closeCurrent();
          current = { n: n, stem: rest, options: {}, lastOption: null };
          return;
        }
      }

      if (current) {
        var om = line.match(OPTION_RE);
        if (om) {
          current.options[om[1]] = om[2];
          current.lastOption = om[1];
          return;
        }
        // continuation line: belongs to the last option or the stem
        if (current.lastOption) current.options[current.lastOption] += " " + line;
        else current.stem += " " + line;
      }
    });
    closeCurrent();

    var nums = Object.keys(questions).map(Number).sort(function (a, b) { return a - b; });
    var complete = 0;
    var incomplete = [];
    nums.forEach(function (n) {
      var q = questions[n];
      q.complete = Object.keys(q.options).length >= 2;
      if (q.complete) complete++;
      else incomplete.push(n);
    });

    if (incomplete.length) {
      warnings.push("Question" + (incomplete.length === 1 ? "" : "s") + " " + incomplete.slice(0, 10).join(", ") +
        (incomplete.length > 10 ? "…" : "") + " — wording was found but fewer than two answer choices could be read. Shown as partial.");
    }

    return {
      isExam: nums.length >= 2,
      questions: questions,
      found: nums.length,
      complete: complete,
      incomplete: incomplete,
      maxQ: nums.length ? nums[nums.length - 1] : 0,
      sections: sections,
      warnings: warnings
    };
  }

  // ---------- passage text ----------

  // -> { title, titleSource, wordCount, ranges:[{from,to}], text }
  function parsePassageText(text, fallbackTitle) {
    var lines = String(text || "").split(/\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var title = "";
    var titleSource = "filename";
    if (lines.length && lines[0].length <= 80 && !/^\d/.test(lines[0])) {
      title = lines[0].replace(/^["“]|["”]$/g, "");
      titleSource = "first line";
    }
    if (!title) title = fallbackTitle || "Untitled passage";

    var ranges = [];
    lines.forEach(function (line) {
      var m = line.match(RANGE_RE);
      if (m) {
        var from = parseInt(m[1], 10), to = parseInt(m[2], 10);
        if (from >= 1 && to >= from && to <= MAX_Q) ranges.push({ from: from, to: to });
      }
    });

    var body = lines.join(" ");
    return {
      title: title,
      titleSource: titleSource,
      wordCount: body ? body.split(/\s+/).length : 0,
      ranges: ranges,
      text: text
    };
  }

  // ---------- PDF entry points (async) ----------

  function parseExamPDF(buffer) {
    return ED.pdf.extractText(buffer).then(function (res) {
      if (!res.ok) return res; // honest scanned/encoded/empty refusal from pdf-extract
      // adapter dispatch: real questions booklets (flowed, a/b/c/d options)
      if (ED.ingest) {
        var cls = ED.ingest.classify(res.text);
        if (cls.type === "questions_booklet") {
          var qb = ED.ingest.parseQuestionsBooklet(res.text);
          if (qb.ok) { qb.pagesRead = res.pages.length; qb.imagesDetected = res.imageCount; return qb; }
        }
        if (cls.type === "readings_booklet") {
          var rb = ED.ingest.parseReadingsBooklet(res);
          if (rb.ok) { rb.isExam = false; rb.isReadings = true; rb.pagesRead = res.pages.length; rb.imagesDetected = res.imageCount; return rb; }
        }
      }
      var parsed = parseExamText(res.text);
      parsed.ok = true;
      parsed.kind = "text";
      parsed.pagesRead = res.pages.length; parsed.imagesDetected = res.imageCount;
      return parsed;
    });
  }

  function parsePassagePDF(buffer, fallbackTitle) {
    return ED.pdf.extractText(buffer).then(function (res) {
      if (!res.ok) return res;
      var parsed = parsePassageText(res.text, fallbackTitle);
      parsed.ok = true;
      parsed.kind = "text";
      return parsed;
    });
  }

  // ---------- assemble evidence from parsed Step-3 files ----------

  function normTitle(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  // entries: [{ kind:"exam"|"passage", exam, passage, name }]
  // -> { questions, sections:[{title,from,to,passage|null}],
  //      passages:[{title,wordCount,linked,from,to,how,file}],
  //      coverage:{withText, complete, incomplete:[]}, warnings:[] }
  function assemble(entries) {
    var questions = {};
    var sections = [];
    var passages = [];
    var incomplete = [];
    var warnings = [];

    entries.forEach(function (e) {
      // multi-selection readings booklets: one passage per selection,
      // linked by the explicit question ranges in the booklet itself
      if (e.kind === "readings" && e.selections) {
        e.selections.forEach(function (sel) {
          passages.push({
            title: sel.title,
            titleSource: "booklet header",
            wordCount: sel.wordCount,
            ranges: [{ from: sel.from, to: sel.to }],
            file: e.name,
            excerpt: sel.excerpt || "",
            visualPages: sel.visualPages || [],
            isVisual: !!sel.isVisual,
            genre: sel.genre || "",
            linked: false, from: null, to: null, how: ""
          });
        });
        return;
      }
      if (e.kind === "exam" && e.exam) {
        Object.keys(e.exam.questions).forEach(function (n) {
          if (!questions[n]) questions[n] = e.exam.questions[n]; // first file wins; duplicates warned below
          else warnings.push("Question " + n + " appears in more than one exam file — the first file’s wording was kept.");
        });
        e.exam.sections.forEach(function (sec) { sections.push(Object.assign({ file: e.name }, sec)); });
        (e.exam.incomplete || []).forEach(function (n) { if (incomplete.indexOf(n) === -1) incomplete.push(n); });
      } else if (e.kind === "passage" && e.passage) {
        passages.push({
          title: e.passage.title,
          titleSource: e.passage.titleSource,
          wordCount: e.passage.wordCount,
          ranges: e.passage.ranges || [],
          file: e.name,
          // capped excerpt of the REAL uploaded passage text (for AI evidence
          // packets and teacher reference) — verbatim, never synthesized
          excerpt: String(e.passage.text || "").replace(/\s+/g, " ").trim().slice(0, 1200),
          linked: false, from: null, to: null, how: ""
        });
      }
    });

    // Link passages to ranges — explicit evidence only.
    passages.forEach(function (p) {
      // 1) an exam section marker whose title matches the passage title
      for (var i = 0; i < sections.length; i++) {
        var st = normTitle(sections[i].title);
        var pt = normTitle(p.title);
        if (st && pt && (st === pt || st.indexOf(pt) !== -1 || pt.indexOf(st) !== -1)) {
          p.linked = true; p.from = sections[i].from; p.to = sections[i].to;
          p.how = "matched the exam’s “" + sections[i].title + " (Questions " + sections[i].from + "–" + sections[i].to + ")” marker";
          sections[i].passage = p;
          return;
        }
      }
      // 2) the passage itself says "Questions X–Y"
      if (p.ranges.length) {
        p.linked = true; p.from = p.ranges[0].from; p.to = p.ranges[0].to;
        p.how = "the passage file itself says “Questions " + p.from + "–" + p.to + "”";
        return;
      }
      warnings.push("Passage “" + p.title + "” (" + p.file + ") couldn’t be confidently linked to any questions — no “Questions X–Y” marker matched it. It’s kept as unmatched; nothing was guessed.");
    });

    var withText = Object.keys(questions).length;
    return {
      questions: questions,
      sections: sections,
      passages: passages,
      coverage: { withText: withText, complete: withText - incomplete.length, incomplete: incomplete },
      warnings: warnings
    };
  }

  ED.examText = {
    parseExamText: parseExamText,
    parsePassageText: parsePassageText,
    parseExamPDF: parseExamPDF,
    parsePassagePDF: parsePassagePDF,
    assemble: assemble,
    trunc: trunc
  };
})();
