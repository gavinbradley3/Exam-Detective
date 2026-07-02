/* ============================================================
   Exam Detective — data store
   Tracks which dataset is ACTIVE (demo vs uploaded), and manages
   locally saved analyses. Everything lives in this browser's
   localStorage — clearly labeled as local, not cloud, storage.
   See AUTH_AND_STORAGE_PLAN.md for the real-auth roadmap.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var ACTIVE_KEY = "examdetective.active";
  var SAVED_KEY = "examdetective.saved";
  var PROFILE_KEY = "examdetective.profile";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  // ---------- active dataset ----------
  // { source: "demo" } or { source: "uploaded", analysis: {...} }
  // No record at all means: nothing has been run yet.

  function getActiveRecord() { return read(ACTIVE_KEY, null); }

  function setActiveDemo() { write(ACTIVE_KEY, { source: "demo", activatedAt: Date.now() }); }

  function setActiveUploaded(analysis) {
    write(ACTIVE_KEY, { source: "uploaded", analysis: analysis, activatedAt: Date.now() });
  }

  function clearActive() {
    try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
  }

  // Returns the analysis to render, or null if nothing is active.
  function activeAnalysis() {
    var rec = getActiveRecord();
    if (!rec) return null;
    if (rec.source === "uploaded" && rec.analysis) return rec.analysis;
    if (rec.source === "demo") {
      var an = ED.demo.analysis;
      an.source = "demo";
      return an;
    }
    return null;
  }

  // The demo analysis, explicitly (used by "View Demo" entry points).
  function demoAnalysis() {
    var an = ED.demo.analysis;
    an.source = "demo";
    return an;
  }

  // ---------- saved analyses (local browser storage) ----------

  function listSaved() { return read(SAVED_KEY, []); }

  function saveCurrent(name) {
    var rec = getActiveRecord();
    if (!rec) return { ok: false, error: "Nothing to save yet — run an analysis first." };
    var an = activeAnalysis();
    var wizard = read("examdetective.wizard", null);
    var settings = read("examdetective.settings", null);
    var entry = {
      id: "save-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name: name || (an ? an.examName : "Analysis") + " — " + new Date().toLocaleDateString(),
      savedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      archived: false,
      source: rec.source,
      active: rec,
      wizard: wizard,
      settings: settings,
      summary: an ? {
        examName: an.examName,
        grade: an.grade || "",
        subject: an.subject || "",
        sections: an.sections.length,
        students: an.totalResponses,
        questions: an.totalQuestions,
        flagged: an.flagged.length,
        files: an.uploadedMeta ? an.uploadedMeta.filesUploaded : 0
      } : null
    };
    var all = listSaved();
    all.unshift(entry);
    if (!write(SAVED_KEY, all)) {
      return { ok: false, error: "Couldn’t save — this browser’s local storage is full or blocked. Export a JSON backup instead." };
    }
    return { ok: true, entry: entry };
  }

  // Restore one saved entry (local or downloaded from the cloud) as the
  // active workspace. Shared by local reopen and cloud reopen so both
  // restore exactly the same things.
  function applySavedEntry(entry) {
    if (!entry || !entry.active) return { ok: false, error: "That saved analysis is missing its data." };
    write(ACTIVE_KEY, entry.active);
    if (entry.wizard) write("examdetective.wizard", entry.wizard);
    if (entry.settings) write("examdetective.settings", entry.settings);
    return { ok: true, entry: entry };
  }

  function reopenSaved(id) {
    var entry = listSaved().filter(function (e) { return e.id === id; })[0];
    if (!entry) return { ok: false, error: "That saved analysis wasn’t found." };
    return applySavedEntry(entry);
  }

  // Record that a local save has been uploaded to the cloud (so migration
  // never uploads the same entry twice).
  function markCloudId(id, cloudId) {
    return updateSaved(id, function (e) { e.cloudId = cloudId; });
  }

  function deleteSaved(id) {
    write(SAVED_KEY, listSaved().filter(function (e) { return e.id !== id; }));
  }

  function updateSaved(id, fn) {
    var all = listSaved();
    var entry = all.filter(function (e) { return e.id === id; })[0];
    if (!entry) return { ok: false, error: "That saved analysis wasn’t found." };
    fn(entry);
    entry.modifiedAt = new Date().toISOString();
    write(SAVED_KEY, all);
    return { ok: true, entry: entry };
  }

  function renameSaved(id, name) {
    if (!name || !String(name).trim()) return { ok: false, error: "Give it a name first." };
    return updateSaved(id, function (e) { e.name = String(name).trim(); });
  }

  function setArchived(id, archived) {
    return updateSaved(id, function (e) { e.archived = !!archived; });
  }

  // Duplicate = an independent deep copy with its own id; editing or
  // reopening the copy can never touch the original.
  function duplicateSaved(id) {
    var entry = listSaved().filter(function (e) { return e.id === id; })[0];
    if (!entry) return { ok: false, error: "That saved analysis wasn’t found." };
    var copy = JSON.parse(JSON.stringify(entry));
    copy.id = "save-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    copy.name = entry.name + " (copy)";
    copy.savedAt = new Date().toISOString();
    copy.modifiedAt = copy.savedAt;
    copy.archived = false;
    var all = listSaved();
    all.unshift(copy);
    if (!write(SAVED_KEY, all)) return { ok: false, error: "Couldn’t save the copy — local storage is full." };
    return { ok: true, entry: copy };
  }

  // Search/filter over saved entries (pure; tested directly).
  function filterSaved(entries, query, show) {
    var q = String(query || "").toLowerCase().trim();
    return entries.filter(function (e) {
      if (show === "archived" && !e.archived) return false;
      if (show !== "archived" && e.archived) return false;
      if (!q) return true;
      var hay = [e.name, e.source, e.summary && e.summary.examName,
        e.summary && e.summary.grade, e.summary && e.summary.subject].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  // ---------- JSON backup (export / import) ----------

  function exportBackup() {
    return JSON.stringify({
      app: "Exam Detective",
      format: 1,
      exportedAt: new Date().toISOString(),
      saved: listSaved(),
      settings: read("examdetective.settings", null)
    }, null, 2);
  }

  function importBackup(jsonText) {
    var data;
    try { data = JSON.parse(jsonText); }
    catch (e) { return { ok: false, error: "That file isn’t valid JSON. Use a backup exported from Exam Detective." }; }
    if (!data || data.app !== "Exam Detective" || !Array.isArray(data.saved)) {
      return { ok: false, error: "That file doesn’t look like an Exam Detective backup (missing the saved-analyses list)." };
    }
    var existing = listSaved();
    var existingIds = {};
    existing.forEach(function (e) { existingIds[e.id] = true; });
    var added = 0;
    data.saved.forEach(function (e) {
      if (e && e.id && !existingIds[e.id]) { existing.push(e); added++; }
    });
    write(SAVED_KEY, existing);
    return { ok: true, added: added, skipped: data.saved.length - added };
  }

  // ---------- local profile (NOT real authentication) ----------

  function getProfile() { return read(PROFILE_KEY, null); }
  function setProfile(name) { write(PROFILE_KEY, { name: name, createdAt: Date.now() }); }
  function clearProfile() { try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} }

  ED.data = {
    getActiveRecord: getActiveRecord,
    setActiveDemo: setActiveDemo,
    setActiveUploaded: setActiveUploaded,
    clearActive: clearActive,
    activeAnalysis: activeAnalysis,
    demoAnalysis: demoAnalysis,
    listSaved: listSaved,
    saveCurrent: saveCurrent,
    reopenSaved: reopenSaved,
    applySavedEntry: applySavedEntry,
    markCloudId: markCloudId,
    deleteSaved: deleteSaved,
    renameSaved: renameSaved,
    duplicateSaved: duplicateSaved,
    setArchived: setArchived,
    filterSaved: filterSaved,
    exportBackup: exportBackup,
    importBackup: importBackup,
    getProfile: getProfile,
    setProfile: setProfile,
    clearProfile: clearProfile
  };
})();
