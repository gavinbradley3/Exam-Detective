/* ============================================================
   Exam Detective — cloud sync (Supabase Auth + Postgres)

   Real implementation, zero dependencies: talks to Supabase's
   GoTrue (auth) and PostgREST (data) endpoints directly with
   fetch, the same way this project hand-rolls PDF/XLSX parsing.

   Configuration (public-by-design values; see AUTH_AND_STORAGE_PLAN.md):
   1. copy js/config.example.js to js/config.js (gitignored)
   2. fill in supabaseUrl + supabaseAnonKey
   3. run scripts/supabase-setup.sql once in the Supabase SQL editor

   Honesty rules:
   - No config -> status says "not configured"; nothing pretends.
   - The anon key is public BY DESIGN; every data guarantee comes
     from the row-level-security policy in supabase-setup.sql
     ("teachers see only their own rows"), never from hiding keys.
   - The Google client secret lives ONLY in the Supabase dashboard.
   - Local saves keep working exactly as before, signed in or not.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var SESSION_KEY = "examdetective.session";
  var AUTH_ERROR_KEY = "examdetective.authError";

  // Injectable transport (tests stub this; defaults to fetch).
  var http = function (url, opts) { return fetch(url, opts); };

  function config() {
    var c = window.ED_CONFIG;
    if (c && typeof c.supabaseUrl === "string" && /^https:\/\//.test(c.supabaseUrl) &&
        typeof c.supabaseAnonKey === "string" && c.supabaseAnonKey.length > 20) {
      return { supabaseUrl: c.supabaseUrl.replace(/\/+$/, ""), supabaseAnonKey: c.supabaseAnonKey };
    }
    return null;
  }

  // ---------- session storage ----------

  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeSession(s) {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  function session() { return config() ? readSession() : null; }

  // Decode the payload of a JWT (base64url) — the access token carries
  // the user id (sub) and email; no extra network call needed.
  function decodeJwtPayload(token) {
    try {
      var part = String(token).split(".")[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
      // JWT payloads are ASCII-safe for the fields we need (sub/email)
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  // ---------- OAuth redirect handling ----------

  // Where Google/Supabase should send the user back to: this exact page,
  // without any hash route.
  function redirectTarget() {
    return location.origin + location.pathname;
  }

  function parseHashParams(hash) {
    var out = {};
    String(hash || "").replace(/^#\/?/, "").split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i > 0) out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
    });
    return out;
  }

  // Called once at load, BEFORE the router reads location.hash.
  // GoTrue's implicit flow returns tokens in the URL fragment:
  //   #access_token=...&refresh_token=...&expires_in=3600&token_type=bearer
  // Errors come back as #error=...&error_description=...
  function handleRedirect() {
    var h = location.hash || "";
    if (/(^#|&)access_token=/.test(h)) {
      var p = parseHashParams(h);
      var claims = decodeJwtPayload(p.access_token) || {};
      writeSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token || null,
        expires_at: p.expires_at ? parseInt(p.expires_at, 10)
          : Math.floor(Date.now() / 1000) + (parseInt(p.expires_in, 10) || 3600),
        user: { id: claims.sub || null, email: claims.email || null }
      });
      location.hash = "#/saved"; // land where the account is useful
      return { handled: true, signedIn: true };
    }
    // OAuth error fragments look like "#error=...&error_description=..." —
    // app routes always start with "#/" so there's no collision.
    if (/^#(?!\/)/.test(h) && /(^#|&)error(_description|_code)?=/.test(h)) {
      var pe = parseHashParams(h);
      try {
        localStorage.setItem(AUTH_ERROR_KEY,
          pe.error_description || pe.error || "Sign-in failed. Try again.");
      } catch (e) {}
      location.hash = "#/login";
      return { handled: true, signedIn: false };
    }
    return { handled: false };
  }

  // The login page shows (and clears) the last auth error, once.
  function takeAuthError() {
    try {
      var msg = localStorage.getItem(AUTH_ERROR_KEY);
      if (msg) localStorage.removeItem(AUTH_ERROR_KEY);
      return msg || null;
    } catch (e) { return null; }
  }

  function signInWithGoogle() {
    var c = config();
    if (!c) return false;
    location.href = c.supabaseUrl + "/auth/v1/authorize?provider=google&redirect_to=" +
      encodeURIComponent(redirectTarget());
    return true;
  }

  function signOut() {
    var c = config();
    var s = readSession();
    writeSession(null); // local sign-out always succeeds immediately
    if (c && s && s.access_token) {
      // best effort: revoke server-side too; failures change nothing local
      return ED.cloud.http(c.supabaseUrl + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: c.supabaseAnonKey, Authorization: "Bearer " + s.access_token }
      }).catch(function () {}).then(function () { return { ok: true }; });
    }
    return Promise.resolve({ ok: true });
  }

  // Refresh the access token when it's expired or about to (<60s left).
  // Resolves to a usable session, or null (signed out / refresh failed).
  function ensureFreshSession() {
    var c = config();
    var s = readSession();
    if (!c || !s) return Promise.resolve(null);
    var now = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at - now > 60) return Promise.resolve(s);
    if (!s.refresh_token) { writeSession(null); return Promise.resolve(null); }
    return ED.cloud.http(c.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: c.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error("refresh failed");
      return r.json();
    }).then(function (data) {
      if (!data || !data.access_token) throw new Error("refresh failed");
      var claims = decodeJwtPayload(data.access_token) || {};
      var fresh = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || s.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        user: { id: claims.sub || (s.user && s.user.id), email: claims.email || (s.user && s.user.email) }
      };
      writeSession(fresh);
      return fresh;
    }).catch(function () {
      writeSession(null); // an unusable session must not look signed in
      return null;
    });
  }

  // ---------- data: the analyses table (PostgREST) ----------
  // The table + row-level security live in scripts/supabase-setup.sql.
  // user_id is set by the DATABASE (default auth.uid()) — the client
  // never sends it, so it can't be spoofed.

  function rest(pathAndQuery, opts) {
    var c = config();
    if (!c) return Promise.resolve({ ok: false, error: "not-configured" });
    return ensureFreshSession().then(function (s) {
      if (!s) return { ok: false, error: "not-signed-in" };
      opts = opts || {};
      var headers = Object.assign({
        apikey: c.supabaseAnonKey,
        Authorization: "Bearer " + s.access_token
      }, opts.headers || {});
      return ED.cloud.http(c.supabaseUrl + "/rest/v1/" + pathAndQuery, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body
      }).then(function (r) {
        if (r.status === 401 || r.status === 403) return { ok: false, error: "not-signed-in" };
        if (!r.ok) return { ok: false, error: "server", status: r.status };
        if (r.status === 204) return { ok: true, rows: [] };
        return r.json().then(function (rows) { return { ok: true, rows: rows }; })
          .catch(function () { return { ok: true, rows: [] }; });
      }).catch(function () { return { ok: false, error: "network" }; });
    });
  }

  // List is intentionally light: names + summaries, not full payloads.
  function listAnalyses() {
    return rest("analyses?select=id,name,created_at,updated_at," +
      "source:payload->source,summary:payload->summary&order=created_at.desc");
  }

  // payload = one local saved-analysis entry (built by ED.data), stored
  // whole so reopening restores exactly what a local reopen restores.
  function saveAnalysis(name, payload) {
    return rest("analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ name: name, payload: payload })
    }).then(function (res) {
      if (!res.ok) return res;
      var row = res.rows && res.rows[0];
      return row ? { ok: true, id: row.id, row: row } : { ok: false, error: "server" };
    });
  }

  function getAnalysis(id) {
    return rest("analyses?id=eq." + encodeURIComponent(id) + "&select=id,name,payload").then(function (res) {
      if (!res.ok) return res;
      var row = res.rows && res.rows[0];
      return row ? { ok: true, entry: row.payload, name: row.name, id: row.id } : { ok: false, error: "not-found" };
    });
  }

  function renameAnalysis(id, name) {
    return rest("analyses?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, updated_at: new Date().toISOString() })
    });
  }

  function deleteAnalysis(id) {
    return rest("analyses?id=eq." + encodeURIComponent(id), { method: "DELETE" });
  }

  // ---------- one-time migration of local saves ----------
  // Uploads every local save that hasn't been uploaded yet, marking each
  // with the cloud row id so re-running never duplicates.
  function migrateLocal() {
    var locals = ED.data.listSaved().filter(function (e) { return !e.cloudId; });
    if (!locals.length) return Promise.resolve({ ok: true, uploaded: 0, skipped: 0 });
    var uploaded = 0, failed = 0;
    var chain = Promise.resolve();
    locals.forEach(function (entry) {
      chain = chain.then(function () {
        return saveAnalysis(entry.name, entry).then(function (res) {
          if (res.ok) {
            uploaded++;
            ED.data.markCloudId(entry.id, res.id);
          } else {
            failed++;
          }
        });
      });
    });
    return chain.then(function () { return { ok: failed === 0, uploaded: uploaded, failed: failed }; });
  }

  // ---------- status (every state stated honestly) ----------

  function status() {
    var c = config();
    if (!c) {
      return {
        configured: false,
        message: "Cloud sync isn’t configured. Analyses save to this browser only. Setup steps: AUTH_AND_STORAGE_PLAN.md."
      };
    }
    var s = readSession();
    if (!s) {
      return {
        configured: true,
        signedIn: false,
        message: "Cloud sync is configured. Sign in with Google to save analyses to your account — local saves keep working either way."
      };
    }
    return {
      configured: true,
      signedIn: true,
      email: (s.user && s.user.email) || null,
      message: "Signed in" + (s.user && s.user.email ? " as " + s.user.email : "") + ". Analyses can be saved to your account and opened from any device."
    };
  }

  function displayName() {
    var s = session();
    return s && s.user && s.user.email ? s.user.email : null;
  }

  ED.cloud = {
    config: config,
    status: status,
    session: session,
    displayName: displayName,
    handleRedirect: handleRedirect,
    takeAuthError: takeAuthError,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    ensureFreshSession: ensureFreshSession,
    listAnalyses: listAnalyses,
    saveAnalysis: saveAnalysis,
    getAnalysis: getAnalysis,
    renameAnalysis: renameAnalysis,
    deleteAnalysis: deleteAnalysis,
    migrateLocal: migrateLocal,
    decodeJwtPayload: decodeJwtPayload,
    parseHashParams: parseHashParams,
    http: http
  };

  // Consume OAuth redirect tokens before the router ever sees the hash.
  handleRedirect();
})();
