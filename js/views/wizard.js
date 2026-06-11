/* New Analysis wizard — 7 steps.
   Uploads are placeholders in this demo build: files are listed and
   "detection" is simulated with the demo dataset, so the whole workflow
   can be exercised end-to-end. Real parsing should plug in here later
   (see BUILD_NOTES.md → "Not yet connected"). */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  var STORE_KEY = "examdetective.wizard";

  var STEPS = [
    "Analysis Setup",
    "Upload Class Results",
    "Upload Exam Questions",
    "Upload Answer Key",
    "Review Detected Data",
    "Run Analysis",
    "View Results"
  ];

  // The demo answer key (75 letters). Includes the three suspect entries
  // (Q33 B, Q36 D, Q66 A) so the key audit has something real to find.
  function demoKey() {
    var letters = ["A", "B", "C", "D"];
    var key = [];
    for (var q = 1; q <= 75; q++) key.push(letters[(q * 7 + 3) % 4]);
    key[32] = "B"; key[35] = "D"; key[65] = "A";
    return key;
  }

  function defaultState() {
    return {
      setup: { examName: "", subject: "ELA", grade: "8", sections: "", notes: "" },
      resultFiles: [],
      examFiles: [],
      keySource: "",
      key: [],
      demoLoaded: false
    };
  }

  function getState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : defaultState();
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

  ED.wizard = { getState: getState, setState: setState, resetState: resetState, demoKey: demoKey };

  var esc = function (s) { return ED.analysis.esc(s); };

  // ---------- shared chrome ----------

  function stepsBar(current) {
    return '<div class="wizard-steps" role="list" aria-label="Wizard steps">' +
      STEPS.map(function (label, i) {
        var n = i + 1;
        var cls = n === current ? "current" : (n < current ? "done" : "");
        return '<a role="listitem" class="wizard-step ' + cls + '" href="#/new-analysis/' + n + '"' +
          (n === current ? ' aria-current="step"' : '') + '>' +
          '<span class="n" aria-hidden="true">' + n + '</span>' + label + '</a>';
      }).join("") + '</div>';
  }

  function navButtons(current, nextLabel, nextAction) {
    var back = current > 1
      ? '<a class="btn btn-outline" href="#/new-analysis/' + (current - 1) + '">&larr; Back</a>'
      : '<a class="btn btn-outline" href="#/dashboard">&larr; Back to Dashboard</a>';
    var next = "";
    if (nextAction) {
      next = '<button class="btn btn-primary" data-action="' + nextAction + '">' + (nextLabel || "Continue") + ' &rarr;</button>';
    } else if (current < 7) {
      next = '<a class="btn btn-primary" href="#/new-analysis/' + (current + 1) + '">' + (nextLabel || "Continue") + ' &rarr;</a>';
    }
    return '<div class="wizard-nav">' + back + next + '</div>';
  }

  function demoBanner(s) {
    if (s.demoLoaded) {
      return '<div class="notice ok"><span class="notice-title">Demo files loaded</span>Five Grade 8 ELA result files, the exam booklet, and the answer key are loaded so you can try the whole workflow. Replace them with your own files any time.</div>';
    }
    return '<div class="notice info"><span class="notice-title">Just exploring?</span>' +
      '<button class="btn btn-sm btn-outline" data-action="wizard-load-demo" style="margin-right:10px;">Load the demo files</button>' +
      'Fills every step with a realistic five-class Grade 8 ELA exam so you can see how analysis works.</div>';
  }

  // ---------- steps ----------

  function step1(s) {
    var st = s.setup;
    return (
      '<div class="card">' +
        '<h2>Step 1 · Analysis Setup</h2>' +
        '<p class="mb-16">Tell us about the exam. You can change any of this later.</p>' +
        '<form id="wizard-setup" onsubmit="return false;">' +
          '<div class="field"><label for="w-exam">Exam name</label>' +
            '<input type="text" id="w-exam" value="' + esc(st.examName) + '" placeholder="e.g. Grade 8 ELA Final Exam"></div>' +
          '<div class="field"><label for="w-subject">Subject</label>' +
            '<input type="text" id="w-subject" value="' + esc(st.subject) + '" placeholder="e.g. ELA"></div>' +
          '<div class="field"><label for="w-grade">Grade level</label>' +
            '<input type="text" id="w-grade" value="' + esc(st.grade) + '" placeholder="e.g. 8"></div>' +
          '<div class="field"><label for="w-sections">Class sections</label>' +
            '<input type="text" id="w-sections" value="' + esc(st.sections) + '" placeholder="e.g. 8A, 8B, 8C, 8D, 8E">' +
            '<div class="hint">Separate sections with commas. One result file per section in the next step.</div></div>' +
          '<div class="field"><label for="w-notes">Notes (optional)</label>' +
            '<textarea id="w-notes" placeholder="Anything your future self should know about this exam">' + esc(st.notes) + '</textarea></div>' +
        '</form>' +
      '</div>' +
      navButtons(1, "Save &amp; Continue", "wizard-save-setup")
    );
  }

  function fileRows(files, withLabel) {
    if (!files.length) return "";
    return files.map(function (f, i) {
      return '<div class="file-row">' +
        '<span class="file-name">' + esc(f.name) + '</span>' +
        (withLabel
          ? '<label class="small" for="w-label-' + i + '">Class section:</label>' +
            '<input type="text" id="w-label-' + i + '" data-change="wizard-label" data-index="' + i + '" value="' + esc(f.label || "") + '" placeholder="e.g. 8A" size="6">'
          : '<span class="small muted">' + esc(f.kind || "supporting material") + '</span>') +
        '<span class="file-status ' + (f.status === "ok" ? "ok" : "warn") + '">' +
          (f.status === "ok" ? "✓ Question results detected" : "⚠ " + esc(f.statusText || "Could not read this file")) +
        '</span>' +
        '<button class="btn btn-sm btn-danger" data-action="wizard-remove-file" data-list="' + (withLabel ? "resultFiles" : "examFiles") + '" data-index="' + i + '">Remove</button>' +
      '</div>';
    }).join("");
  }

  function step2(s) {
    return (
      demoBanner(s) +
      '<div class="card">' +
        '<h2>Step 2 · Upload Class Result Reports</h2>' +
        '<p class="mb-16">Add one result report per class section — the export from your assessment tool. Supported: <b>PDF, CSV, XLSX</b>. Label each file with its class section.</p>' +
        '<div class="upload-zone">' +
          '<b>Choose result files</b><br>or drag them here' +
          '<input type="file" multiple accept=".pdf,.csv,.xlsx" data-change="wizard-add-results" aria-label="Upload class result reports">' +
        '</div>' +
        '<div id="result-file-list">' + fileRows(s.resultFiles, true) + '</div>' +
        (s.resultFiles.length
          ? ''
          : '<p class="small muted mt-16">No result files yet. Upload your class reports, or load the demo files above to explore.</p>') +
      '</div>' +
      navButtons(2)
    );
  }

  function step3(s) {
    return (
      demoBanner(s) +
      '<div class="card">' +
        '<h2>Step 3 · Upload Exam Questions</h2>' +
        '<p class="mb-16">Add the exam itself and any reading material — questions, reading booklet, passages, source texts. <b>These files help the system judge whether a question is clear, fair, and supported by the text.</b> This step is optional but makes recommendations much stronger.</p>' +
        '<div class="upload-zone">' +
          '<b>Choose exam files</b><br>or drag them here' +
          '<input type="file" multiple accept=".pdf,.docx,.txt" data-change="wizard-add-exam" aria-label="Upload exam questions and reading material">' +
        '</div>' +
        '<div id="exam-file-list">' + fileRows(s.examFiles, false) + '</div>' +
      '</div>' +
      navButtons(3)
    );
  }

  function step4(s) {
    var key = s.key && s.key.length ? s.key : null;
    var grid = "";
    if (key) {
      var mismatches = { 33: true, 36: true, 66: true };
      grid = '<h3 class="mt-24">Detected answer key — review or edit</h3>' +
        '<p class="small muted">Cells outlined in red are questions where this key disagrees with keys detected inside the class result files. You’ll see the full comparison in the next step.</p>' +
        '<div class="key-grid">' +
        key.map(function (letter, i) {
          var q = i + 1;
          var mm = s.demoLoaded && mismatches[q];
          return '<div class="key-cell' + (mm ? " mismatch" : "") + '">' +
            '<span class="qn">Q' + q + '</span>' +
            '<select data-change="wizard-key-edit" data-q="' + q + '" aria-label="Keyed answer for question ' + q + (mm ? " — possible mismatch" : "") + '">' +
              ["A", "B", "C", "D"].map(function (L) {
                return '<option' + (L === letter ? " selected" : "") + '>' + L + '</option>';
              }).join("") +
            '</select>' +
          '</div>';
        }).join("") +
        '</div>';
    }
    return (
      demoBanner(s) +
      '<div class="card">' +
        '<h2>Step 4 · Upload Answer Key</h2>' +
        '<p class="mb-16">Upload the key document, or enter it by hand. <b>We compare this key against any keyed answers detected inside the class result files</b> — that comparison is how shifted or mistyped keys get caught.</p>' +
        '<div class="btn-row">' +
          '<label class="btn btn-outline" style="cursor:pointer;">Upload key file' +
            '<input type="file" accept=".pdf,.csv,.xlsx,.docx" data-change="wizard-add-key" class="visually-hidden"></label>' +
          '<button class="btn btn-outline" data-action="wizard-manual-key">Enter key manually</button>' +
        '</div>' +
        (s.keySource ? '<p class="small mt-16"><b>Key source:</b> ' + esc(s.keySource) + '</p>' : '') +
        grid +
      '</div>' +
      navButtons(4)
    );
  }

  function step5(s) {
    if (!s.demoLoaded && !s.resultFiles.length) {
      return (
        '<div class="card"><h2>Step 5 · Review Detected Data</h2>' +
        '<div class="notice warn"><span class="notice-title">Nothing to review yet</span>We could not detect question results because no files have been uploaded. Go back to Step 2 and upload your class result reports — or load the demo files.</div>' +
        '</div>' +
        '<div class="wizard-nav"><a class="btn btn-outline" href="#/new-analysis/2">&larr; Back to uploads</a></div>'
      );
    }
    var an = ED.demo.analysis;
    var warnings = ED.analysis.DEMO_WARNINGS;
    return (
      '<div class="card">' +
        '<h2>Step 5 · Review Detected Data</h2>' +
        '<p class="mb-16">Before anything is analyzed, confirm what we found in your files. <b>Bad parsing creates bad analysis</b> — fix anything that looks wrong, then continue.</p>' +

        '<h3>Exam</h3>' +
        '<p>' + esc(s.setup.examName || an.examName) + ' · ' + esc(s.setup.subject || an.subject) + ' · Grade ' + esc(s.setup.grade || an.grade) + ' · <b>' + an.totalQuestions + ' questions detected</b> · Answer key: <b>detected (75 entries)</b></p>' +

        '<h3 class="mt-24">Class sections detected</h3>' +
        '<div class="table-wrap mt-8"><table class="data">' +
          '<thead><tr><th scope="col">Section</th><th scope="col" class="num">Responses</th><th scope="col" class="num">Questions found</th><th scope="col">Keyed answers in file</th><th scope="col">Parsing</th></tr></thead><tbody>' +
          an.sections.map(function (sec) {
            return '<tr><td><b>' + sec.id + '</b></td><td class="num">' + sec.responses + '</td><td class="num">75</td><td>' + sec.keyVariant + '</td><td>' +
              (sec.id === "8E" ? '<span class="file-status warn">⚠ One low-quality page</span>' : '<span class="file-status ok">✓ Clean</span>') +
            '</td></tr>';
          }).join("") +
        '</tbody></table></div>' +
        '<p class="small muted mt-8">Two different key copies were detected inside the result files (“Key copy 1” in 8A/8B/8D, “Key copy 2” in 8C/8E). That difference is exactly what the key audit will examine.</p>' +

        '<h3 class="mt-24">Checks &amp; warnings</h3>' +
        warnings.map(function (w) {
          return '<div class="notice ' + w.level + '"><span class="notice-title">' + esc(w.title) + '</span>' + esc(w.text) + '</div>';
        }).join("") +

        '<p class="small muted mt-16">Need to change something? Go back to re-upload files (Step 2), fix class labels (Step 2), or edit the answer key (Step 4).</p>' +
      '</div>' +
      navButtons(5, "Looks right — continue")
    );
  }

  function step6(s) {
    var ready = s.demoLoaded || s.resultFiles.length;
    return (
      '<div class="card">' +
        '<h2>Step 6 · Run Analysis</h2>' +
        (ready
          ? '<p class="mb-16">We’ll review every question at three levels — each question on its own, each class section, and the combined department view — then flag anything that needs your attention.</p>' +
            '<button class="btn btn-primary btn-lg" data-action="wizard-run" id="run-btn">Run Analysis</button>' +
            '<div class="progress-wrap" id="progress-wrap" hidden>' +
              '<div class="progress-bar" role="progressbar" aria-label="Analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-bar"><div></div></div>' +
              '<ul class="progress-log" id="progress-log" aria-live="polite"></ul>' +
            '</div>'
          : '<div class="notice warn"><span class="notice-title">Not ready yet</span>Upload class result files (Step 2) or load the demo files before running the analysis.</div>') +
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
          '<div class="eyebrow">New Analysis</div>' +
          '<h1>' + STEPS[step - 1] + '</h1>' +
        '</div>' +
        stepsBar(step) +
        bodies[step - 1](s) +
      '</div></div>'
    );
  };

  // ---------- actions ----------

  ED.actions["wizard-load-demo"] = function () {
    var s = getState();
    var an = ED.demo.analysis;
    s.demoLoaded = true;
    s.setup = { examName: an.examName, subject: an.subject, grade: an.grade, sections: an.sections.map(function (x) { return x.id; }).join(", "), notes: s.setup.notes || "" };
    s.resultFiles = an.sections.map(function (sec) {
      return { name: sec.id + "_results.pdf", label: sec.id, status: "ok" };
    });
    s.examFiles = [
      { name: "ELA8_Final_Exam_Booklet.pdf", kind: "exam questions", status: "ok" },
      { name: "ELA8_Reading_Booklet.pdf", kind: "reading booklet", status: "ok" }
    ];
    s.keySource = "ELA8_Answer_Key.pdf (demo)";
    s.key = demoKey();
    setState(s);
    ED.app.rerender();
  };

  ED.actions["wizard-save-setup"] = function () {
    var s = getState();
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
    s.setup = { examName: v("w-exam"), subject: v("w-subject"), grade: v("w-grade"), sections: v("w-sections"), notes: v("w-notes") };
    setState(s);
    location.hash = "#/new-analysis/2";
  };

  function addFiles(listName, fileInput, withLabel) {
    var s = getState();
    var supported = withLabel ? ["pdf", "csv", "xlsx"] : ["pdf", "docx", "txt"];
    Array.prototype.forEach.call(fileInput.files || [], function (f) {
      var ext = (f.name.split(".").pop() || "").toLowerCase();
      var entry = { name: f.name, label: "", kind: "supporting material" };
      if (supported.indexOf(ext) === -1) {
        entry.status = "warn";
        entry.statusText = "Unsupported file type (." + ext + "). Try PDF, CSV, or XLSX.";
      } else {
        // Demo build: detection is simulated. Real parsing plugs in here.
        entry.status = "ok";
      }
      s[listName].push(entry);
    });
    setState(s);
    ED.app.rerender();
  }

  ED.actions["wizard-add-results"] = function (el) { addFiles("resultFiles", el, true); };
  ED.actions["wizard-add-exam"] = function (el) { addFiles("examFiles", el, false); };

  ED.actions["wizard-add-key"] = function (el) {
    var s = getState();
    var f = el.files && el.files[0];
    if (f) {
      s.keySource = f.name + " (uploaded)";
      if (!s.key.length) s.key = demoKey(); // demo build: simulated detection
      setState(s);
      ED.app.rerender();
    }
  };

  ED.actions["wizard-manual-key"] = function () {
    var s = getState();
    s.keySource = "Entered manually";
    if (!s.key.length) s.key = demoKey();
    setState(s);
    ED.app.rerender();
  };

  ED.actions["wizard-key-edit"] = function (el) {
    var s = getState();
    var q = parseInt(el.getAttribute("data-q"), 10);
    if (q >= 1 && q <= s.key.length) { s.key[q - 1] = el.value; setState(s); }
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

  ED.actions["wizard-run"] = function () {
    var btn = document.getElementById("run-btn");
    var wrap = document.getElementById("progress-wrap");
    var bar = document.getElementById("progress-bar");
    var log = document.getElementById("progress-log");
    if (!wrap || !bar || !log) return;
    if (btn) btn.disabled = true;
    wrap.hidden = false;

    var steps = [
      [15, "Reading question results from 5 class sections…"],
      [35, "Comparing answer keys across files…"],
      [55, "Checking answer patterns for each of 75 questions…"],
      [75, "Looking for widespread vs. section-specific patterns…"],
      [92, "Writing plain-English recommendations…"],
      [100, "Done — 12 questions flagged, 3 possible key errors found."]
    ];
    var i = 0;
    (function tick() {
      if (i >= steps.length) {
        setTimeout(function () { location.hash = "#/results"; }, 700);
        return;
      }
      var st = steps[i++];
      bar.firstElementChild.style.width = st[0] + "%";
      bar.setAttribute("aria-valuenow", st[0]);
      var li = document.createElement("li");
      li.textContent = st[1];
      log.appendChild(li);
      setTimeout(tick, 550);
    })();
  };
})();
