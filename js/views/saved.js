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
          '<p class="lede">The list below lives in <b>this browser’s local storage</b>. Clearing browser data deletes it, so export a backup — or sign in below to keep analyses in your account.</p>' +
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

        cloudCard(cloud, active, all) +
      '</div></div>'
    );
  };

  // ----- cloud sync card (state-aware; every state honest) -----

  function cloudCard(cloud, active, allLocal) {
    var esc = ED.analysis.esc;
    if (!cloud.configured) {
      return '<div class="card">' +
        '<h2>Cloud sync <span class="src-chip-inline demo" style="vertical-align:middle;">Not configured</span></h2>' +
        '<p>' + esc(cloud.message) + '</p>' +
      '</div>';
    }
    if (!cloud.signedIn) {
      return '<div class="card">' +
        '<h2>Cloud sync <span class="src-chip-inline demo" style="vertical-align:middle;">Signed out</span></h2>' +
        '<p class="mb-16">' + esc(cloud.message) + '</p>' +
        '<button class="btn btn-primary" data-action="cloud-signin">Sign in with Google</button>' +
      '</div>';
    }
    var unmigrated = allLocal.filter(function (e) { return !e.cloudId; }).length;
    // the list itself loads asynchronously after render (see cloud-refresh)
    if (typeof setTimeout === "function") {
      setTimeout(function () {
        if (ED.actions["cloud-refresh"] && typeof document !== "undefined" &&
            document.getElementById && document.getElementById("cloud-list")) {
          ED.actions["cloud-refresh"]();
        }
      }, 0);
    }
    return '<div class="card">' +
      '<h2>Cloud sync <span class="src-chip-inline uploaded" style="vertical-align:middle;">' + esc(cloud.email || "Signed in") + '</span></h2>' +
      '<p class="mb-16">Analyses saved to your account are available from any device you sign in on. ' +
        'Only your own rows are visible to you — enforced by the database (row-level security), not the browser.</p>' +
      '<div class="btn-row mb-16">' +
        (active ? '<button class="btn btn-primary btn-sm" data-action="cloud-save-current">Save current analysis to account</button>' : '') +
        (unmigrated ? '<button class="btn btn-outline btn-sm" data-action="cloud-migrate">Copy ' + unmigrated + ' local analys' + (unmigrated === 1 ? "is" : "es") + ' to account</button>' : '') +
        '<button class="btn btn-outline btn-sm" data-action="cloud-refresh">Refresh list</button>' +
        '<button class="btn btn-outline btn-sm" data-action="cloud-signout">Sign out</button>' +
        '<span class="small muted" id="cloud-note" role="status"></span>' +
      '</div>' +
      '<div id="cloud-list"><p class="small muted">Loading your account’s analyses…</p></div>' +
    '</div>';
  }

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

  // ----- cloud actions -----

  function cloudNote(msg) {
    var el = document.getElementById("cloud-note");
    if (el) el.textContent = msg || "";
  }

  // Render one row of the account's analyses list.
  function cloudRow(r) {
    var esc = ED.analysis.esc;
    var sm = r.summary || {};
    var meta = r.summary
      ? [sm.grade ? "Grade " + esc(String(sm.grade)) : "", esc(sm.subject || ""),
         sm.students != null ? sm.students + " students" : "",
         sm.questions != null ? sm.questions + " questions" : "",
         sm.flagged != null ? sm.flagged + " flagged" : ""].filter(Boolean).join(" · ")
      : "";
    return '<div class="card saved-row">' +
      '<div>' +
        '<div class="card-label">In your account · saved ' + new Date(r.created_at).toLocaleString() + '</div>' +
        '<h3 style="margin-bottom:4px;">' + esc(r.name) + ' ' +
          (r.source === "demo"
            ? '<span class="src-chip-inline demo">Demo Data</span>'
            : '<span class="src-chip-inline uploaded">Uploaded Data</span>') + '</h3>' +
        (meta ? '<p class="small muted">' + meta + '</p>' : '') +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary btn-sm" data-action="cloud-reopen" data-id="' + esc(r.id) + '">Reopen</button>' +
        '<button class="btn btn-outline btn-sm" data-action="cloud-rename" data-id="' + esc(r.id) + '" data-name="' + esc(r.name) + '">Rename</button>' +
        '<button class="btn btn-danger btn-sm" data-action="cloud-delete" data-id="' + esc(r.id) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }

  ED.actions["cloud-refresh"] = function () {
    var list = document.getElementById("cloud-list");
    if (!list) return;
    ED.cloud.listAnalyses().then(function (res) {
      if (!res.ok) {
        list.innerHTML = '<p class="small muted">' + (res.error === "not-signed-in"
          ? "Your session expired — sign in again to see your account’s analyses."
          : "Couldn’t load your account’s analyses (network or server issue). Local saves above are unaffected.") + '</p>';
        return;
      }
      list.innerHTML = res.rows.length
        ? res.rows.map(cloudRow).join("")
        : '<p class="small muted">No analyses in your account yet. Use “Save current analysis to account”, or copy your local saves up.</p>';
    });
  };

  // Save locally first (that's the durability guarantee), then upload the
  // same entry — one code path, one shape, everywhere.
  ED.actions["cloud-save-current"] = function () {
    var an = ED.data.activeAnalysis();
    var res = ED.data.saveCurrent(an ? an.examName + " — saved " + new Date().toLocaleDateString() : "");
    if (!res.ok) { cloudNote(res.error); return; }
    cloudNote("Uploading…");
    ED.cloud.saveAnalysis(res.entry.name, res.entry).then(function (up) {
      if (up.ok) {
        ED.data.markCloudId(res.entry.id, up.id);
        cloudNote("Saved to your account (and locally).");
        ED.actions["cloud-refresh"]();
      } else {
        cloudNote("Saved locally, but the account upload failed (" + up.error + "). Try “Copy local analyses” later.");
      }
    });
  };

  ED.actions["cloud-migrate"] = function () {
    cloudNote("Copying local analyses to your account…");
    ED.cloud.migrateLocal().then(function (res) {
      cloudNote(res.uploaded + " cop" + (res.uploaded === 1 ? "y" : "ies") + " uploaded" +
        (res.failed ? ", " + res.failed + " failed — try again" : "") + ". Local saves stay on this device too.");
      ED.actions["cloud-refresh"]();
    });
  };

  ED.actions["cloud-reopen"] = function (el) {
    cloudNote("Downloading…");
    ED.cloud.getAnalysis(el.getAttribute("data-id")).then(function (res) {
      if (!res.ok) { cloudNote("Couldn’t download that analysis (" + res.error + ")."); return; }
      var applied = ED.data.applySavedEntry(res.entry);
      if (!applied.ok) { cloudNote(applied.error); return; }
      location.hash = "#/results";
    });
  };

  ED.actions["cloud-rename"] = function (el) {
    var id = el.getAttribute("data-id");
    var name = typeof prompt === "function" ? prompt("New name for this saved analysis:", el.getAttribute("data-name") || "") : null;
    if (name === null || !String(name).trim()) return;
    ED.cloud.renameAnalysis(id, String(name).trim()).then(function (res) {
      if (!res.ok) cloudNote("Rename failed (" + res.error + ").");
      ED.actions["cloud-refresh"]();
    });
  };

  ED.actions["cloud-delete"] = function (el) {
    ED.cloud.deleteAnalysis(el.getAttribute("data-id")).then(function (res) {
      if (!res.ok) cloudNote("Delete failed (" + res.error + ").");
      ED.actions["cloud-refresh"]();
    });
  };
})();
