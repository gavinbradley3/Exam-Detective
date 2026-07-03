/* ============================================================
   Exam Detective — analysis builder for UPLOADED data
   Takes parsed CSV sections (js/csv-parse.js) plus the answer
   key and produces the same analysis shape the demo data uses —
   but every number and every sentence here is computed from the
   actual uploaded data. Nothing is invented:
   - flags come from transparent thresholds (documented inline)
   - prose is assembled from the computed numbers
   - judgments that require reading the exam text (rewrites,
     "hard but fair", passage support) are NOT made — the output
     says so instead.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  function pctOf(part, whole) { return whole ? Math.round((part / whole) * 100) : 0; }

  function median(nums) {
    if (!nums.length) return 0;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  }

  // Score one section's letter-mode questions against the key.
  // Mutates missedPct on each question entry.
  function scoreLettersAgainstKey(section, key) {
    Object.keys(section.questions).forEach(function (qs) {
      var q = parseInt(qs, 10);
      var qd = section.questions[q];
      if (qd.missedPct !== null) return; // already scored (correctness/aggregate)
      var keyed = key && key[q - 1];
      if (!keyed || !qd.distribution) return;
      var answered = 0, correct = 0;
      Object.keys(qd.distribution).forEach(function (L) {
        answered += qd.distribution[L];
        if (L === keyed) correct += qd.distribution[L];
      });
      if (!answered) {
        // Nobody answered this question. That is NOT a 100% miss rate —
        // it's missing data. Leave it unscored and say so (dataQuality).
        qd.noResponses = true;
        return;
      }
      // blanks among otherwise-answering students do count as missed
      qd.missedPct = pctOf(answered + qd.blankCount - correct, answered + qd.blankCount);
    });
  }

  // Does this question have ANY recorded responses in this section?
  function hasResponses(qd) {
    if (!qd) return false;
    if (qd.noResponses) return false;
    var dist = qd.distribution || {};
    var answered = Object.keys(dist).reduce(function (a, k) { return a + dist[k]; }, 0);
    return !!(answered || qd.correctCount || qd.incorrectCount);
  }

  function distributionShares(qd, responses) {
    if (!qd.distribution) return null;
    var total = Object.keys(qd.distribution).reduce(function (a, L) { return a + qd.distribution[L]; }, 0);
    if (!total) return null;
    // Aggregate files may store percents rather than counts; if the values
    // sum close to 100 and responses differ, treat them as percents.
    var asPercents = responses && Math.abs(total - 100) <= 3 && total !== responses;
    var shares = {};
    Object.keys(qd.distribution).forEach(function (L) {
      shares[L] = asPercents ? Math.round(qd.distribution[L]) : pctOf(qd.distribution[L], total);
    });
    return shares;
  }

  function mostChosen(shares) {
    var best = null;
    Object.keys(shares || {}).forEach(function (L) {
      if (best === null || shares[L] > shares[best]) best = L;
    });
    return best;
  }

  // ---------- the builder ----------

  // input: {
  //   setup: { examName, subject, grade, examType },
  //   sections: [parsed section objects],
  //   key: ["A","C",...] | null,
  //   meta: { filesUploaded, filesParsed, unparsedFiles: [names] },
  //   examEvidence: output of ED.examText.assemble(...) | null
  //     (real extracted question wording / passages; never invented)
  // }
  function build(input) {
    var setup = input.setup || {};
    var sections = input.sections || [];
    var key = input.key && input.key.length ? input.key : null;
    var meta = input.meta || { filesUploaded: 0, filesParsed: 0, unparsedFiles: [] };
    var uploadAudit = input.uploadAudit || null;
    var ev = input.examEvidence && input.examEvidence.coverage && input.examEvidence.coverage.withText
      ? input.examEvidence : null;
    var esc = ED.analysis.esc;
    var trunc = ED.examText ? ED.examText.trunc : function (s) { return s; };

    // Extracted wording for one question, or null. Never invented.
    function qText(q) { return ev && ev.questions[q] ? ev.questions[q] : null; }

    sections.forEach(function (s) { if (s.mode === "letters") scoreLettersAgainstKey(s, key); });

    var totalQuestions = sections.reduce(function (m, s) { return Math.max(m, s.questionCount); }, 0);
    var totalResponses = sections.reduce(function (a, s) { return a + (s.responses || 0); }, 0);

    // Per-section averages/medians from the best information available.
    var secSummaries = sections.map(function (s) {
      var avg, med;
      if (s.studentScores && s.studentScores.length) {
        avg = Math.round(s.studentScores.reduce(function (a, b) { return a + b; }, 0) / s.studentScores.length);
        med = median(s.studentScores);
      } else if (s.mode === "letters" && s.rows && key) {
        // score only questions that actually have responses — a question
        // nobody answered must not drag every student's average down
        var scoreable = [];
        for (var sq = 1; sq <= s.questionCount; sq++) {
          var sqd = s.questions[sq];
          if (!sqd || !sqd.noResponses) scoreable.push(sq);
        }
        var scores = (s.rows || []).map(function (row) {
          var c = 0;
          scoreable.forEach(function (q) { if (row[q] && row[q] === key[q - 1]) c++; });
          return pctOf(c, scoreable.length || 1);
        });
        avg = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
        med = median(scores);
        s.studentScores = scores;
      } else {
        // aggregate: estimate from question results
        var known = [];
        for (var q2 = 1; q2 <= s.questionCount; q2++) {
          var qd = s.questions[q2];
          if (qd && qd.missedPct !== null) known.push(100 - qd.missedPct);
        }
        avg = known.length ? Math.round(known.reduce(function (a, b) { return a + b; }, 0) / known.length) : 0;
        med = null; // honest: can't compute a real median from aggregates
      }
      return { id: s.id, responses: s.responses, average: avg, median: med, mode: s.mode };
    });

    var combinedAverage = secSummaries.length
      ? Math.round(secSummaries.reduce(function (a, s) { return a + s.average * (s.responses || 1); }, 0) /
                   Math.max(totalResponses, 1))
      : 0;
    var medians = secSummaries.filter(function (s) { return s.median !== null; }).map(function (s) { return s.median; });
    var combinedMedian = medians.length ? median(medians) : null;

    // ---- groups: from explicit exam section markers when available ----
    var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    var groups = [];
    if (ev && ev.sections.length) {
      ev.sections.forEach(function (sec, i) {
        groups.push({
          id: i,
          roman: ROMAN[i] || String(i + 1),
          title: sec.title || "Section " + (i + 1),
          range: [sec.from, sec.to],
          passage: sec.passage ? sec.passage.title : null
        });
      });
      groups.push({ id: groups.length, roman: ROMAN[groups.length] || "•", title: "Other questions", range: [1, totalQuestions], catchAll: true });
    } else {
      groups.push({ id: 0, roman: "I", title: "All exam questions (uploaded results)", range: [1, totalQuestions] });
    }
    function groupFor(q) {
      for (var i = 0; i < groups.length; i++) {
        if (!groups[i].catchAll && q >= groups[i].range[0] && q <= groups[i].range[1]) return groups[i];
      }
      return groups[groups.length - 1];
    }

    // ---- per-question grid ----
    var allQuestions = [];
    for (var q = 1; q <= totalQuestions; q++) {
      var missedBySection = {};
      var vals = [];
      sections.forEach(function (s) {
        var qd = s.questions[q];
        var v = qd && qd.missedPct !== null && qd.missedPct !== undefined ? qd.missedPct : null;
        missedBySection[s.id] = v;
        if (v !== null) vals.push(v);
      });
      allQuestions.push({
        number: q,
        group: groupFor(q),
        missedBySection: missedBySection,
        minMissed: vals.length ? Math.min.apply(null, vals) : 0,
        maxMissed: vals.length ? Math.max.apply(null, vals) : 0,
        combinedMissed: vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0,
        unscored: !vals.length
      });
    }

    // Questions that exist in the files but have no recorded responses
    // anywhere — reported as missing data, never as "100% missed".
    var noResponseQs = allQuestions.filter(function (aq) {
      return aq.unscored && sections.some(function (s2) {
        var qd = s2.questions[aq.number];
        return qd && !hasResponses(qd);
      });
    }).map(function (aq) { return aq.number; });

    // Evidence coverage counts only questions that exist in THIS result
    // set — exam text for question numbers beyond the results is ignored.
    var evInRange = ev ? Object.keys(ev.questions).map(Number).filter(function (n) {
      return n >= 1 && n <= totalQuestions;
    }).length : 0;
    var evIncompleteInRange = ev ? ev.coverage.incomplete.filter(function (n) { return n <= totalQuestions; }).length : 0;

    // ---- flagging rules (transparent thresholds) ----
    var flagged = [];
    var keyConflicts = [];

    allQuestions.forEach(function (aq) {
      if (aq.unscored) return;
      var q = aq.number;
      var keyed = key ? key[q - 1] : null;

      // Combine distributions across sections for a department-wide view.
      var combinedShares = null;
      var perSectionMost = {};
      sections.forEach(function (s) {
        var qd = s.questions[q];
        if (!qd) return;
        var shares = distributionShares(qd, s.responses);
        if (!shares) return;
        perSectionMost[s.id] = mostChosen(shares);
        combinedShares = combinedShares || {};
        Object.keys(shares).forEach(function (L) {
          combinedShares[L] = (combinedShares[L] || 0) + shares[L] * (s.responses || 1);
        });
      });
      if (combinedShares) {
        Object.keys(combinedShares).forEach(function (L) {
          combinedShares[L] = Math.round(combinedShares[L] / Math.max(totalResponses, 1));
        });
      }
      var most = combinedShares ? mostChosen(combinedShares) : null;
      var keyedShare = combinedShares && keyed ? (combinedShares[keyed] || 0) : null;
      var mostShare = combinedShares && most ? combinedShares[most] : null;

      // Key conflict recorded in the file itself?
      var fileKeys = {};
      sections.forEach(function (s) {
        var qd = s.questions[q];
        if (qd && qd.keyedFromFile) fileKeys[qd.keyedFromFile] = true;
      });
      var fileKeyList = Object.keys(fileKeys);
      var fileKeyConflict = key && fileKeyList.length && fileKeyList.some(function (L) { return L !== keyed; });

      // ---- deterministic issue-category engine ----
      // Every category below is decided by a transparent data rule; the
      // wording stays cautious ("possible") because the app never judges
      // content. Thresholds are visible here on purpose.
      var maxWrongShare = 0, maxWrongLetter = null;
      if (combinedShares && keyed) {
        Object.keys(combinedShares).forEach(function (L) {
          if (L !== keyed && combinedShares[L] > maxWrongShare) {
            maxWrongShare = combinedShares[L]; maxWrongLetter = L;
          }
        });
      }

      var f = null;

      // CATEGORY: Possible key error — one non-keyed answer wins decisively
      //   (most-chosen ≥ 50% while the keyed answer draws ≤ 25%).
      if (keyed && most && most !== keyed && mostShare >= 50 && keyedShare <= 25) {
        f = {
          flag: "Possible Key Error",
          issueCategory: "Possible key error",
          severity: "High",
          secondaryFlags: ["Immediate Action"],
          confidence: keyedShare <= 10 ? "High" : "Medium",
          pattern: mostShare + "% of students chose " + most + ", while the keyed answer " + keyed + " drew only " + keyedShare + "%.",
          problem: "<b>" + mostShare + "% of students chose " + most + "</b> while the keyed answer (" + keyed + ") drew only " + keyedShare + "%. When one non-keyed answer wins this decisively, the key document is the usual suspect. " +
            (qText(q)
              ? "The question\u2019s wording from your uploaded exam is quoted below \u2014 read it and check whether " + most + " is the better answer before rescoring."
              : "<b>Exam Detective has not read this question\u2019s text</b> (none was uploaded), so this is a data signal, not a verdict \u2014 check answer " + most + " against the question before rescoring."),
          immediate: "<b class=\"act\">Check the key for this question against the exam text.</b> If " + most + " is correct, rescore with " + most + ". If the key is right after all, this question goes on the revision list instead.",
          nextYearNote: "Verify this entry in the key document against the source. If the key was wrong, no question change is needed."
        };
        keyConflicts.push({ q: q, keyed: keyed, most: most, mostShare: mostShare, keyedShare: keyedShare, fromFile: false });
      }
      // CATEGORY: Key conflict in uploaded files — the file\u2019s own key
      //   disagrees with the key the teacher entered.
      else if (fileKeyConflict) {
        f = {
          flag: "Possible Key Error",
          issueCategory: "Key conflict in uploaded files",
          severity: "High",
          secondaryFlags: ["Immediate Action"],
          confidence: "High",
          pattern: "The key inside the uploaded file (" + fileKeyList.join("/") + ") disagrees with the key you entered (" + keyed + ").",
          problem: "The uploaded results file records <b>" + fileKeyList.join(" and ") + "</b> as the keyed answer for this question, but the answer key you entered says <b>" + keyed + "</b>. One of them is wrong, and any marks based on the wrong one aren\u2019t comparable.",
          immediate: "<b class=\"act\">Check this question against the exam text and fix whichever key is wrong</b>, then rescore if needed.",
          nextYearNote: "Verify this entry in the key document against the source."
        };
        keyConflicts.push({ q: q, keyed: keyed, most: fileKeyList.join("/"), fromFile: true });
      }
      // High combined miss rate (\u2265 60%): split by response pattern.
      else if (aq.combinedMissed >= 60) {
        var base = "<b>" + aq.combinedMissed + "% of students missed this question.</b>";
        var textNote = qText(q)
          ? " The question\u2019s wording is quoted below \u2014 judging it is a read, not a statistic."
          : " <b>Exam Detective hasn\u2019t read this question\u2019s text</b> (none was uploaded), so this pattern is a signal to review, not a verdict.";

        // CATEGORY: Possible distractor issue — one specific wrong answer
        //   drew \u2265 30% and at least matched the keyed answer\u2019s share.
        if (combinedShares && keyed && maxWrongShare >= 30 && maxWrongShare >= (keyedShare || 0)) {
          f = {
            flag: "Watch List",
            issueCategory: "Possible distractor issue",
            severity: "Medium",
            secondaryFlags: [],
            confidence: "Medium",
            pattern: "One wrong answer (" + maxWrongLetter + ", " + maxWrongShare + "%) competed with or beat the keyed answer " + keyed + " (" + (keyedShare || 0) + "%).",
            problem: base + " Answer " + maxWrongLetter + " drew <b>" + maxWrongShare + "%</b> against the keyed " + keyed + "\u2019s " + (keyedShare || 0) + "% \u2014 a single strong distractor, not random guessing. That usually means choice " + maxWrongLetter + " is plausible enough to compete with the key (or the key deserves a second look)." + textNote,
            immediate: "<b>Review before any grading change.</b> Read choice " + maxWrongLetter + " against the keyed answer: if it\u2019s defensible, consider accepting both; if it\u2019s clearly wrong, no rescore is needed this year.",
            nextYearNote: "If " + maxWrongLetter + " turns out to be a near-duplicate or defensible reading, rebuild that choice before the exam is reused."
          };
        }
        // CATEGORY: Possible wording issue — votes scattered thin across
        //   options (keyed < 35%, no wrong option \u2265 30%): a confusion
        //   pattern rather than one trap.
        else if (combinedShares && keyed && (keyedShare || 0) < 35 && maxWrongShare < 30) {
          f = {
            flag: "Watch List",
            issueCategory: "Possible wording issue",
            severity: "Medium",
            secondaryFlags: [],
            confidence: "Medium",
            pattern: "Votes scattered across all choices (keyed " + keyed + " " + (keyedShare || 0) + "%, no other choice above " + maxWrongShare + "%).",
            problem: base + " No answer \u2014 including the keyed one \u2014 attracted a clear share of students; votes spread across the options. Scatter like this is the classic signature of students not understanding what the question is asking (wording, stem, or instructions), rather than being pulled by one trap." + textNote,
            immediate: "<b>Review before any grading change.</b> Read the question stem for ambiguity. If two readings of the stem lead to different answers, consider accepting both or dropping the item.",
            nextYearNote: "If the stem is ambiguous, rewrite it before reuse; if it\u2019s clear, treat this as a difficulty signal instead."
          };
        }
        // CATEGORY: High difficulty / reteaching candidate — hard, but the
        //   keyed answer still leads and no single trap dominates.
        else {
          f = {
            flag: "Watch List",
            issueCategory: "High difficulty / reteaching candidate",
            severity: aq.combinedMissed >= 75 ? "Medium" : "Low",
            secondaryFlags: [],
            confidence: "Medium",
            pattern: aq.combinedMissed + "% missed" + (combinedShares && keyed ? ", but the keyed answer still led the choices" : "") + " \u2014 looks hard rather than broken.",
            problem: base + (combinedShares && keyed
              ? " The keyed answer " + keyed + " still drew the largest share (" + (keyedShare || 0) + "%) and no single wrong answer dominated \u2014 the pattern looks like a hard skill, not a broken item."
              : " This file doesn\u2019t include an answer distribution, so only the miss rate is visible.") + textNote,
            immediate: "<b>No grading change suggested by the data.</b> If the key holds up against the text, this is a reteaching candidate, not a rescoring one.",
            nextYearNote: "Keep the question if the key is right; plan a focused review of this skill before the exam is reused."
          };
        }
      }
      // CATEGORY: Section-specific gap — one section \u2265 30 points worse.
      else if (sections.length > 1 && aq.maxMissed - aq.minMissed >= 30 && aq.maxMissed >= 50) {
        var worst = null;
        Object.keys(aq.missedBySection).forEach(function (sid) {
          if (aq.missedBySection[sid] === aq.maxMissed) worst = sid;
        });
        f = {
          flag: "Watch List",
          issueCategory: "Section-specific gap (pacing/coverage)",
          severity: "Low",
          secondaryFlags: [],
          confidence: "Medium",
          pattern: "Section " + worst + " missed this at " + aq.maxMissed + "%, while other sections ranged down to " + aq.minMissed + "%.",
          problem: "Most sections handled this question, but <b>" + worst + " missed it at " + aq.maxMissed + "%</b> versus a low of " + aq.minMissed + "% elsewhere. A gap this size usually points at pacing, a missed lesson, or a class-specific misunderstanding \u2014 a conversation, not a verdict.",
          immediate: "<b>No grading change suggested by the data.</b> Worth a quick, no-blame check-in about when this material was covered in " + worst + ".",
          nextYearNote: "If the section gap traces to pacing, no question change is needed."
        };
      }

      if (f) {
        f.number = q;
        f.classesAffected = sections.map(function (s) { return s.id; }).filter(function (sid) {
          return aq.missedBySection[sid] !== null && aq.missedBySection[sid] >= 40;
        });
        if (!f.classesAffected.length) f.classesAffected = sections.map(function (s) { return s.id; });
        f.keyedAnswer = keyed || "—";
        f.mostChosen = most || "—";

        // ---- stats every card shows ----
        f.percentCorrect = 100 - aq.combinedMissed;
        var blanks = 0, answeredTotal = 0, anyAggregate = false;
        sections.forEach(function (s2) {
          if (s2.mode === "aggregate") { anyAggregate = true; return; }
          var qd2 = s2.questions[q]; if (!qd2) return;
          blanks += qd2.blankCount || 0;
          var dist2 = qd2.distribution || {};
          answeredTotal += Object.keys(dist2).reduce(function (a, k) { return a + dist2[k]; }, 0) + (qd2.correctCount || 0) + (qd2.incorrectCount || 0);
        });
        f.responseCount = anyAggregate ? null : answeredTotal;
        f.blankRate = !anyAggregate && (answeredTotal + blanks) ? Math.round((blanks / (answeredTotal + blanks)) * 100) : null;

        // ---- evidence from uploaded exam text (quoted verbatim, never invented) ----
        var qt = qText(q);
        var grp = groupFor(q);
        if (qt) {
          f.question = esc(qt.stem) +
            (qt.complete ? "" : " <span style=\"font-weight:400;font-size:13px;color:#6a776f;\">(partial extraction — answer-choice text couldn’t be read)</span>");
          f.evidence = !qt.complete ? "Partial text — needs review"
            : (grp.passage ? "Question + passage available" : "Question text available");
          var evBits = [];
          if (keyed && qt.options[keyed]) evBits.push("the keyed answer " + keyed + " reads “" + esc(trunc(qt.options[keyed], 120)) + "”");
          if (most && most !== keyed && qt.options[most]) evBits.push("the most-chosen answer " + most + " reads “" + esc(trunc(qt.options[most], 120)) + "”");
          if (evBits.length) {
            f.problem += " <b>From your uploaded exam:</b> " + evBits.join("; ") + ".";
          }
          if (grp.passage) {
            f.problem += " The linked passage “" + esc(grp.passage) + "” is in your uploads — read it to judge whether the popular answer is defensible.";
            if (["Possible distractor issue", "Possible wording issue", "High difficulty / reteaching candidate"].indexOf(f.issueCategory) !== -1) {
              f.secondaryCategory = "Possible passage/text dependency";
              f.problem += " Because this question depends on that passage, the confusion may trace to the reading rather than the question alone.";
            }
          }
          if (!qt.complete) {
            f.problem += " <b>Only part of this question could be extracted</b> (the answer-choice text is missing), so check the original document.";
          }
          if (qt.visualDependency) {
            f.visualDependency = true;
            f.visualType = qt.visualType || "visual";
            if (!f.secondaryCategory) f.secondaryCategory = "Visual evidence required";
            f.problem += " <b>This question depends on a " + esc(f.visualType) + ".</b> The visual itself isn’t machine-readable in this build (no OCR or vision model), so review it by eye before acting.";
          }
        } else {
          f.question = "Question " + q + " <span style=\"font-weight:400;font-size:13px;color:#6a776f;\">(no question text uploaded — flagged from the response data alone)</span>";
          f.evidence = fileKeyConflict ? "Key conflict in files" : "Data only";
        }

        f.options = combinedShares ? Object.keys(combinedShares).sort().map(function (L) {
          var state = null, pill = null;
          if (keyed === L) { state = "correct"; pill = "ANSWER KEY"; }
          if (most === L && most !== keyed) { state = "chose"; pill = "MOST CHOSE"; }
          if (most === L && most === keyed) { pill = "ANSWER KEY · MOST CHOSE"; }
          var label = qt && qt.options[L]
            ? "“" + esc(trunc(qt.options[L], 90)) + "” — chosen by " + combinedShares[L] + "%"
            : "Chosen by " + combinedShares[L] + "% of students";
          return { letter: L, text: label, state: state, pill: pill };
        }) : [];
        // ---- what the app can't confidently say (per-card honesty) ----
        var lims = [];
        if (qt && qt.visualDependency) lims.push("The " + (qt.visualType || "visual") + " this question depends on isn’t machine-readable here — visual evidence requires teacher review (no OCR/vision in this build).");
        if (!qt) lims.push("No wording was uploaded for this question, so wording and choice-level review can’t happen here.");
        else if (!qt.complete) lims.push("Extraction was partial (answer-choice text is missing), so choice-level review needs the original document.");
        if (qt && !grp.passage) lims.push("No reading passage is linked to this question, so passage support can’t be checked.");
        if (anyAggregate) lims.push("This came from an aggregate file — there’s no per-student response data behind these numbers.");
        lims.push("Whether an answer is defensible is a content judgment — the app reports patterns; it doesn’t rule.");
        f.limitations = lims;

        f.advanced = "Per-section percent missed: " + sections.map(function (s) {
          var v = aq.missedBySection[s.id];
          return s.id + " " + (v === null ? "—" : v + "%");
        }).join(", ") + ". Flag thresholds are documented in js/analysis-builder.js.";
        flagged.push(f);
      }
    });

    // ---- missing-data cards: shown plainly, never given answer-choice analysis ----
    noResponseQs.forEach(function (q) {
      var qt = qText(q);
      flagged.push({
        number: q, noData: true,
        flag: "Missing Response Data",
        issueCategory: "Missing or insufficient response data",
        severity: "Data gap",
        secondaryFlags: [],
        confidence: "High",
        classesAffected: sections.map(function (s2) { return s2.id; }),
        keyedAnswer: key && key[q - 1] ? key[q - 1] : "—",
        mostChosen: "—",
        pattern: "No student responses were recorded for this question in the uploaded files.",
        question: qt ? esc(qt.stem) : "Question " + q + " <span style=\"font-weight:400;font-size:13px;color:#6a776f;\">(no question text uploaded)</span>",
        evidence: qt ? (qt.complete ? "Question text available" : "Partial text — needs review") : "Data only",
        options: [],
        problem: "<b>Every recorded cell for this question is blank.</b> That usually means the question was skipped during administration, omitted from this form, or lost in the export — it does not mean students got it wrong. No answer-choice analysis is possible or appropriate here.",
        immediate: "<b>Check the source export.</b> If the question was actually administered, re-export the results; if it was skipped, exclude it from scoring everywhere.",
        nextYearNote: "No question judgment is possible without response data.",
        limitations: ["No response data exists for this question, so nothing about its quality can be inferred."],
        percentCorrect: null, blankRate: 100, responseCount: 0
      });
    });
    flagged.sort(function (a, b) { return a.number - b.number; });

    // ---- key audit ----
    var mismatchQuestions = keyConflicts.map(function (c) { return c.q; });
    var keyAudit = {
      mismatchQuestions: mismatchQuestions,
      summary: mismatchQuestions.length
        ? "Possible answer-key problem detected for Question" + (mismatchQuestions.length > 1 ? "s" : "") + " " +
          mismatchQuestions.join(", ") + ". Check these against the exam text before finalizing marks."
        : "No key conflicts were detected in the uploaded data.",
      findings: keyConflicts.map(function (c) {
        return {
          q: c.q,
          type: c.fromFile ? "File key disagrees with entered key" : "Students decisively chose a non-keyed answer",
          detail: c.fromFile
            ? "The uploaded file records " + c.most + " as the key; you entered " + c.keyed + ". Verify against the exam text."
            : c.mostShare + "% chose " + c.most + "; the keyed answer " + c.keyed + " drew " + c.keyedShare + "%. Verify " + c.most + " against the exam text before rescoring."
        };
      }),
      rowShiftNote: key
        ? "If more than one key entry turns out to be wrong, check the key document for a copy or row-shift error before the exam is reused."
        : "No answer key was entered, so key checks were limited to what the files contained."
    };

    // ---- takeaway (computed) ----
    var watchCount = flagged.filter(function (f) { return f.flag === "Watch List"; }).length;
    var takeaway = [];
    takeaway.push({
      lead: "What was analyzed:",
      text: totalResponses + " student result" + (totalResponses === 1 ? "" : "s") + " across " +
        sections.length + " class section" + (sections.length === 1 ? "" : "s") + " and " + totalQuestions +
        " questions, parsed from " + meta.filesParsed + " uploaded CSV file" + (meta.filesParsed === 1 ? "" : "s") +
        ". Combined average: " + combinedAverage + "%." +
        (combinedMedian === null ? " (Median unavailable for aggregate files.)" : " Median: " + combinedMedian + "%.")
    });
    takeaway.push({
      lead: mismatchQuestions.length ? "Check the key first:" : "Key check:",
      text: mismatchQuestions.length
        ? "Question" + (mismatchQuestions.length > 1 ? "s" : "") + " " + mismatchQuestions.join(", ") +
          " show key-conflict signals. Verify these against the exam text before any rescoring — if the key is wrong, marks change for every student."
        : "No questions showed the decisive against-the-key voting pattern that suggests a key error."
    });
    if (watchCount) {
      takeaway.push({
        lead: "Review the watch list:",
        text: watchCount + " question" + (watchCount === 1 ? "" : "s") + " had very high miss rates or big section gaps. The data can’t distinguish a broken question from a hard one — that judgment needs the exam text, so read those items before deciding anything."
      });
    }
    if (ev) {
      var linkedCount = ev.passages.filter(function (p) { return p.linked; }).length;
      takeaway.push({
        lead: "What the text evidence covers:",
        text: "Question wording was extracted for " + evInRange + " of " + totalQuestions + " questions" +
          (evIncompleteInRange ? " (" + evIncompleteInRange + " partial — answer choices missing)" : "") +
          (ev.passages.length ? ", plus " + ev.passages.length + " reading passage" + (ev.passages.length === 1 ? "" : "s") +
            " (" + linkedCount + " linked to question ranges by explicit markers, " + (ev.passages.length - linkedCount) + " unmatched)" : "") +
          ". Quoted text in the cards is verbatim from your files. The judgment calls — whether a popular answer is defensible, whether wording misleads — are still yours: the app quotes evidence, it doesn’t rule on it."
      });
    } else {
      takeaway.push({
        lead: "What this analysis can’t see:",
        text: "Exam Detective has not read the exam questions or passages (none were uploaded), so it makes no claims about wording, defensible answers, or rewrites here. Flags are data signals from your uploaded results only. Upload the exam PDF in Step 3 to see question wording quoted alongside the flags."
      });
    }

    return {
      id: "uploaded-" + (meta.analysisId || Date.now()),
      analysisId: meta.analysisId || null,
      source: "uploaded",
      uploadedMeta: meta,
      examName: setup.examName || "Uploaded exam",
      examTitle: (ED.analysis.esc(setup.examName || "Uploaded Exam") + ":<br>Questions To Review"),
      examType: setup.examType || "Results from uploaded CSV",
      subject: setup.subject || "",
      grade: setup.grade || "",
      dateCreated: new Date().toISOString().slice(0, 10),
      reviewedLabel: new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long" }),
      totalQuestions: totalQuestions,
      totalResponses: totalResponses,
      combinedAverage: combinedAverage,
      combinedMedian: combinedMedian,
      sections: secSummaries,
      groups: groups,
      allQuestions: allQuestions,
      flagged: flagged,
      keyAudit: keyAudit,
      takeaway: takeaway,
      openingSummary: "This review was built from your uploaded results — " +
        sections.length + " class section" + (sections.length === 1 ? "" : "s") + ", " +
        totalResponses + " student" + (totalResponses === 1 ? "" : "s") + ", " + totalQuestions + " questions. " +
        "Flags below come from transparent data rules (decisive voting against the key, very high miss rates, large section gaps). " +
        (ev
          ? "Question wording was extracted for " + evInRange + " of " + totalQuestions + " questions from your uploaded exam file and is quoted verbatim in the cards below. Every flag is still a signal to review — the app quotes evidence, it doesn’t rule on it."
          : "Because no exam text was uploaded, every flag is a signal to review — not a finished judgment.") +
        (noResponseQs.length
          ? " Note: question" + (noResponseQs.length === 1 ? "" : "s") + " " + noResponseQs.join(", ") +
            " had no recorded student responses in the uploaded files — " + (noResponseQs.length === 1 ? "it was" : "they were") +
            " excluded from scoring and flags, not counted as missed."
          : ""),
      dataQuality: { noResponses: noResponseQs },
      // which answer key produced these results (file, coverage, caveats) —
      // shown in the Key Audit Summary so reports state their key source
      keyProvenance: input.keyInfo || null,
      uploadAudit: uploadAudit,
      evidenceSummary: ev ? {
        withText: evInRange,
        total: totalQuestions,
        incomplete: evIncompleteInRange,
        passages: ev.passages.map(function (p) {
          return { title: p.title, file: p.file, linked: p.linked, from: p.from, to: p.to, how: p.how, excerpt: p.excerpt || "", isVisual: !!p.isVisual, genre: p.genre || "", visualPages: p.visualPages || [] };
        })
      } : null,
      departmentPattern: {
        widespread: flagged.filter(function (f) { return f.classesAffected.length >= Math.max(sections.length, 1); }).map(function (f) { return f.number; }),
        sectionSpecific: flagged.filter(function (f) { return sections.length > 1 && f.classesAffected.length < sections.length; }).map(function (f) { return f.number; }),
        note: sections.length > 1
          ? "Questions flagged in most or all sections usually point at the question or key; single-section gaps usually point at pacing or coverage. Use this as a conversation starter, not a verdict."
          : "Only one class section was uploaded, so widespread-versus-section patterns can’t be compared yet. Upload more sections to unlock the department view."
      }
    };
  }

  ED.builder = { build: build };
})();
