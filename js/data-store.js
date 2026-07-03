/* ============================================================
   Exam Detective — data store
   Tracks which dataset is ACTIVE (demo vs uploaded), and manages
   locally saved analyses. Everything lives in this browser's
   localStorage — clearly labeled as local, not cloud, storage.
   See AUTH_AND_STORAGE_PLAN.md for the real-auth roadmap.

   Account isolation on shared devices:
   When signed in (real Google/Supabase account), the active analysis
   and saved-analyses list are stored under a key SCOPED to that
   account's user id — not the bare key. This matters on a shared
   school/classroom computer: without scoping, Teacher B signing in
   with a different Google account would still see Teacher A's
   locally-saved analyses and open results, because plain localStorage
   has no concept of "signed in as." Scoping closes that gap.
   Signed OUT (or cloud sync not configured), storage uses the bare,
   unscoped keys exactly as before — single shared local workspace,
   same as every prior version of this app.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var ACTIVE_KEY_BASE = "examdetective.active";
  var SAVED_KEY_BASE = "examdetective.saved";
  var WIZARD_KEY_BASE = "examdetective.wizard";
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

  // The signed-in account's id, or null (signed out / cloud not configured
  // / local-profile-only use). Read fresh every call — sign-in state can
  // change mid-session.
  function accountId() {
    try {
      if (!window.ED || !ED.cloud || typeof ED.cloud.session !== "function") return null;
      var s = ED.cloud.session();
      return (s && s.user && s.user.id) ? s.user.id : null;
    } catch (e) { return null; }
  }

  // The account-scoped key when signed in; the plain/legacy key otherwise.
  function scopedKey(base) {
    var uid = accountId();
    return uid ? base + ".acct." + uid : base;
  }

  // ---------- active dataset ----------
  // { source: "demo" } or { source: "uploaded", analysis: {...} }
  // No record at all means: nothing has been run yet.

  function getActiveRecord() { return read(scopedKey(ACTIVE_KEY_BASE), null); }

  function setActiveDemo() { write(scopedKey(ACTIVE_KEY_BASE), { source: "demo", activatedAt: Date.now() }); }

  function setActiveUploaded(analysis) {
    write(scopedKey(ACTIVE_KEY_BASE), { source: "uploaded", analysis: analysis, activatedAt: Date.now() });
  }

  function clearActive() {
    try { localStorage.removeItem(scopedKey(ACTIVE_KEY_BASE)); } catch (e) {}
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

  function listSaved() { return read(scopedKey(SAVED_KEY_BASE), []); }

  function saveCurrent(name) {
    var rec = getActiveRecord();
    if (!rec) return { ok: false, error: "Nothing to save yet — run an analysis first." };
    var an = activeAnalysis();
    var wizard = read(scopedKey(WIZARD_KEY_BASE), null);
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
    if (!write(scopedKey(SAVED_KEY_BASE), all)) {
      return { ok: false, error: "Couldn’t save — this browser’s local storage is full or blocked. Export a JSON backup instead." };
    }
    return { ok: true, entry: entry };
  }

  // Restore one saved entry (local or downloaded from the cloud) as the
  // active workspace. Shared by local reopen and cloud reopen so both
  // restore exactly the same things.
  function applySavedEntry(entry) {
    if (!entry || !entry.active) return { ok: false, error: "That saved analysis is missing its data." };
    write(scopedKey(ACTIVE_KEY_BASE), entry.active);
    if (entry.wizard) write(scopedKey(WIZARD_KEY_BASE), entry.wizard);
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
    write(scopedKey(SAVED_KEY_BASE), listSaved().filter(function (e) { return e.id !== id; }));
  }

  function updateSaved(id, fn) {
    var all = listSaved();
    var entry = all.filter(function (e) { return e.id === id; })[0];
    if (!entry) return { ok: false, error: "That saved analysis wasn’t found." };
    fn(entry);
    entry.modifiedAt = new Date().toISOString();
    write(scopedKey(SAVED_KEY_BASE), all);
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
    if (!write(scopedKey(SAVED_KEY_BASE), all)) return { ok: false, error: "Couldn’t save the copy — local storage is full." };
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
    write(scopedKey(SAVED_KEY_BASE), existing);
    return { ok: true, added: added, skipped: data.saved.length - added };
  }

  // ---------- legacy local data (from before sign-in, or another user of
  // this device) — never silently claimed or silently hidden ----------

  // Is there unscoped (bare-key) active/saved data sitting on this device
  // while someone is signed in? That data predates this account or belongs
  // to whoever last used this device without signing in as this account.
  function legacyLocalStatus() {
    var uid = accountId();
    if (!uid) return { show: false, savedCount: 0, hasActive: false, hasWizard: false };
    var legacyActive = read(ACTIVE_KEY_BASE, null);
    var legacySaved = read(SAVED_KEY_BASE, []);
    var legacyWizard = read(WIZARD_KEY_BASE, null);
    // an untouched default wizard state isn't "data" — only flag real progress
    var wizardHasContent = !!(legacyWizard && (
      (legacyWizard.resultFiles || []).length || (legacyWizard.examFiles || []).length ||
      (legacyWizard.keyCount || 0) > 0 || (legacyWizard.setup && legacyWizard.setup.examName)));
    var savedCount = (legacySaved || []).length;
    return {
      show: !!legacyActive || savedCount > 0 || wizardHasContent,
      savedCount: savedCount, hasActive: !!legacyActive, hasWizard: wizardHasContent
    };
  }

  // "This is mine" — move the unscoped local data into the signed-in
  // account's own scoped bucket (still local-only; nothing is uploaded),
  // then clear the unscoped keys so no other account can see it.
  function claimLegacyLocal() {
    var uid = accountId();
    if (!uid) return { ok: false, error: "Sign in first." };
    var legacyActive = read(ACTIVE_KEY_BASE, null);
    var legacySaved = read(SAVED_KEY_BASE, []);
    var legacyWizard = read(WIZARD_KEY_BASE, null);
    if (legacyActive) write(scopedKey(ACTIVE_KEY_BASE), legacyActive);
    if (legacySaved && legacySaved.length) {
      write(scopedKey(SAVED_KEY_BASE), legacySaved.concat(listSaved()));
    }
    if (legacyWizard) write(scopedKey(WIZARD_KEY_BASE), legacyWizard);
    try {
      localStorage.removeItem(ACTIVE_KEY_BASE);
      localStorage.removeItem(SAVED_KEY_BASE);
      localStorage.removeItem(WIZARD_KEY_BASE);
    } catch (e) {}
    return { ok: true };
  }

  // "Not mine" — delete the unscoped local data outright.
  function discardLegacyLocal() {
    try {
      localStorage.removeItem(ACTIVE_KEY_BASE);
      localStorage.removeItem(SAVED_KEY_BASE);
      localStorage.removeItem(WIZARD_KEY_BASE);
    } catch (e) {}
    return { ok: true };
  }

  // ---------- local profile (NOT real authentication) ----------

  function getProfile() { return read(PROFILE_KEY, null); }
  function setProfile(name) { write(PROFILE_KEY, { name: name, createdAt: Date.now() }); }
  function clearProfile() { try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} }

  // The wizard stores in-progress uploads/keys under this key — scoped per
  // signed-in account for the same shared-device reason as saves above.
  function wizardKey() { return scopedKey(WIZARD_KEY_BASE); }

  ED.data = {
    wizardKey: wizardKey,
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
    legacyLocalStatus: legacyLocalStatus,
    claimLegacyLocal: claimLegacyLocal,
    discardLegacyLocal: discardLegacyLocal,
    getProfile: getProfile,
    setProfile: setProfile,
    clearProfile: clearProfile
  };
})();
