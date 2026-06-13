/* ============================================================
   Exam Detective — document ingestion: classification + adapters

   Architecture: every uploaded document is (1) text-extracted with
   provenance (js/pdf-extract.js — CID/CMap-aware, per page, image
   detection), (2) CLASSIFIED by content signatures, then (3) parsed
   by the matching ADAPTER. Adapters are independent and extensible —
   new report formats get new adapters, not rewrites.

   Honesty rules carried through every adapter:
   - nothing is guessed or invented; gaps are reported as gaps
   - counts derived from percentages are labeled as estimates
   - image/comic/graph content is flagged as visual evidence that is
     NOT machine-readable in this build (no OCR / no vision model)
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  // normalize flowed text (word-per-line PDFs) into one searchable line
  function flow(text) { return String(text || "").replace(/\s+/g, " ").trim(); }

  // ---------- document classification ----------

  // -> { type: student_results|answer_key|questions_booklet|readings_booklet|
  //            visual_source|unknown_or_failed, signals: [..] }
  function classify(text, fileName) {
    var f = flow(text);
    var name = String(fileName || "").toLowerCase();
    var signals = [];

    var resultSigs = 0;
    [/assessment analysis/i, /assessment statistics/i, /number of responses/i,
     /item analysis/i, /average score/i, /discrimination/i, /response distribution/i].forEach(function (re) {
      if (re.test(f)) { resultSigs++; signals.push(re.source); }
    });
    var qBlocks = (f.match(/Question \d+/g) || []).length;
    if (resultSigs >= 3 && qBlocks >= 3) return { type: "student_results", signals: signals.concat(["repeated Question N ×" + qBlocks]) };

    // Both booklets mention each other on their covers, so decide by
    // CONTENT signatures, not by which booklet name appears first:
    // questions booklets are dense with a./b./c./d. option runs; readings
    // booklets have roman-numeral selection headers and long prose.
    var optionRuns0 = (f.match(/\ba\.\s[^.]{2,80}?\bb\.\s/gi) || []).length;
    var romanHeads = (f.match(/\b[IVXL]{1,5}\.\s+Read the (short story|poem|article|essay|letter|comic|following comic)/gi) || []).length;
    if (optionRuns0 >= 10 && (f.match(/answer questions\s+\d+\s*-\s*\d+/gi) || []).length >= 2) {
      return { type: "questions_booklet", signals: ["a/b/c/d option runs ×" + optionRuns0, "question ranges"] };
    }
    if (romanHeads >= 2) {
      return { type: "readings_booklet", signals: ["roman-numeral reading selection headers ×" + romanHeads] };
    }
    if (/questions\s+booklet/i.test(f) && optionRuns0 >= 3) {
      return { type: "questions_booklet", signals: ["QUESTIONS BOOKLET heading", "option runs"] };
    }
    if (/readings\s+booklet/i.test(f) && /reading selections/i.test(f) && optionRuns0 < 3) {
      return { type: "readings_booklet", signals: ["READINGS BOOKLET heading"] };
    }

    var keyPairs = (f.match(/\b\d{1,3}\s*\.\s*[A-Ea-e](?![a-zA-Z0-9])/g) || []).length;
    if (/answer key/i.test(f) && keyPairs >= 10) {
      return { type: "answer_key", signals: ["Answer key heading", keyPairs + " numbered answer pairs"] };
    }
    // fallback signatures without headings
    if (keyPairs >= 20 && f.length < keyPairs * 40) return { type: "answer_key", signals: [keyPairs + " compact answer pairs"] };
    var ranges = (f.match(/answer questions\s+\d+\s*-\s*\d+/gi) || []).length;
    var optionRuns = (f.match(/\ba\.\s[^.]{2,80}?\bb\.\s/gi) || []).length;
    if (ranges >= 2 && optionRuns >= 5) return { type: "questions_booklet", signals: ["question ranges + a/b/c/d options"] };
    if (ranges >= 2 && /read the (short story|poem|article|essay|letter|comic)/i.test(f)) {
      return { type: "readings_booklet", signals: ["reading selections with question ranges"] };
    }
    if (name.indexOf("key") !== -1 && keyPairs >= 5) return { type: "answer_key", signals: ["file name + pairs"] };

    return { type: "unknown_or_failed", signals: [] };
  }

  // ---------- adapter: SmartMarks / Assessment Analysis result PDFs ----------
  // Block layout per page:  Question N / Average score: X% / Discrimination: Y
  //   / Response distribution / Marks / A. 0.0 / B. 1.0 / ... ; the four
  //   distribution percentages render as chart labels elsewhere on the SAME
  //   page, anchored by two ▼ marks, one group per question in page order.

  function parseSmartMarks(extractRes, opts) {
    opts = opts || {};
    var warnings = [];
    var fullFlow = flow(extractRes.text);

    var responses = 0;
    var rm = fullFlow.match(/Number of responses\s+(\d{1,4})\b/i);
    if (rm) responses = parseInt(rm[1], 10);
    else warnings.push("“Number of responses” wasn’t found — student count unknown.");

    var perQ = {};       // n -> {avg, disc, correct, distribution}
    var orderProblems = [];

    (extractRes.pages || []).forEach(function (pg) {
      var lines = String(pg.text).split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);

      // 1) question blocks on this page, in order
      var blocks = [];
      for (var i = 0; i < lines.length; i++) {
        var qm = lines[i].match(/^Question (\d{1,3})$/);
        if (!qm) continue;
        var b = { n: parseInt(qm[1], 10), avg: null, disc: null, correct: null, page: pg.page };
        for (var j = i + 1; j < Math.min(i + 30, lines.length); j++) {
          if (/^Question \d+$/.test(lines[j])) break;
          if (lines[j] === "Average score:" && /^\d{1,3}%$/.test(lines[j + 1] || "")) b.avg = parseInt(lines[j + 1], 10);
          if (lines[j] === "Discrimination:" && /^-?[\d.]+$/.test(lines[j + 1] || "")) b.disc = parseFloat(lines[j + 1]);
          var lm = lines[j].match(/^([A-E])\.$/);
          if (lm && /^[\d.]+$/.test(lines[j + 1] || "") && parseFloat(lines[j + 1]) === 1) b.correct = lm[1];
        }
        blocks.push(b);
      }

      // 2) distribution groups on this page: ▼ ▼ then four percents
      var groups = [];
      for (var k = 0; k < lines.length - 5; k++) {
        if (lines[k] === "▼" && lines[k + 1] === "▼") {
          var four = [lines[k + 2], lines[k + 3], lines[k + 4], lines[k + 5]];
          if (four.every(function (x) { return /^\d{1,3}%$/.test(x); })) {
            groups.push(four.map(function (x) { return parseInt(x, 10); }));
            k += 5;
          }
        }
      }

      if (blocks.length && groups.length !== blocks.length) {
        orderProblems.push("page " + pg.page + ": " + blocks.length + " question blocks but " + groups.length + " distribution groups");
      }
      blocks.forEach(function (b, idx) {
        var g = groups.length === blocks.length ? groups[idx] : null;
        perQ[b.n] = {
          avg: b.avg, disc: b.disc, correct: b.correct,
          distribution: g ? { A: g[0], B: g[1], C: g[2], D: g[3] } : null,
          page: b.page
        };
      });
    });

    var qs = Object.keys(perQ).map(Number).sort(function (a, b) { return a - b; });
    if (qs.length < 3) {
      return { ok: false, error: "This looks like a SmartMarks / Assessment Analysis PDF, but the parser couldn’t extract the question blocks. Please report this as a parser bug (include the export tool and version if you can)." };
    }

    // validation
    var maxQ = qs[qs.length - 1];
    var missing = [];
    for (var q = 1; q <= maxQ; q++) if (!perQ[q]) missing.push(q);
    if (missing.length) warnings.push("No block found for question" + (missing.length === 1 ? "" : "s") + " " + missing.slice(0, 12).join(", ") + (missing.length > 12 ? "…" : "") + " — question numbers aren’t continuous.");
    if (orderProblems.length) warnings.push("Distribution groups couldn’t be aligned on " + orderProblems.join("; ") + " — distributions for those pages were left blank rather than guessed.");

    var questions = {};
    var checks = { noCorrect: [], avgMismatch: [], badSum: [] };
    qs.forEach(function (q) {
      var d = perQ[q];
      if (!d.correct) checks.noCorrect.push(q);
      if (d.distribution) {
        var sum = d.distribution.A + d.distribution.B + d.distribution.C + d.distribution.D;
        if (Math.abs(sum - 100) > 4) checks.badSum.push(q + " (sums to " + sum + "%)");
        if (d.correct && d.avg !== null && Math.abs(d.distribution[d.correct] - d.avg) > 2) {
          checks.avgMismatch.push("Q" + q + " (key " + d.correct + " has " + d.distribution[d.correct] + "% but average score is " + d.avg + "%)");
        }
      }
      var dist = null;
      if (d.distribution) {
        dist = {};
        Object.keys(d.distribution).forEach(function (L) { dist[L] = d.distribution[L]; });
      }
      questions[q] = {
        distribution: dist,                       // PERCENT shares (sum ≈ 100)
        correctCount: 0, incorrectCount: 0, blankCount: 0,
        missedPct: d.avg !== null ? 100 - d.avg : null,
        keyedFromFile: d.correct || null,
        discrimination: d.disc
      };
    });
    if (checks.noCorrect.length) warnings.push("No Marks=1.0 row (correct answer) found for question" + (checks.noCorrect.length === 1 ? "" : "s") + " " + checks.noCorrect.join(", ") + ".");
    if (checks.badSum.length) warnings.push("Distribution percentages don’t sum to ~100% for question" + (checks.badSum.length === 1 ? "" : "s") + " " + checks.badSum.join(", ") + ".");
    if (checks.avgMismatch.length) warnings.push("Average score doesn’t match the correct-answer share for " + checks.avgMismatch.join("; ") + " — worth checking in the source report.");
    if (responses) warnings.push("Per-option counts are estimated from percentages × " + responses + " responses — the report publishes percentages, not raw counts.");

    return {
      ok: true,
      format: "PDF · SmartMarks item analysis",
      warnings: warnings,
      sections: [{
        id: opts.defaultSection || "Class 1",
        responses: responses,
        questionCount: maxQ,
        mode: "aggregate",
        questions: questions,
        studentScores: null,
        warnings: []
      }]
    };
  }

  // ---------- visual-dependency detection ----------

  var VISUAL_WORDS = [
    ["comic", "comic"], ["cartoon", "comic"], ["image", "image"], ["picture", "image"],
    ["photograph", "image"], ["figure", "figure"], ["graph", "graph"], ["chart", "chart"],
    ["diagram", "diagram"], ["map", "map"], ["visual", "visual"], ["illustration", "image"],
    ["panel", "comic"], ["frame", "comic"]
  ];
  function visualDependency(stemText, sectionIsComic) {
    if (sectionIsComic) return { dep: true, type: "comic" };
    var low = " " + String(stemText).toLowerCase() + " ";
    for (var i = 0; i < VISUAL_WORDS.length; i++) {
      if (low.indexOf(" " + VISUAL_WORDS[i][0]) !== -1) return { dep: true, type: VISUAL_WORDS[i][1] };
    }
    return { dep: false, type: null };
  }

  // ---------- adapter: questions booklet ----------
  // Flowed layout: section headers "Read the <genre> “Title” … on pages X-Y …
  // answer questions A - B." then "N. stem a. choice b. choice c. … d. …".
  // Output matches ED.examText.parseExamText so the evidence pipeline,
  // wizard, and analysis builder work unchanged.

  function parseQuestionsBooklet(text) {
    var f = flow(text);
    var sections = [];
    var secRe = /Read the\s+(?:[“"]([^”"]+)[”"]\s+)?(short story|poem|article|essay|letter|comic|following comic)\s([\s\S]{0,160}?)answer questions\s+(\d{1,3})\s*-\s*(\d{1,3})\.?/gi;
    var m;
    while ((m = secRe.exec(f))) {
      var mid = m[3] || "";
      var quoted = m[1] ? [null, m[1]] : mid.match(/[“"]([^”"]+)[”"]/);
      var pr = mid.match(/on pages?\s+([\d\s-]+)\s+of/i);
      var genre = m[2].replace(/^following /, "");
      sections.push({
        genre: genre,
        title: quoted ? quoted[1] : (genre === "comic" ? "Comic" : "Untitled selection"),
        pageRange: pr ? pr[1].replace(/\s+/g, "") : null,
        from: parseInt(m[4], 10), to: parseInt(m[5], 10),
        idx: m.index, end: secRe.lastIndex
      });
    }
    function sectionFor(n) {
      for (var i = 0; i < sections.length; i++) {
        if (n >= sections[i].from && n <= sections[i].to) return sections[i];
      }
      return null;
    }

    // Range-driven anchoring: question numbers are searched only inside
    // their own section, AFTER its header — cover-page example questions
    // and stray numbers in prose can't hijack the sequence.
    var anchors = [];
    var notFound = [];
    sections.forEach(function (sec, si) {
      var searchFrom = sec.end;
      var bound = si + 1 < sections.length ? sections[si + 1].idx : f.length;
      for (var n = sec.from; n <= sec.to; n++) {
        var re = new RegExp("(?:^|\\s)" + n + "\\.\\s");
        re.lastIndex = 0;
        var sub = f.slice(searchFrom, bound);
        var am = re.exec(sub);
        if (!am) { notFound.push(n); continue; }
        var idx = searchFrom + am.index + am[0].indexOf(String(n));
        anchors.push({ n: n, idx: idx, bound: bound });
        searchFrom = idx + String(n).length;
      }
    });

    var questions = {};
    var incomplete = [];
    anchors.forEach(function (a, i) {
      var endIdx = a.bound;
      if (i + 1 < anchors.length && anchors[i + 1].idx < endIdx) endIdx = anchors[i + 1].idx;
      var body = f.slice(a.idx, endIdx).replace(/^\d{1,3}\.\s*/, "");
      var parts = body.split(/\s(?=[a-dA-D][.)]\s)/);
      var stem = parts[0].trim();
      var options = {};
      parts.slice(1).forEach(function (p) {
        var om = p.match(/^([a-dA-D])[.)]\s+([\s\S]*)$/);
        if (om) options[om[1].toUpperCase()] = om[2].trim();
      });
      var sec = sectionFor(a.n);
      var vis = visualDependency(stem, !!(sec && /comic/i.test(sec.genre + " " + sec.title)));
      var complete = Object.keys(options).length >= 2;
      if (!complete) incomplete.push(a.n);
      questions[a.n] = {
        stem: stem, options: options, complete: complete,
        visualDependency: vis.dep, visualType: vis.type,
        section: sec ? sec.title : null
      };
    });

    var nums = Object.keys(questions).map(Number);
    var warnings = [];
    if (incomplete.length) warnings.push("The questions booklet was readable, but question" + (incomplete.length === 1 ? "" : "s") + " " + incomplete.join(", ") + " ha" + (incomplete.length === 1 ? "s" : "ve") + " incomplete answer choices.");
    if (notFound.length) warnings.push("Question" + (notFound.length === 1 ? "" : "s") + " " + notFound.join(", ") + " from the section ranges couldn’t be located in the text.");
    return {
      ok: nums.length >= 5,
      isExam: nums.length >= 5,
      kind: "text",
      questions: questions,
      found: nums.length,
      complete: nums.length - incomplete.length,
      incomplete: incomplete,
      maxQ: nums.length ? Math.max.apply(null, nums) : 0,
      sections: sections.map(function (s) { return { title: s.title, from: s.from, to: s.to, genre: s.genre, pageRange: s.pageRange }; }),
      warnings: warnings,
      error: nums.length >= 5 ? null : "This looks like a questions booklet, but the numbered questions couldn’t be split out. Please report this as a parser bug."
    };
  }

  // ---------- adapter: readings booklet ----------
  // Roman-numeral selection headers; line-numbered passages; pages with
  // embedded images flagged as visual evidence (NOT machine-readable —
  // no OCR/vision in this build).

  function parseReadingsBooklet(extractRes) {
    var f = flow(extractRes.text);
    var pages = extractRes.pages || [];
    var visualPages = extractRes.visualPages || [];

    var headRe = /\b([IVXL]{1,5})\.\s+Read the (short story|poem|article|essay|letter|comic|following comic)\s*([\s\S]{0,160}?)answer questions\s+(\d{1,3})\s*-?\s*(\d{1,3})(?:\s+from your Questions\s+Booklet)?\.?/gi;
    var heads = [];
    var m;
    while ((m = headRe.exec(f))) {
      heads.push({ roman: m[1], genre: m[2].replace(/^following /, ""), mid: m[3] || "", from: parseInt(m[4], 10), to: parseInt(m[5], 10), idx: m.index, end: headRe.lastIndex });
    }
    if (heads.length < 2) {
      return { ok: false, error: "This looks like a readings booklet, but the reading selections couldn’t be split out. Please report this as a parser bug." };
    }

    // which page each header starts on (flow offsets per page)
    var pageStarts = [];
    var off = 0;
    pages.forEach(function (p) {
      pageStarts.push({ page: p.page, start: off });
      off += flow(p.text).length + 1;
    });
    function pageOf(idx) {
      var pg = 1;
      pageStarts.forEach(function (ps) { if (idx >= ps.start) pg = ps.page; });
      return pg;
    }

    var selections = heads.map(function (h, i) {
      var bodyEnd = i + 1 < heads.length ? heads[i + 1].idx : f.length;
      var body = f.slice(h.end, bodyEnd);
      var quoted = h.mid.match(/“([^”]+)”/);
      var author = (h.mid.match(/by\s+([A-Z][\w.\s-]{2,40}?)(?:,|\s+and\s|\s+on\s|$)/) || [])[1] || null;
      var title = quoted ? quoted[1] : null;
      if (!title) {
        // title is the first short run of body text before line numbers/byline
        var tm = body.match(/^\s*[“"]?(.{3,70}?)[”"]?\s+(?:by\s|By\s|1\s)/i);
        title = tm ? tm[1].trim() : (h.genre === "comic" ? "Comic" : "Untitled selection");
      }
      if (!author) {
        var am2 = body.slice(0, 200).match(/\b[bB]y\s+([A-Z][\w.\s-]{2,40}?)(?:\s+1\s|\s{2}|$)/);
        if (am2) author = am2[1].trim();
      }
      var startPage = pageOf(h.idx);
      var endPage = i + 1 < heads.length ? pageOf(heads[i + 1].idx) : (pages.length || startPage);
      var selVisualPages = visualPages.filter(function (p) { return p >= startPage && p <= endPage; });
      var lineNumbered = /\s1\s+5\s+10\s/.test(" " + body.slice(0, 400) + " ") || /\s5\s+10\s+15\s/.test(" " + body.slice(0, 400) + " ");
      return {
        selectionNumber: i + 1,
        roman: h.roman,
        genre: h.genre,
        title: title,
        author: author,
        from: h.from, to: h.to,
        pageRange: [startPage, Math.max(startPage, endPage)],
        wordCount: body.split(/\s+/).length,
        lineNumbered: lineNumbered,
        visualPages: selVisualPages,
        isVisual: h.genre === "comic",
        hasImages: selVisualPages.length > 0,
        text: body.slice(0, 20000),
        excerpt: body.slice(0, 1200)
      };
    });

    var warnings = [];
    if (visualPages.length) {
      warnings.push("Page" + (visualPages.length === 1 ? "" : "s") + " " + visualPages.join(", ") + " contain embedded images. Text extraction alone cannot fully interpret image/comic content — there’s no OCR or vision model in this build, so those pages are flagged as visual evidence for review by eye.");
    }
    return { ok: true, kind: "text", selections: selections, warnings: warnings, visualPages: visualPages };
  }

  ED.ingest = {
    classify: classify,
    flow: flow,
    parseSmartMarks: parseSmartMarks,
    parseQuestionsBooklet: parseQuestionsBooklet,
    parseReadingsBooklet: parseReadingsBooklet,
    visualDependency: visualDependency
  };
})();
