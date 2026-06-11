/* New Analysis wizard — 7 steps.
   CSV and XLSX uploads are REALLY parsed (js/csv-parse.js,
   js/xlsx-parse.js) and analyzed (js/analysis-builder.js). Answer keys
   can be extracted from CSV/XLSX/text-based-PDF files (js/pdf-extract.js)
   and always require review. Result PDFs are accepted but clearly marked
   "not yet parsed" and never analyzed. Demo mode and uploaded mode are
   mutually exclusive so results can never silently mix. */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  var STORE_KEY = "examdetective.wizard";
  var MAX_Q = 130; // manual answer key supports questions 1–130

  var STEPS = [
    "Analysis Setup",
    "Upload Class Results",
    "Upload Exam Questions",
    "Answer Key",
    "Review Detected Data",
    "Run Analysis",
    "View Results"
  ];

  // The demo answer key (75 letters). Includes the three suspect entries
  // (Q33 B, Q36 D, Q66 A) so the demo key audit has something real to find.
  function demoKey() {
    var letters = ["A", "B", "C", "D"];
    var key = [];
    for (var q = 1; q <= 75; q++) key.push(letters[(q * 7 + 3) % 4]);
    key[32] = "B"; key[35] = "D"; key[65] = "A";
    return key;
  }

  function defaultState() {
    return {
      setup: { examName: "", subject: "", grade: "", sections: "", notes: "" },
      resultFiles: [],   // {name, label, status: parsed|unsupported|error, statusText, sections, format}
      examFiles: [],
      keySource: "",
      key: [],
      keyCount: 0,
      demoLoaded: false
    };
  }

  function getState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var s = raw ? JSON.parse(raw) : defaultState();
      // older saved states may miss newer fields
      if (s.keyCount === undefined) s.keyCount = (s.key || []).length;
      return s;
    } catch (e) {
      return defaultState();
    }
  }

  function setState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* private mode: state just won't persist */ }
  }

  function resetState() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  ED.wizard = { getState: getState, setState: setState, resetState: resetState, demoKey: demoKey, MAX_Q: MAX_Q };

  var esc = function (s) { return ED.analysis.esc(s); };

  // ---------- derived helpers ----------

  function parsedSections(s) {
    var out = [];
    (s.resultFiles || []).forEach(function (f) {
      if (f.status === "parsed" && f.sections) {
        f.sections.forEach(function (sec) {
          // the user's label wins over what the file said, when there's one section
          var copy = Object.assign({}, sec);
          if (f.label && f.sections.length === 1) copy.id = f.label;
          out.push(copy);
        });
      }
    });
    return out;
  }

  function uploadMeta(s) {
    var unparsed = (s.resultFiles || []).filter(function (f) { return f.status !== "parsed"; });
    return {
      filesUploaded: (s.resultFiles || []).length,
      filesParsed: (s.resultFiles || []).filter(function (f) { return f.status === "parsed"; }).length,
      unparsedFiles: unparsed.map(function (f) { return f.name; })
    };
  }

  function keyEntered(s) {
    return (s.key || []).filter(function (L) { return L; }).length;
  }

  // Cross-file checks shown on the Review step — all computed from real data.
  function uploadedWarnings(s) {
    var warns = [];
    var secs = parsedSections(s);
    var meta = uploadMeta(s);

    (s.resultFiles || []).forEach(function (f) {
      if (f.status === "unsupported") {
        warns.push({ level: "warn", title: esc(f.name) + " won’t be analyzed", text: f.statusText });
      } else if (f.status === "error") {
        warns.push({ level: "alert", title: esc(f.name) + " couldn’t be read", text: f.statusText });
      } else if (f.parseWarnings && f.parseWarnings.length) {
        f.parseWarnings.forEach(function (w) {
          warns.push({ level: "warn", title: esc(f.name), text: w });
        });
      }
    });

    // duplicate / missing section labels
    var seen = {};
    secs.forEach(function (sec) {
      if (seen[sec.id]) {
        warns.push({ level: "alert", title: "Duplicate class label", text: "Two files are both labeled “" + esc(sec.id) + "”. Give each class section its own label in Step 2, or their results will be merged." });
      }
      seen[sec.id] = true;
    });

    // question-count mismatches across sections
    var counts = {};
    secs.forEach(function (sec) { counts[sec.questionCount] = (counts[sec.questionCount] || []).concat(sec.id); });
    if (Object.keys(counts).length > 1) {
      warns.push({
        level: "warn", title: "Question counts differ between files",
        text: Object.keys(counts).map(function (c) { return counts[c].join("/") + " has " + c + " questions"; }).join("; ") +
          ". Review the files before running the analysis."
      });
    }

    // key checks
    var maxQ = secs.reduce(function (m, sec) { return Math.max(m, sec.questionCount); }, 0);
    var lettersMode = secs.some(function (sec) { return sec.mode === "letters"; });
    var entered = keyEntered(s);
    if (lettersMode && !entered) {
      warns.push({ level: "alert", title: "Answer key needed", text: "Your files contain answer letters (A–D), which can only be scored against a key. Enter the key in Step 4 before running the analysis." });
    } else if (entered && maxQ && entered < maxQ) {
      warns.push({ level: "warn", title: "Key shorter than the exam", text: "The answer key has " + entered + " entries, but the files contain " + maxQ + " questions. Questions without a key entry " + (lettersMode ? "can’t be scored." : "can’t be key-checked.") });
    }

    secs.forEach(function (sec) {
      if (!sec.responses) {
        warns.push({ level: "warn", title: "No student count for " + esc(sec.id), text: "This file didn’t say how many students responded. Results will show 0 students for this section unless the file includes a Responses/Students column." });
      }
    });

    if (!warns.length) {
      warns.push({ level: "ok", title: "No problems detected", text: "Labels are unique, question counts line up, and everything needed to score is present." });
    }
    return warns;
  }

  // ---------- shared chrome ----------

  function stepsBar(current) {
    return '<div class="wizard-steps" role="list" aria-label="Wizard steps">' +
      STEPS.map(function (label, i) {
        var n = i + 1;
        var cls = n === current ? "current" : (n < current ? "done" : "");
        return '<a role="listitem" class="wizard-step ' + cls + '" href="#/new-analysis/' + n + '"' +
          (n === current ? ' aria-current="step"' : '') + '>' +
          '<span class="n" aria-hidden="true">' + (n < current ? "✓" : n) + '</span><span class="wizard-step-label">' + label + '</span></a>';
      }).join("") + '</div>';
  }

  function navButtons(current, nextLabel, nextAction) {
    var back = current > 1
      ? '<a class="btn btn-outline" href="#/new-analysis/' + (current - 1) + '">&larr; Back</a>'
      : '<a class="btn btn-outline" href="#/dashboard">&larr; Dashboard</a>';
    var next = "";
    if (nextAction) {
      next = '<button class="btn btn-primary" data-action="' + nextAction + '">' + (nextLabel || "Continue") + ' &rarr;</button>';
    } else if (current < 7) {
      next = '<a class="btn btn-primary" href="#/new-analysis/' + (current + 1) + '">' + (nextLabel || "Continue") + ' &rarr;</a>';
    }
    return '<div class="wizard-nav">' + back + next + '</div>';
  }

  function modeBanner(s) {
    if (s.demoLoaded) {
      return '<div class="notice info"><span class="notice-title">Demo mode</span>' +
        'You’re working with the built-in sample exam (five Grade 8 ELA sections). Uploading your own files will switch you out of demo mode. ' +
        '<button class="btn btn-sm btn-outline" data-action="wizard-clear-demo">Leave demo mode</button></div>';
    }
    if ((s.resultFiles || []).length) return ""; // working with real uploads — no demo pitch
    return '<div class="notice info"><span class="notice-title">Just exploring?</span>' +
      '<button class="btn btn-sm btn-outline" data-action="wizard-load-demo" style="margin-right:10px;">Load the demo files</button>' +
      'Fills every step with a realistic five-class sample exam — clearly labeled as demo data the whole way through.</div>';
  }

  // ---------- steps ----------

  function fieldError(id, msg) {
    return msg ? '<p class="field-error" id="' + id + '-error">' + msg + '</p>' : "";
  }

  function step1(s, errors) {
    errors = errors || {};
    var st = s.setup;
    // Defaults the teacher chose in Settings seed blank fields (their
    // decision, not ours — Settings starts blank).
    var defaults = ED.settings ? ED.settings.get() : { subject: "", grade: "" };
    var subjectVal = st.subject || defaults.subject || "";
    var gradeVal = st.grade || defaults.grade || "";
    return (
      '<div class="card">' +
        '<h2>Step 1 · Analysis Setup</h2>' +
        '<p class="mb-16">Tell us about the exam. Exam name, subject, and grade appear on every report, so they’re required.</p>' +
        '<form id="wizard-setup" onsubmit="return false;" novalidate>' +
          '<div class="field' + (errors.examName ? " has-error" : "") + '"><label for="w-exam">Exam name <span class="req">required</span></label>' +
            '<input type="text" id="w-exam" value="' + esc(st.examName) + '" placeholder="e.g. Grade 8 ELA Final Exam"' + (errors.examName ? ' aria-describedby="w-exam-error" aria-invalid="true"' : '') + '>' +
            fieldError("w-exam", errors.examName) + '</div>' +
          '<div class="field-row">' +
            '<div class="field' + (errors.subject ? " has-error" : "") + '"><label for="w-subject">Subject <span class="req">required</span></label>' +
              '<input type="text" id="w-subject" value="' + esc(subjectVal) + '" placeholder="e.g. ELA"' + (errors.subject ? ' aria-describedby="w-subject-error" aria-invalid="true"' : '') + '>' +
              (subjectVal && !st.subject ? '<div class="hint">From your Settings defaults — change it if this exam differs.</div>' : '') +
              fieldError("w-subject", errors.subject) + '</div>' +
            '<div class="field' + (errors.grade ? " has-error" : "") + '"><label for="w-grade">Grade level <span class="req">required</span></label>' +
              '<input type="text" id="w-grade" value="' + esc(gradeVal) + '" placeholder="e.g. 8"' + (errors.grade ? ' aria-describedby="w-grade-error" aria-invalid="true"' : '') + '>' +
              (gradeVal && !st.grade ? '<div class="hint">From your Settings defaults.</div>' : '') +
              fieldError("w-grade", errors.grade) + '</div>' +
          '</div>' +
          '<div class="field"><label for="w-sections">Class sections <span class="opt">optional</span></label>' +
            '<input type="text" id="w-sections" value="' + esc(st.sections) + '" placeholder="e.g. 8A, 8B, 8C">' +
            '<div class="hint">Separate with commas. If you skip this, sections are taken from the uploaded files.</div></div>' +
          '<div class="field"><label for="w-notes">Notes <span class="opt">optional</span></label>' +
            '<textarea id="w-notes" placeholder="Anything your future self should know about this exam">' + esc(st.notes) + '</textarea></div>' +
        '</form>' +
      '</div>' +
      navButtons(1, "Save &amp; Continue", "wizard-save-setup")
    );
  }

  function resultFileRow(f, i) {
    var statusHtml;
    if (f.status === "parsed") {
      var students = (f.sections || []).reduce(function (a, sec) { return a + (sec.responses || 0); }, 0);
      statusHtml = '<span class="file-status ok">✓ Parsed — ' + students + ' student' + (students === 1 ? "" : "s") + ', ' +
        (f.sections || []).reduce(function (m, sec) { return Math.max(m, sec.questionCount); }, 0) + ' questions (' + esc(f.format) + ')' +
        (f.sheetInfo ? ' · ' + esc(f.sheetInfo) : '') + '</span>';
    } else if (f.status === "unsupported") {
      statusHtml = '<span class="file-status warn">◌ Accepted, not analyzed — ' + esc(f.statusText) + '</span>';
    } else {
      statusHtml = '<span class="file-status err">✕ ' + esc(f.statusText) + '</span>';
    }
    var labelHtml = "";
    if (f.status === "parsed" && f.sections && f.sections.length === 1) {
      labelHtml = '<label class="small" for="w-label-' + i + '">Class section:</label>' +
        '<input type="text" id="w-label-' + i + '" data-change="wizard-label" data-index="' + i + '" value="' + esc(f.label || f.sections[0].id || "") + '" placeholder="e.g. 8A" size="6">';
    } else if (f.status === "parsed") {
      labelHtml = '<span class="small muted">' + f.sections.length + ' sections found in file: ' +
        f.sections.map(function (sec) { return esc(sec.id); }).join(", ") + '</span>';
    }
    return '<div class="file-row ' + f.status + '">' +
      '<span class="file-name">' + esc(f.name) + '</span>' + labelHtml + statusHtml +
      '<button class="btn btn-sm btn-danger" data-action="wizard-remove-file" data-list="resultFiles" data-index="' + i + '">Remove</button>' +
    '</div>';
  }

  function step2(s) {
    var rows = (s.resultFiles || []).map(resultFileRow).join("");
    return (
      modeBanner(s) +
      '<div class="card">' +
        '<h2>Step 2 · Upload Class Result Reports</h2>' +
        '<p class="mb-16">One result file per class section (or one XLSX workbook with one sheet per section).</p>' +
        '<div class="format-grid">' +
          '<div class="format-cell live"><b>CSV · XLSX</b><span>Parsed for real — results are read straight from your file</span></div>' +
          '<div class="format-cell planned"><b>PDF</b><span>Result PDFs are <b>not yet parsed</b> and won’t be analyzed. (Text-based PDF <i>answer keys</i> do work — Step 4.)</span></div>' +
        '</div>' +
        '<div class="upload-zone">' +
          '<b>Choose result files</b><span class="muted"> — CSV or XLSX</span>' +
          '<input type="file" multiple accept=".csv,.xlsx,.pdf" data-change="wizard-add-results" aria-label="Upload class result reports">' +
          '<p class="small muted" style="margin-top:10px;">Layouts we read: one row per student (Q1, Q2, … columns with letters or correct/incorrect), or one row per question (Question + % Correct). In XLSX workbooks, every sheet is checked and sheet names become section labels. ' +
          '<button class="btn-link" data-action="wizard-sample-csv">Download a sample CSV</button></p>' +
        '</div>' +
        '<div id="result-file-list">' + rows + '</div>' +
        ((s.resultFiles || []).length || s.demoLoaded
          ? ''
          : '<div class="empty-state"><b>No result files yet.</b><span>Upload your class CSV exports above — or load the demo files to explore first.</span></div>') +
      '</div>' +
      navButtons(2)
    );
  }

  function step3(s) {
    var rows = (s.examFiles || []).map(function (f, i) {
      return '<div class="file-row unsupported">' +
        '<span class="file-name">' + esc(f.name) + '</span>' +
        '<span class="file-status warn">◌ Name recorded for reference — exam text isn’t read in this build</span>' +
        '<button class="btn btn-sm btn-danger" data-action="wizard-remove-file" data-list="examFiles" data-index="' + i + '">Remove</button>' +
      '</div>';
    }).join("");
    return (
      modeBanner(s) +
      '<div class="card">' +
        '<h2>Step 3 · Upload Exam Questions <span class="opt" style="font-size:12px;">optional</span></h2>' +
        '<p class="mb-16">The exam, reading booklet, passages, or source texts.</p>' +
        '<div class="notice warn"><span class="notice-title">Honest limitation</span>' +
          'This build does <b>not</b> read exam text yet. Files you add here are listed with your analysis for reference only — they don’t change the results. When text analysis is built, this is where it will plug in.</div>' +
        '<div class="upload-zone">' +
          '<b>Choose exam files</b>' +
          '<input type="file" multiple accept=".pdf,.docx,.txt" data-change="wizard-add-exam" aria-label="Upload exam questions and reading material">' +
        '</div>' +
        '<div id="exam-file-list">' + rows + '</div>' +
      '</div>' +
      navButtons(3)
    );
  }

  function keyGrid(s) {
    var n = s.keyCount || 0;
    if (!n) return "";
    var html = '<div class="key-groups">';
    for (var start = 1; start <= n; start += 10) {
      var end = Math.min(start + 9, n);
      html += '<div class="key-group"><span class="key-group-label">' + start + '–' + end + '</span><div class="key-group-cells">';
      for (var q = start; q <= end; q++) {
        var val = s.key[q - 1] || "";
        html += '<div class="key-cell' + (val ? "" : " unset") + '">' +
          '<span class="qn">' + q + '</span>' +
          '<select data-change="wizard-key-edit" data-q="' + q + '" aria-label="Keyed answer for question ' + q + '">' +
            '<option value=""' + (val === "" ? " selected" : "") + '>–</option>' +
            ["A", "B", "C", "D", "E"].map(function (L) {
              return '<option' + (L === val ? " selected" : "") + '>' + L + '</option>';
            }).join("") +
          '</select></div>';
      }
      html += '</div></div>';
    }
    html += '</div>';
    var entered = keyEntered(s);
    html += '<p class="small muted mt-8">' + entered + ' of ' + n + ' entries filled in' +
      (entered < n ? ' — unfilled questions are marked with a dash.' : '.') + '</p>';
    return html;
  }

  // What happened the last time a key file was uploaded (review states).
  function keyExtractionNotice(s) {
    var ke = s.keyExtraction;
    if (!ke) return "";
    if (ke.error) {
      return '<div class="notice alert"><span class="notice-title">Couldn’t read a key from ' + esc(ke.file) + '</span>' + esc(ke.error) + '</div>';
    }
    var bits = ['<b>' + ke.found + ' entr' + (ke.found === 1 ? "y" : "ies") + '</b> extracted from <b>' + esc(ke.file) + '</b>' + (ke.sheetName ? ' (sheet “' + esc(ke.sheetName) + '”)' : '') + '.'];
    var level = "ok";
    if (ke.missing && ke.missing.length) {
      level = "warn";
      var list = ke.missing.slice(0, 12).join(", ") + (ke.missing.length > 12 ? "…" : "");
      bits.push('<b>Missing:</b> question' + (ke.missing.length === 1 ? "" : "s") + ' ' + list + ' — left blank below, not guessed.');
    }
    if (ke.conflicts && ke.conflicts.length) {
      level = "warn";
      bits.push('<b>Conflicting entries</b> for question' + (ke.conflicts.length === 1 ? "" : "s") + ' ' + ke.conflicts.join(", ") + ' — the most frequent letter was kept; double-check those.');
    }
    bits.push('Extraction is never trusted blindly — <b>review the grid below</b> before running the analysis.');
    return '<div class="notice ' + level + '"><span class="notice-title">Key extracted — review required</span>' + bits.join(" ") + '</div>';
  }

  function step4(s) {
    var detectedQ = parsedSections(s).reduce(function (m, sec) { return Math.max(m, sec.questionCount); }, 0);
    return (
      modeBanner(s) +
      '<div class="card">' +
        '<h2>Step 4 · Answer Key</h2>' +
        '<p class="mb-16">Upload a key file, paste the key, or enter it by hand. <b>The key is compared against your uploaded results</b> — that comparison is how wrong or shifted keys get caught. Up to ' + MAX_Q + ' questions.</p>' +

        '<div class="btn-row mb-16">' +
          '<label class="btn btn-outline" style="cursor:pointer;">Upload key file (CSV · XLSX · PDF)' +
            '<input type="file" accept=".csv,.xlsx,.pdf" data-change="wizard-key-file" class="visually-hidden" aria-label="Upload answer key file"></label>' +
          '<span class="small muted">CSV/XLSX need Question + Key columns. PDF works for <b>text-based</b> key documents (“1. A”, “2) B” …) — scanned PDFs can’t be read (no OCR yet).</span>' +
        '</div>' +
        keyExtractionNotice(s) +

        '<div class="key-controls">' +
          '<div class="field" style="margin-bottom:0;"><label for="w-keycount">Number of questions</label>' +
            '<input type="number" id="w-keycount" min="1" max="' + MAX_Q + '" value="' + (s.keyCount || "") + '" placeholder="' + (detectedQ || "e.g. 75") + '" data-change="wizard-key-count" style="max-width:120px;">' +
            (detectedQ ? '<div class="hint">Your uploaded files contain ' + detectedQ + ' questions.</div>' : '') +
          '</div>' +
          '<div class="field" style="margin-bottom:0;flex-grow:1;"><label for="w-keypaste">Paste a key (fastest)</label>' +
            '<textarea id="w-keypaste" rows="2" placeholder="Paste letters in order — e.g.  A B C D A …  or  1. A  2. B  3. C …"></textarea>' +
            '<div class="hint">We pick out the letters A–E in order. <button class="btn-link" data-action="wizard-key-paste">Fill the key from this</button></div>' +
          '</div>' +
        '</div>' +

        (s.keySource ? '<p class="small mt-16"><b>Key source:</b> ' + esc(s.keySource) + '</p>' : '') +
        keyGrid(s) +
        (s.keyCount ? '' : '<div class="empty-state mt-16"><b>No key yet.</b><span>Set the number of questions above to open the entry grid, or paste a key.</span></div>') +
      '</div>' +
      navButtons(4)
    );
  }

  function step5(s) {
    // ----- demo mode: the demo dataset, clearly labeled -----
    if (s.demoLoaded) {
      var an = ED.demo.analysis;
      return (
        '<div class="notice info"><span class="notice-title">Demo mode</span>Everything below comes from the built-in sample exam, including the warnings — this is what a real review step looks like.</div>' +
        '<div class="card">' +
          '<h2>Step 5 · Review Detected Data</h2>' +
          '<h3>Exam</h3>' +
          '<p>' + esc(s.setup.examName || an.examName) + ' · ' + esc(s.setup.subject || an.subject) + ' · Grade ' + esc(s.setup.grade || an.grade) + ' · <b>' + an.totalQuestions + ' questions detected</b> · Answer key: <b>detected (' + an.totalQuestions + ' entries)</b></p>' +
          '<h3 class="mt-24">Class sections detected</h3>' +
          '<div class="table-wrap mt-8"><table class="data">' +
            '<thead><tr><th scope="col">Section</th><th scope="col" class="num">Responses</th><th scope="col" class="num">Questions found</th><th scope="col">Keyed answers in file</th><th scope="col">Parsing</th></tr></thead><tbody>' +
            an.sections.map(function (sec) {
              return '<tr><td><b>' + sec.id + '</b></td><td class="num">' + sec.responses + '</td><td class="num">' + an.totalQuestions + '</td><td>' + sec.keyVariant + '</td><td>' +
                (sec.id === "8E" ? '<span class="file-status warn">⚠ One low-quality page</span>' : '<span class="file-status ok">✓ Clean</span>') +
              '</td></tr>';
            }).join("") +
          '</tbody></table></div>' +
          '<h3 class="mt-24">Checks &amp; warnings</h3>' +
          ED.analysis.DEMO_WARNINGS.map(function (w) {
            return '<div class="notice ' + w.level + '"><span class="notice-title">' + esc(w.title) + '</span>' + esc(w.text) + '</div>';
          }).join("") +
        '</div>' +
        navButtons(5, "Looks right — continue")
      );
    }

    // ----- uploaded mode -----
    var secs = parsedSections(s);
    var meta = uploadMeta(s);

    if (!meta.filesUploaded) {
      return (
        '<div class="card"><h2>Step 5 · Review Detected Data</h2>' +
        '<div class="empty-state"><b>Nothing to review yet.</b><span>No files have been uploaded. Go back to Step 2 and add your class result CSVs — or load the demo files to explore.</span></div>' +
        '</div>' +
        '<div class="wizard-nav"><a class="btn btn-outline" href="#/new-analysis/2">&larr; Back to uploads</a></div>'
      );
    }

    if (!secs.length) {
      return (
        '<div class="card"><h2>Step 5 · Review Detected Data</h2>' +
        '<div class="notice alert"><span class="notice-title">No analyzable data</span>' +
          'You uploaded ' + meta.filesUploaded + ' file' + (meta.filesUploaded === 1 ? "" : "s") + ', but none could be parsed. ' +
          (meta.unparsedFiles.length ? '<b>' + meta.unparsedFiles.map(esc).join(", ") + '</b> — PDF and XLSX parsing isn’t built yet, and files with errors can’t be read. ' : '') +
          'Export your results as <b>CSV</b> from your assessment tool to analyze them now. There’s a sample CSV in Step 2 showing the layouts we read.</div>' +
        '</div>' +
        '<div class="wizard-nav"><a class="btn btn-outline" href="#/new-analysis/2">&larr; Back to uploads</a></div>'
      );
    }

    var totalStudents = secs.reduce(function (a, sec) { return a + (sec.responses || 0); }, 0);
    return (
      '<div class="card">' +
        '<h2>Step 5 · Review Detected Data</h2>' +
        '<p class="mb-16">This is what was actually read from your files — confirm it before anything is analyzed. <b>Bad parsing creates bad analysis.</b></p>' +

        '<div class="src-banner uploaded" style="margin:0 0 18px;"><span class="src-chip">Uploaded Data</span>' +
          '<span class="src-meta">' + meta.filesUploaded + ' file' + (meta.filesUploaded === 1 ? "" : "s") + ' uploaded · ' + meta.filesParsed + ' parsed · ' + totalStudents + ' students · ' + secs.length + ' section' + (secs.length === 1 ? "" : "s") + '</span></div>' +

        '<h3>Exam</h3>' +
        '<p>' + esc(s.setup.examName || "(no exam name — set it in Step 1)") +
          (s.setup.subject ? ' · ' + esc(s.setup.subject) : '') +
          (s.setup.grade ? ' · Grade ' + esc(s.setup.grade) : '') +
          ' · Answer key: <b>' + (keyEntered(s) ? keyEntered(s) + " entries" : "not entered") + '</b></p>' +

        '<h3 class="mt-24">Class sections detected</h3>' +
        '<div class="table-wrap mt-8"><table class="data">' +
          '<thead><tr><th scope="col">Section</th><th scope="col" class="num">Responses</th><th scope="col" class="num">Questions found</th><th scope="col">Answer format</th></tr></thead><tbody>' +
          secs.map(function (sec) {
            var fmt = sec.mode === "letters" ? "Answer letters (needs the key to score)"
              : sec.mode === "correctness" ? "Correct / incorrect marks"
              : "Aggregate (one row per question)";
            return '<tr><td><b>' + esc(sec.id) + '</b></td><td class="num">' + (sec.responses || 0) + '</td><td class="num">' + sec.questionCount + '</td><td>' + fmt + '</td></tr>';
          }).join("") +
        '</tbody></table></div>' +

        '<h3 class="mt-24">Checks &amp; warnings</h3>' +
        uploadedWarnings(s).map(function (w) {
          return '<div class="notice ' + w.level + '"><span class="notice-title">' + w.title + '</span>' + w.text + '</div>';
        }).join("") +

        '<p class="small muted mt-16">Need to change something? Re-upload or relabel files in Step 2, or edit the key in Step 4.</p>' +
      '</div>' +
      navButtons(5, "Looks right — continue")
    );
  }

  function canRun(s) {
    if (s.demoLoaded) return { ok: true };
    var secs = parsedSections(s);
    var meta = uploadMeta(s);
    if (!meta.filesUploaded) {
      return { ok: false, why: "No files have been uploaded yet. Add your class result CSVs in Step 2, or load the demo files." };
    }
    if (!secs.length) {
      return { ok: false, why: "None of the uploaded files could be parsed. PDF and XLSX parsing isn’t built yet — export your results as CSV to analyze them now. Exam Detective will not show results it didn’t actually compute." };
    }
    var lettersMode = secs.some(function (sec) { return sec.mode === "letters"; });
    if (lettersMode && !keyEntered(s)) {
      return { ok: false, why: "Your files contain answer letters, which can only be scored against an answer key. Enter the key in Step 4 first." };
    }
    return { ok: true };
  }

  function step6(s) {
    var gate = canRun(s);
    return (
      '<div class="card">' +
        '<h2>Step 6 · Run Analysis</h2>' +
        (gate.ok
          ? (s.demoLoaded
              ? '<div class="notice info"><span class="notice-title">Demo mode</span>This run opens the built-in sample results, clearly labeled as demo data.</div>'
              : '<p class="mb-16">Every number in the results will come from your parsed CSV data. Flags use transparent rules (key conflicts, very high miss rates, big section gaps) — and the results say plainly what this build can’t judge without reading the exam text.</p>') +
            '<button class="btn btn-primary btn-lg" data-action="wizard-run" id="run-btn">Run Analysis</button>' +
            '<div class="progress-wrap" id="progress-wrap" hidden>' +
              '<div class="progress-bar" role="progressbar" aria-label="Analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-bar"><div></div></div>' +
              '<ul class="progress-log" id="progress-log" aria-live="polite"></ul>' +
            '</div>'
          : '<div class="notice alert"><span class="notice-title">Can’t run yet</span>' + gate.why + '</div>') +
      '</div>' +
      navButtons(6, null, null)
    );
  }

  // ---------- view entry point ----------

  ED.views.wizard = function (stepParam) {
    var step = Math.min(Math.max(parseInt(stepParam, 10) || 1, 1), 7);
    if (step === 7) { location.hash = "#/results"; return ""; }
    var s = getState();
    var bodies = [step1, step2, step3, step4, step5, step6];
    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head">' +
          '<div class="eyebrow">New Analysis · Step ' + step + ' of 7</div>' +
          '<h1>' + STEPS[step - 1] + '</h1>' +
        '</div>' +
        stepsBar(step) +
        bodies[step - 1](s, ED.wizard._setupErrors) +
      '</div></div>'
    );
  };

  // ---------- actions ----------

  ED.actions["wizard-load-demo"] = function () {
    var s = getState();
    var an = ED.demo.analysis;
    s.demoLoaded = true;
    s.resultFiles = [];   // demo and real uploads never mix
    s.examFiles = [];
    s.setup = { examName: an.examName, subject: an.subject, grade: an.grade, sections: an.sections.map(function (x) { return x.id; }).join(", "), notes: s.setup.notes || "" };
    s.keySource = "Demo answer key (75 entries)";
    s.key = demoKey();
    s.keyCount = 75;
    s.keyExtraction = null;
    setState(s);
    ED.app.rerender();
  };

  ED.actions["wizard-clear-demo"] = function () {
    var s = getState();
    s.demoLoaded = false;
    s.setup = { examName: "", subject: "", grade: "", sections: "", notes: s.setup.notes || "" };
    s.key = []; s.keyCount = 0; s.keySource = ""; s.keyExtraction = null;
    setState(s);
    ED.app.rerender();
  };

  ED.actions["wizard-save-setup"] = function () {
    var s = getState();
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
    s.setup = { examName: v("w-exam"), subject: v("w-subject"), grade: v("w-grade"), sections: v("w-sections"), notes: v("w-notes") };
    setState(s);

    var errors = {};
    if (!s.setup.examName) errors.examName = "Give the exam a name — it appears at the top of every report.";
    if (!s.setup.subject) errors.subject = "Enter the subject (e.g. ELA, Math).";
    if (!s.setup.grade) errors.grade = "Enter the grade level (e.g. 8).";
    if (Object.keys(errors).length) {
      ED.wizard._setupErrors = errors;
      ED.app.rerender();
      ED.wizard._setupErrors = null;
      return;
    }
    location.hash = "#/new-analysis/2";
  };

  // ----- file uploads (Step 2): CSV parsed for real, PDF/XLSX honestly deferred -----

  ED.actions["wizard-add-results"] = function (el) {
    var files = Array.prototype.slice.call(el.files || []);
    if (!files.length) return;
    var s = getState();
    if (s.demoLoaded) {
      // switching from demo to real uploads — make the switch explicit
      s.demoLoaded = false;
      s.key = []; s.keyCount = 0; s.keySource = ""; s.keyExtraction = null;
      s.switchedFromDemo = true;
    }
    var pending = files.length;

    function done() {
      if (--pending === 0) { setState(s); ED.app.rerender(); }
    }

    function pushParsed(f, res) {
      if (res.ok) {
        s.resultFiles.push({
          name: f.name, label: res.sections.length === 1 ? res.sections[0].id : "",
          status: "parsed", format: res.format,
          sections: res.sections, parseWarnings: res.warnings,
          sheetInfo: res.sheetCount ? res.parsedSheets.length + " of " + res.sheetCount + " sheet" + (res.sheetCount === 1 ? "" : "s") + " had results" : ""
        });
      } else {
        s.resultFiles.push({ name: f.name, status: "error", statusText: res.error });
      }
    }

    files.forEach(function (f) {
      var ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext === "csv") {
        var reader = new FileReader();
        reader.onload = function () {
          pushParsed(f, ED.csv.parseResults(String(reader.result), { defaultSection: f.name.replace(/\.[^.]+$/, "") }));
          done();
        };
        reader.onerror = function () {
          s.resultFiles.push({ name: f.name, status: "error", statusText: "The file couldn’t be read from disk. Try re-selecting it." });
          done();
        };
        reader.readAsText(f);
      } else if (ext === "xlsx") {
        var xreader = new FileReader();
        xreader.onload = function () {
          ED.xlsx.parseResults(xreader.result, { defaultSection: f.name.replace(/\.[^.]+$/, "") })
            .then(function (res) { pushParsed(f, res); done(); });
        };
        xreader.onerror = function () {
          s.resultFiles.push({ name: f.name, status: "error", statusText: "The file couldn’t be read from disk. Try re-selecting it." });
          done();
        };
        xreader.readAsArrayBuffer(f);
      } else if (ext === "pdf") {
        s.resultFiles.push({
          name: f.name, status: "unsupported",
          statusText: "Result PDFs aren’t parsed yet. Export this report as CSV or XLSX to analyze it now. (PDF answer keys are different — those work in Step 4.)"
        });
        done();
      } else {
        s.resultFiles.push({
          name: f.name, status: "error",
          statusText: "Unsupported file type (." + ext + "). Use a CSV or XLSX export."
        });
        done();
      }
    });
    el.value = "";
  };

  ED.actions["wizard-sample-csv"] = function () {
    var blob = new Blob([ED.csv.sampleCSV()], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exam-detective-sample-results.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  ED.actions["wizard-add-exam"] = function (el) {
    var s = getState();
    Array.prototype.forEach.call(el.files || [], function (f) {
      s.examFiles.push({ name: f.name, kind: "reference only" });
    });
    setState(s); ED.app.rerender();
    el.value = "";
  };

  ED.actions["wizard-label"] = function (el) {
    var s = getState();
    var i = parseInt(el.getAttribute("data-index"), 10);
    if (s.resultFiles[i]) { s.resultFiles[i].label = el.value.trim(); setState(s); }
  };

  ED.actions["wizard-remove-file"] = function (el) {
    var s = getState();
    var list = el.getAttribute("data-list");
    var i = parseInt(el.getAttribute("data-index"), 10);
    if (s[list] && s[list][i] !== undefined) { s[list].splice(i, 1); setState(s); ED.app.rerender(); }
  };

  // ----- answer key (Step 4) -----

  ED.actions["wizard-key-count"] = function (el) {
    var s = getState();
    var n = Math.min(Math.max(parseInt(el.value, 10) || 0, 0), MAX_Q);
    s.keyCount = n;
    s.key = s.key.slice(0, n);
    while (s.key.length < n) s.key.push("");
    if (n && !s.keySource) s.keySource = "Entered manually";
    setState(s); ED.app.rerender();
  };

  ED.actions["wizard-key-edit"] = function (el) {
    var s = getState();
    var q = parseInt(el.getAttribute("data-q"), 10);
    if (q >= 1 && q <= MAX_Q) {
      while (s.key.length < q) s.key.push("");
      s.key[q - 1] = el.value;
      setState(s);
    }
  };

  // Key file upload: CSV / XLSX (Question + Key columns) or text-based PDF.
  ED.actions["wizard-key-file"] = function (el) {
    var f = el.files && el.files[0];
    el.value = "";
    if (!f) return;
    var ext = (f.name.split(".").pop() || "").toLowerCase();

    function apply(res, extra) {
      var s = getState();
      if (!res.ok) {
        s.keyExtraction = { file: f.name, error: res.error };
      } else {
        s.key = res.key.slice(0, MAX_Q);
        s.keyCount = Math.max(s.keyCount || 0, s.key.length);
        while (s.key.length < s.keyCount) s.key.push("");
        s.keySource = f.name + " — extracted, review below";
        s.keyExtraction = {
          file: f.name,
          found: res.found,
          missing: res.missing || [],
          conflicts: (res.conflicts || []).map(function (c) { return c.q; }),
          sheetName: res.sheetName || (extra && extra.sheetName) || ""
        };
      }
      setState(s);
      ED.app.rerender();
    }

    if (ext === "csv") {
      var reader = new FileReader();
      reader.onload = function () {
        apply(ED.csv.extractKeyFromTable(ED.csv.parseTable(String(reader.result))));
      };
      reader.onerror = function () { apply({ ok: false, error: "The file couldn’t be read from disk. Try re-selecting it." }); };
      reader.readAsText(f);
    } else if (ext === "xlsx") {
      var xr = new FileReader();
      xr.onload = function () { ED.xlsx.extractKey(xr.result).then(apply); };
      xr.onerror = function () { apply({ ok: false, error: "The file couldn’t be read from disk. Try re-selecting it." }); };
      xr.readAsArrayBuffer(f);
    } else if (ext === "pdf") {
      var pr = new FileReader();
      pr.onload = function () { ED.pdf.extractKey(pr.result).then(apply); };
      pr.onerror = function () { apply({ ok: false, error: "The file couldn’t be read from disk. Try re-selecting it." }); };
      pr.readAsArrayBuffer(f);
    } else {
      apply({ ok: false, error: "Unsupported file type (." + ext + "). Use CSV, XLSX, or a text-based PDF." });
    }
  };

  ED.actions["wizard-key-paste"] = function () {
    var ta = document.getElementById("w-keypaste");
    var s = getState();
    if (!ta || !ta.value.trim()) return;
    var letters = (ta.value.toUpperCase().match(/\b[A-E]\b/g) || []).slice(0, MAX_Q);
    if (!letters.length) {
      alert("We couldn’t find any answer letters (A–E) in what you pasted. Paste something like:  A B C D A …");
      return;
    }
    s.key = letters;
    s.keyCount = Math.max(s.keyCount || 0, letters.length);
    while (s.key.length < s.keyCount) s.key.push("");
    s.keySource = "Pasted (" + letters.length + " letters)";
    s.keyExtraction = null;
    setState(s); ED.app.rerender();
  };

  // ----- run (Step 6) -----

  ED.actions["wizard-run"] = function () {
    var s = getState();
    var gate = canRun(s);
    if (!gate.ok) { ED.app.rerender(); return; }

    var btn = document.getElementById("run-btn");
    var wrap = document.getElementById("progress-wrap");
    var bar = document.getElementById("progress-bar");
    var log = document.getElementById("progress-log");
    if (!wrap || !bar || !log) return;
    if (btn) btn.disabled = true;
    wrap.hidden = false;

    var steps;
    if (s.demoLoaded) {
      ED.data.setActiveDemo();
      steps = [
        [30, "Opening the built-in demo dataset (5 sections, 129 students)…"],
        [70, "Loading the sample review…"],
        [100, "Done — opening demo results, labeled as demo data."]
      ];
    } else {
      var secs = parsedSections(s);
      var key = (s.key || []).slice(0, s.keyCount || s.key.length);
      var analysis = ED.builder.build({
        setup: s.setup,
        sections: secs,
        key: key.some(function (L) { return L; }) ? key : null,
        meta: uploadMeta(s)
      });
      ED.data.setActiveUploaded(analysis);
      var students = analysis.totalResponses;
      steps = [
        [25, "Scoring " + students + " student results across " + secs.length + " section" + (secs.length === 1 ? "" : "s") + "…"],
        [55, "Checking " + analysis.totalQuestions + " questions against the key…"],
        [85, "Applying flag rules (key conflicts, miss rates, section gaps)…"],
        [100, "Done — " + analysis.flagged.length + " question" + (analysis.flagged.length === 1 ? "" : "s") + " flagged for review."]
      ];
    }

    var i = 0;
    (function tick() {
      if (i >= steps.length) {
        setTimeout(function () { location.hash = "#/results"; }, 600);
        return;
      }
      var st = steps[i++];
      bar.firstElementChild.style.width = st[0] + "%";
      bar.setAttribute("aria-valuenow", st[0]);
      var li = document.createElement("li");
      li.textContent = st[1];
      log.appendChild(li);
      setTimeout(tick, 450);
    })();
  };
})();
