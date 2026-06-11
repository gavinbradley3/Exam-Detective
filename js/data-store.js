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
      id: "save-" + Date.now(),
      name: name || (an ? an.examName : "Analysis") + " — " + new Date().toLocaleDateString(),
      savedAt: new Date().toISOString(),
      source: rec.source,
      active: rec,
      wizard: wizard,
      settings: settings,
      summary: an ? {
        examName: an.examName,
        sections: an.sections.length,
        students: an.totalResponses,
        questions: an.totalQuestions,
        flagged: an.flagged.length
      } : null
    };
    var all = listSaved();
    all.unshift(entry);
    if (!write(SAVED_KEY, all)) {
      return { ok: false, error: "Couldn’t save — this browser’s local storage is full or blocked. Export a JSON backup instead." };
    }
    return { ok: true, entry: entry };
  }

  function reopenSaved(id) {
    var entry = listSaved().filter(function (e) { return e.id === id; })[0];
    if (!entry) return { ok: false, error: "That saved analysis wasn’t found." };
    write(ACTIVE_KEY, entry.active);
    if (entry.wizard) write("examdetective.wizard", entry.wizard);
    if (entry.settings) write("examdetective.settings", entry.settings);
    return { ok: true, entry: entry };
  }

  function deleteSaved(id) {
    write(SAVED_KEY, listSaved().filter(function (e) { return e.id !== id; }));
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
    deleteSaved: deleteSaved,
    exportBackup: exportBackup,
    importBackup: importBackup,
    getProfile: getProfile,
    setProfile: setProfile,
    clearProfile: clearProfile
  };
})();
