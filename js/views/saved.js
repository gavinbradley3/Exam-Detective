/* Saved Analyses — local browser storage (clearly labeled, not cloud).
   Save / reopen / rename / duplicate / archive / delete / search,
   plus JSON backup export & import. Cloud sync shows its honest
   not-configured status (js/cloud.js). */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  // view-local UI state (not persisted)
  var query = "";
  var show = "active"; // "active" | "archived"

  function savedRow(e) {
    var esc = ED.analysis.esc;
    var sm = e.summary || {};
    var chip = e.source === "demo"
      ? '<span class="src-chip-inline demo">Demo Data</span>'
      : '<span class="src-chip-inline uploaded">Uploaded Data</span>';
    var meta = e.summary
      ? [sm.grade ? "Grade " + esc(sm.grade) : "", esc(sm.subject || ""),
         sm.sections + " section" + (sm.sections === 1 ? "" : "s"),
         sm.students + " students", sm.questions + " questions", sm.flagged + " flagged"]
          .filter(Boolean).join(" · ")
      : "";
    return '<div class="card saved-row' + (e.archived ? " archived" : "") + '">' +
      '<div>' +
        '<div class="card-label">Saved ' + new Date(e.savedAt).toLocaleString() +
          (e.modifiedAt && e.modifiedAt !== e.savedAt ? ' · modified ' + new Date(e.modifiedAt).toLocaleString() : '') + '</div>' +
        '<h3 style="margin-bottom:4px;">' + esc(e.name) + ' ' + chip +
          (e.archived ? ' <span class="src-chip-inline" style="border:1px dashed var(--slate-border);color:var(--muted);">Archived</span>' : '') + '</h3>' +
        (meta ? '<p class="small muted">' + meta + '</p>' : '') +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary btn-sm" data-action="saved-reopen" data-id="' + e.id + '">Reopen</button>' +
        '<button class="btn btn-outline btn-sm" data-action="saved-rename" data-id="' + e.id + '">Rename</button>' +
        '<button class="btn btn-outline btn-sm" data-action="saved-duplicate" data-id="' + e.id + '">Duplicate</button>' +
        '<button class="btn btn-outline btn-sm" data-action="saved-archive" data-id="' + e.id + '" data-archived="' + (e.archived ? "1" : "") + '">' + (e.archived ? "Unarchive" : "Archive") + '</button>' +
        '<button class="btn btn-danger btn-sm" data-action="saved-delete" data-id="' + e.id + '">Delete</button>' +
      '</div>' +
    '</div>';
  }

  ED.views.saved = function () {
    var esc = ED.analysis.esc;
    var all = ED.data.listSaved();
    var shown = ED.data.filterSaved(all, query, show);
    var active = ED.data.getActiveRecord();
    var archivedCount = all.filter(function (e) { return e.archived; }).length;
    var cloud = ED.cloud ? ED.cloud.status() : { configured: false, message: "" };

    var listHtml;
    if (!all.length) {
      listHtml = '<div class="card"><div class="empty-state" style="border:none;background:none;">' +
        '<b>Nothing saved yet.</b><span>Run an analysis, then use “Save analysis” on the Results page. It will appear here.</span></div></div>';
    } else if (!shown.length) {
      listHtml = '<div class="card"><div class="empty-state" style="border:none;background:none;">' +
        '<b>No matches.</b><span>' + (show === "archived" ? "No archived analyses" : "Nothing") +
        (query ? ' matching “' + esc(query) + '”' : '') + '.</span></div></div>';
    } else {
      listHtml = shown.map(savedRow).join("");
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
            ' is currently open. <button class="btn btn-sm btn-outline" data-action="save-analysis-here">Save it</button>' +
            ' <span class="small" id="saved-note" role="status"></span></div>'
          : '') +

        '<div class="saved-controls">' +
          '<input type="text" id="saved-search" value="' + esc(query) + '" placeholder="Search by name, exam, grade, subject…" data-change="saved-search" aria-label="Search saved analyses">' +
          '<select data-change="saved-show" aria-label="Show active or archived analyses">' +
            '<option value="active"' + (show === "active" ? " selected" : "") + '>Active (' + (all.length - archivedCount) + ')</option>' +
            '<option value="archived"' + (show === "archived" ? " selected" : "") + '>Archived (' + archivedCount + ')</option>' +
          '</select>' +
        '</div>' +

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

        '<div class="card">' +
          '<h2>Cloud sync <span class="src-chip-inline demo" style="vertical-align:middle;">Not configured</span></h2>' +
          '<p>' + esc(cloud.message) + '</p>' +
        '</div>' +
      '</div></div>'
    );
  };

  // ----- actions -----

  ED.actions["save-analysis-here"] = function () {
    var an = ED.data.activeAnalysis();
    var res = ED.data.saveCurrent(an ? an.examName + " — saved " + new Date().toLocaleDateString() : "");
    if (res.ok) { ED.app.rerender(); return; }
    var note = document.getElementById("saved-note");
    if (note) note.textContent = res.error;
  };

  ED.actions["saved-search"] = function (el) { query = el.value; ED.app.rerender(); };
  ED.actions["saved-show"] = function (el) { show = el.value; ED.app.rerender(); };

  ED.actions["saved-reopen"] = function (el) {
    var res = ED.data.reopenSaved(el.getAttribute("data-id"));
    if (res.ok) location.hash = "#/results";
  };

  ED.actions["saved-rename"] = function (el) {
    var id = el.getAttribute("data-id");
    var entry = ED.data.listSaved().filter(function (e) { return e.id === id; })[0];
    var name = typeof prompt === "function" ? prompt("New name for this saved analysis:", entry ? entry.name : "") : null;
    if (name !== null) {
      ED.data.renameSaved(id, name);
      ED.app.rerender();
    }
  };

  ED.actions["saved-duplicate"] = function (el) {
    ED.data.duplicateSaved(el.getAttribute("data-id"));
    ED.app.rerender();
  };

  ED.actions["saved-archive"] = function (el) {
    ED.data.setArchived(el.getAttribute("data-id"), !el.getAttribute("data-archived"));
    ED.app.rerender();
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
