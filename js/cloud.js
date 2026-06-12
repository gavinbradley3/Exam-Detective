/* ============================================================
   Exam Detective — cloud-sync status (honest detection only)

   There is NO cloud backend wired in this build. This module only
   detects whether Supabase configuration has been provided, so the
   UI can say "not configured" truthfully instead of pretending.

   To configure (when you're ready — full steps in
   AUTH_AND_STORAGE_PLAN.md):
   1. create js/config.js (gitignored) from js/config.example.js
   2. add <script src="js/config.js"></script> to index.html
      BEFORE js/cloud.js
   3. implement the sync layer described in the plan doc — this file
      deliberately does not fake it.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  function config() {
    var c = window.ED_CONFIG;
    if (c && typeof c.supabaseUrl === "string" && /^https:\/\//.test(c.supabaseUrl) &&
        typeof c.supabaseAnonKey === "string" && c.supabaseAnonKey.length > 20) {
      return { supabaseUrl: c.supabaseUrl, supabaseAnonKey: c.supabaseAnonKey };
    }
    return null;
  }

  function status() {
    var c = config();
    if (!c) {
      return {
        configured: false,
        message: "Cloud sync isn’t configured. Analyses save to this browser only. Setup steps: AUTH_AND_STORAGE_PLAN.md."
      };
    }
    // Config present but the sync layer itself is not built yet — say so.
    return {
      configured: false,
      hasConfig: true,
      message: "Supabase config was found, but the sync layer isn’t built in this version — saving stays local. See AUTH_AND_STORAGE_PLAN.md for what remains."
    };
  }

  ED.cloud = { config: config, status: status };
})();
