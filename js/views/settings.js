/* Settings page — kept deliberately small. */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  var STORE_KEY = "examdetective.settings";

  function getSettings() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : { subject: "ELA", grade: "8", exportFormat: "pdf" };
    } catch (e) {
      return { subject: "ELA", grade: "8", exportFormat: "pdf" };
    }
  }
  function setSettings(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  ED.views.settings = function () {
    var s = getSettings();
    var esc = ED.analysis.esc;
    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Settings</div>' +
          '<h1>Settings</h1>' +
          '<p class="lede">Defaults for new analyses, plus the controls for clearing data off this device.</p>' +
        '</div>' +

        '<div class="card">' +
          '<h2>Defaults</h2>' +
          '<div class="field"><label for="set-subject">Default subject</label>' +
            '<input type="text" id="set-subject" value="' + esc(s.subject) + '"></div>' +
          '<div class="field"><label for="set-grade">Default grade</label>' +
            '<input type="text" id="set-grade" value="' + esc(s.grade) + '"></div>' +
          '<div class="field"><label for="set-format">Preferred export format</label>' +
            '<select id="set-format">' +
              '<option value="pdf"' + (s.exportFormat === "pdf" ? " selected" : "") + '>PDF (Print → Save as PDF)</option>' +
              '<option value="html"' + (s.exportFormat === "html" ? " selected" : "") + '>HTML (standalone file)</option>' +
              '<option value="docx"' + (s.exportFormat === "docx" ? " selected" : "") + '>DOCX (planned — not available yet)</option>' +
            '</select></div>' +
          '<button class="btn btn-primary" data-action="settings-save">Save defaults</button>' +
          '<span class="small muted" id="settings-saved" style="margin-left:10px;"></span>' +
        '</div>' +

        '<div class="card">' +
          '<h2>Your data</h2>' +
          '<p>In this demo build everything stays in your browser — nothing is uploaded to a server. These buttons clear it from this device.</p>' +
          '<div class="btn-row mt-16">' +
            '<button class="btn btn-danger" data-action="settings-clear-wizard">Delete uploaded files &amp; wizard progress</button>' +
            '<button class="btn btn-danger" data-action="settings-reset-all">Reset demo / delete all local data</button>' +
          '</div>' +
          '<p class="small muted mt-8" id="settings-cleared"></p>' +
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
    setSettings({ subject: v("set-subject").trim(), grade: v("set-grade").trim(), exportFormat: v("set-format") });
    var note = document.getElementById("settings-saved");
    if (note) note.textContent = "Saved ✓";
  };

  ED.actions["settings-clear-wizard"] = function () {
    ED.wizard.resetState();
    var note = document.getElementById("settings-cleared");
    if (note) note.textContent = "Wizard progress and file lists removed from this device.";
  };

  ED.actions["settings-reset-all"] = function () {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf("examdetective.") === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    var note = document.getElementById("settings-cleared");
    if (note) note.textContent = "All Exam Detective data removed from this device. The demo dataset is built in and still available.";
  };
})();
