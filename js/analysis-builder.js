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

      var f = null;

      // RULE: Possible Key Error — a different answer beat the key decisively.
      //   most-chosen ≥ 50% AND keyed ≤ 25% (High confidence if keyed ≤ 10%),
      //   or the key recorded inside the file disagrees with the entered key.
      if (keyed && most && most !== keyed && mostShare >= 50 && keyedShare <= 25) {
        f = {
          flag: "Possible Key Error",
          secondaryFlags: ["Immediate Action"],
          confidence: keyedShare <= 10 ? "High" : "Medium",
          pattern: mostShare + "% of students chose " + most + ", while the keyed answer " + keyed + " drew only " + keyedShare + "%.",
          problem: "<b>" + mostShare + "% of students chose " + most + "</b> while the keyed answer (" + keyed + ") drew only " + keyedShare + "%. When one non-keyed answer wins this decisively, the key document is the usual suspect. " +
            (qText(q)
              ? "The question’s wording from your uploaded exam is quoted below — read it and check whether " + most + " is the better answer before rescoring."
              : "<b>Exam Detective has not read this question’s text</b> (none was uploaded), so this is a data signal, not a verdict — check answer " + most + " against the question before rescoring."),
          immediate: "<b class=\"act\">Check the key for this question against the exam text.</b> If " + most + " is correct, rescore with " + most + ". If the key is right after all, this question goes on the revision list instead.",
          nextYearNote: "Verify this entry in the key document against the source. If the key was wrong, no question change is needed."
        };
        keyConflicts.push({ q: q, keyed: keyed, most: most, mostShare: mostShare, keyedShare: keyedShare, fromFile: false });
      } else if (fileKeyConflict) {
        f = {
          flag: "Possible Key Error",
          secondaryFlags: ["Immediate Action"],
          confidence: "High",
          pattern: "The key inside the uploaded file (" + fileKeyList.join("/") + ") disagrees with the key you entered (" + keyed + ").",
          problem: "The uploaded results file records <b>" + fileKeyList.join(" and ") + "</b> as the keyed answer for this question, but the answer key you entered says <b>" + keyed + "</b>. One of them is wrong, and any marks based on the wrong one aren’t comparable.",
          immediate: "<b class=\"act\">Check this question against the exam text and fix whichever key is wrong</b>, then rescore if needed.",
          nextYearNote: "Verify this entry in the key document against the source."
        };
        keyConflicts.push({ q: q, keyed: keyed, most: fileKeyList.join("/"), fromFile: true });
      }
      // RULE: Watch List — very high miss rate (≥ 60% combined).
      //   Without the exam text the app can't tell "broken" from "hard but
      //   fair", so high-miss items are flagged for review, not judged.
      else if (aq.combinedMissed >= 60) {
        f = {
          flag: "Watch List",
          secondaryFlags: [],
          confidence: "Medium",
          pattern: aq.combinedMissed + "% of students missed this question" + (sections.length > 1 ? " across " + sections.length + " sections" : "") + ".",
          problem: "<b>" + aq.combinedMissed + "% of students missed this question.</b>" +
            (most && keyed && most !== keyed ? " The most common answer was " + most + " (" + mostShare + "%), against a keyed answer of " + keyed + " (" + keyedShare + "%)." : "") +
            " A miss rate this high can mean a flawed question, a key problem, or simply a hard skill. " +
            (qText(q)
              ? "The question’s wording is quoted below — judging whether it’s broken or just hard is a read, not a statistic."
              : "<b>Exam Detective hasn’t read this question’s text</b> (none was uploaded), so it can’t tell which — read the question against the passage to decide."),
          immediate: "<b>Review before any grading change.</b> Read the question and the keyed answer against the exam text. If the key holds up, this is “hard but fair” and needs no rescore.",
          nextYearNote: "If review shows a wording or distractor problem, rebuild the question before the exam is reused."
        };
      }
      // RULE: Watch List (section-specific) — one section ≥ 30 points worse.
      else if (sections.length > 1 && aq.maxMissed - aq.minMissed >= 30 && aq.maxMissed >= 50) {
        var worst = null;
        Object.keys(aq.missedBySection).forEach(function (sid) {
          if (aq.missedBySection[sid] === aq.maxMissed) worst = sid;
        });
        f = {
          flag: "Watch List",
          secondaryFlags: [],
          confidence: "Medium",
          pattern: "Section " + worst + " missed this at " + aq.maxMissed + "%, while other sections ranged down to " + aq.minMissed + "%.",
          problem: "Most sections handled this question, but <b>" + worst + " missed it at " + aq.maxMissed + "%</b> versus a low of " + aq.minMissed + "% elsewhere. A gap this size usually points at pacing, a missed lesson, or a class-specific misunderstanding — a conversation, not a verdict.",
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
          }
          if (!qt.complete) {
            f.problem += " <b>Only part of this question could be extracted</b> (the answer-choice text is missing), so check the original document.";
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
        f.advanced = "Per-section percent missed: " + sections.map(function (s) {
          var v = aq.missedBySection[s.id];
          return s.id + " " + (v === null ? "—" : v + "%");
        }).join(", ") + ". Flag thresholds are documented in js/analysis-builder.js.";
        flagged.push(f);
      }
    });

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
      evidenceSummary: ev ? {
        withText: evInRange,
        total: totalQuestions,
        incomplete: evIncompleteInRange,
        passages: ev.passages.map(function (p) {
          return { title: p.title, file: p.file, linked: p.linked, from: p.from, to: p.to, how: p.how };
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
