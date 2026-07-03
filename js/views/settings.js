/* Settings page — decision-based: nothing is pre-chosen.
   Defaults the teacher picks here become the starting values in
   the New Analysis wizard. Blank means "not decided yet". */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  var STORE_KEY = "examdetective.settings";

  // Blank by design — the user makes every choice (see PRODUCT_DECISIONS.md).
  function blankSettings() { return { subject: "", grade: "", exportFormat: "" }; }

  function getSettings() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var s = raw ? JSON.parse(raw) : blankSettings();
      return Object.assign(blankSettings(), s);
    } catch (e) {
      return blankSettings();
    }
  }
  function setSettings(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  ED.settings = { get: getSettings, blank: blankSettings };

  function decisionStatus(s) {
    var pending = [];
    if (!s.subject) pending.push("default subject");
    if (!s.grade) pending.push("default grade");
    if (!s.exportFormat) pending.push("preferred export format");
    if (!pending.length) {
      return '<div class="notice ok"><span class="notice-title">All set</span>Every default has been chosen. New analyses will start from these values.</div>';
    }
    return '<div class="notice info"><span class="notice-title">Still to decide</span>' +
      'You haven’t chosen: <b>' + pending.join(", ") + '</b>. These are optional — the wizard will simply start blank for anything you skip.</div>';
  }

  ED.views.settings = function () {
    var s = getSettings();
    var esc = ED.analysis.esc;
    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Settings</div>' +
          '<h1>Settings</h1>' +
          '<p class="lede">Defaults for new analyses — your choices, not ours — plus the controls for clearing data off this device.</p>' +
        '</div>' +

        '<div class="card">' +
          '<h2>Defaults for new analyses</h2>' +
          '<p class="mb-16">Nothing is pre-chosen. Anything you set here becomes the starting value in the New Analysis wizard.</p>' +
          decisionStatus(s) +
          '<div class="field-row mt-16">' +
            '<div class="field"><label for="set-subject">Default subject</label>' +
              '<input type="text" id="set-subject" value="' + esc(s.subject) + '" placeholder="e.g. ELA"></div>' +
            '<div class="field"><label for="set-grade">Default grade</label>' +
              '<input type="text" id="set-grade" value="' + esc(s.grade) + '" placeholder="e.g. 8"></div>' +
          '</div>' +
          '<div class="field"><label for="set-format">Preferred export format</label>' +
            '<select id="set-format">' +
              '<option value=""' + (s.exportFormat === "" ? " selected" : "") + '>— choose one —</option>' +
              '<option value="pdf"' + (s.exportFormat === "pdf" ? " selected" : "") + '>PDF (Print → Save as PDF)</option>' +
              '<option value="html"' + (s.exportFormat === "html" ? " selected" : "") + '>HTML (standalone file)</option>' +
              '<option value="docx" disabled>DOCX — planned, not available yet</option>' +
            '</select></div>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary" data-action="settings-save">Save defaults</button>' +
            '<button class="btn btn-outline" data-action="settings-clear-defaults">Clear defaults</button>' +
            '<span class="small muted" id="settings-saved" role="status"></span>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<h2>Your data on this device</h2>' +
          '<p>Everything Exam Detective stores lives in <b>this browser’s local storage</b> — nothing is uploaded to a server. These buttons clear it.</p>' +
          '<div class="btn-row mt-16">' +
            '<button class="btn btn-danger" data-action="settings-clear-wizard">Delete uploaded data &amp; wizard progress</button>' +
            '<button class="btn btn-danger" data-action="settings-reset-all">Delete everything (settings, saves, analyses)</button>' +
          '</div>' +
          '<p class="small muted mt-8" id="settings-cleared" role="status"></p>' +
        '</div>' +

        '<div class="card">' +
          '<h2>Responsible use</h2>' +
          '<p>Exam Detective is designed for aggregate exam-result analysis. Avoid uploading student names or personal information unless your school or district allows it. Uploaded files may contain internal assessment materials, answer keys, and class performance data. Delete analyses when they are no longer needed.</p>' +
          '<p class="mt-8">Suggestions are advisory. Always review a recommendation — and your school’s mark-change process — before changing marks. Only upload materials you are allowed to analyze.</p>' +
        '</div>' +
      '</div></div>'
    );
  };

  ED.actions["settings-save"] = function () {
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : ""; };
    var s = { subject: v("set-subject").trim(), grade: v("set-grade").trim(), exportFormat: v("set-format") };
    var note = document.getElementById("settings-saved");
    if (!s.subject && !s.grade && !s.exportFormat) {
      if (note) note.textContent = "Nothing to save yet — fill in at least one default first, or leave Settings as-is.";
      return;
    }
    setSettings(s);
    ED.app.rerender(); // refresh the "still to decide" status box
    var freshNote = document.getElementById("settings-saved");
    if (freshNote) freshNote.textContent = "Saved ✓";
  };

  ED.actions["settings-clear-defaults"] = function () {
    setSettings(blankSettings());
    ED.app.rerender();
  };

  ED.actions["settings-clear-wizard"] = function () {
    ED.wizard.resetState();
    ED.data.clearActive();
    var note = document.getElementById("settings-cleared");
    if (note) note.textContent = "Uploaded data, wizard progress, and the active analysis were removed from this device.";
  };

  ED.actions["settings-reset-all"] = function () {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf("examdetective.") === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    var note = document.getElementById("settings-cleared");
    if (note) note.textContent = "All Exam Detective data removed from this device. The built-in demo dataset is still available (it ships with the app).";
  };
})();
