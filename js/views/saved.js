/* Saved Analyses — local browser storage (clearly labeled, not cloud).
   Save / reopen / delete analyses, plus JSON backup export & import. */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  ED.views.saved = function () {
    var esc = ED.analysis.esc;
    var saved = ED.data.listSaved();
    var active = ED.data.getActiveRecord();

    var listHtml;
    if (saved.length) {
      listHtml = saved.map(function (e) {
        var sm = e.summary || {};
        var chip = e.source === "demo"
          ? '<span class="src-chip-inline demo">Demo Data</span>'
          : '<span class="src-chip-inline uploaded">Uploaded Data</span>';
        return '<div class="card saved-row">' +
          '<div>' +
            '<div class="card-label">Saved ' + new Date(e.savedAt).toLocaleString() + '</div>' +
            '<h3 style="margin-bottom:4px;">' + esc(e.name) + ' ' + chip + '</h3>' +
            (e.summary
              ? '<p class="small muted">' + sm.sections + ' section' + (sm.sections === 1 ? "" : "s") + ' · ' + sm.students + ' students · ' + sm.questions + ' questions · ' + sm.flagged + ' flagged</p>'
              : '') +
          '</div>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary btn-sm" data-action="saved-reopen" data-id="' + e.id + '">Reopen</button>' +
            '<button class="btn btn-danger btn-sm" data-action="saved-delete" data-id="' + e.id + '">Delete</button>' +
          '</div>' +
        '</div>';
      }).join("");
    } else {
      listHtml = '<div class="card"><div class="empty-state" style="border:none;background:none;">' +
        '<b>Nothing saved yet.</b><span>Run an analysis, then use “Save analysis” on the Results page. It will appear here.</span></div></div>';
    }

    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Saved Analyses</div>' +
          '<h1>Saved analyses</h1>' +
          '<p class="lede">Stored in <b>this browser’s local storage</b> — not the cloud. Clearing browser data deletes them, so export a backup if they matter.</p>' +
        '</div>' +

        (active
          ? '<div class="notice info"><span class="notice-title">Active now</span>' +
            (active.source === "demo" ? "The demo dataset" : "Your uploaded dataset") +
            ' is currently active. <button class="btn btn-sm btn-outline" data-action="save-analysis-here">Save it</button>' +
            ' <span class="small" id="saved-note" role="status"></span></div>'
          : '') +

        listHtml +

        '<div class="card mt-24">' +
          '<h2>Backup</h2>' +
          '<p class="mb-16">Export every saved analysis (plus your settings) as a single JSON file — or restore from one. This is the safety net until real cloud accounts exist.</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-outline" data-action="saved-export">Export backup (JSON)</button>' +
            '<label class="btn btn-outline" style="cursor:pointer;">Import backup' +
              '<input type="file" accept=".json,application/json" data-change="saved-import" class="visually-hidden"></label>' +
            '<span class="small muted" id="backup-note" role="status"></span>' +
          '</div>' +
        '</div>' +
      '</div></div>'
    );
  };

  ED.actions["save-analysis-here"] = function () {
    var an = ED.data.activeAnalysis();
    var res = ED.data.saveCurrent(an ? an.examName + " — saved " + new Date().toLocaleDateString() : "");
    if (res.ok) { ED.app.rerender(); return; }
    var note = document.getElementById("saved-note");
    if (note) note.textContent = res.error;
  };

  ED.actions["saved-reopen"] = function (el) {
    var res = ED.data.reopenSaved(el.getAttribute("data-id"));
    if (res.ok) location.hash = "#/results";
  };

  ED.actions["saved-delete"] = function (el) {
    ED.data.deleteSaved(el.getAttribute("data-id"));
    ED.app.rerender();
  };

  ED.actions["saved-export"] = function () {
    var blob = new Blob([ED.data.exportBackup()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exam-detective-backup.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  ED.actions["saved-import"] = function (el) {
    var f = el.files && el.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = ED.data.importBackup(String(reader.result));
      if (res.ok) {
        ED.app.rerender();
      } else {
        var note = document.getElementById("backup-note");
        if (note) note.textContent = res.error;
      }
    };
    reader.readAsText(f);
    el.value = "";
  };
})();
