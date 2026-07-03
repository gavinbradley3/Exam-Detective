/* Cloud sync tests — fully mocked, no live Supabase needed.
   Run with:  node scripts/cloud-test.js
   Covers: config detection, OAuth redirect token handling (incl. the
   hash-router conflict), JWT decoding, session refresh, sign-out,
   REST calls (headers, no client-sent user_id), list/save/get/rename/
   delete, one-time local migration without duplicates, the state-aware
   status(), and the login/saved views in each state. */

"use strict";

global.window = global;
global.localStorage = {
  _s: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};
global.location = { hash: "#/", origin: "https://school.example", pathname: "/exam-detective/", href: "" };
global.document = { getElementById: function () { return null; }, addEventListener: function () {} };

var path = require("path");
var root = path.join(__dirname, "..");
[
  "js/data/demo-data.js", "js/analysis.js", "js/csv-parse.js",
  "js/analysis-builder.js", "js/data-store.js", "js/cloud.js",
  "js/views/login.js", "js/views/saved.js"
].forEach(function (f) { require(path.join(root, f)); });

var ED = global.ED;
ED.app = { rerender: function () {} };
var failures = [];
var passed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else failures.push(name);
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeJwt(claims) { return b64url({ alg: "none" }) + "." + b64url(claims) + ".sig"; }

var URL_BASE = "https://proj.supabase.co";
function configure() {
  global.ED_CONFIG = { supabaseUrl: URL_BASE, supabaseAnonKey: "public-anon-key-that-is-long-enough" };
}
function deconfigure() { delete global.ED_CONFIG; }
function clearSession() { localStorage.removeItem("examdetective.session"); }

// recorded mock transport
var calls = [];
function mockHttp(responder) {
  ED.cloud.http = function (url, opts) {
    calls.push({ url: url, opts: opts || {} });
    return Promise.resolve(responder(url, opts || {}));
  };
}
function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300, status: status,
    json: function () { return Promise.resolve(body); }
  };
}

// ---------- 1. config detection & honest status ----------
console.log("Config & status:");
deconfigure(); clearSession();
ok(ED.cloud.config() === null, "no config -> null");
var st = ED.cloud.status();
ok(st.configured === false && /isn.t configured/i.test(st.message) && /AUTH_AND_STORAGE/.test(st.message),
  "unconfigured status stays honest (message names the setup doc)");
ok(ED.cloud.session() === null, "no session without config");
ok(ED.cloud.signInWithGoogle() === false, "sign-in refuses without config");

configure();
st = ED.cloud.status();
ok(st.configured === true && st.signedIn === false && /sign in/i.test(st.message),
  "configured + signed out -> asks for sign-in");

// ---------- 2. OAuth redirect handling ----------
console.log("OAuth redirect:");
var jwt = fakeJwt({ sub: "user-123", email: "teacher@school.ca", exp: 9999999999 });
location.hash = "#access_token=" + jwt + "&refresh_token=refresh-1&expires_in=3600&token_type=bearer";
var r = ED.cloud.handleRedirect();
ok(r.handled === true && r.signedIn === true, "token fragment is recognized and handled");
ok(location.hash === "#/saved", "hash-route conflict resolved: tokens stripped, router lands on Saved");
var sess = ED.cloud.session();
ok(sess && sess.user.email === "teacher@school.ca" && sess.user.id === "user-123",
  "user id + email decoded from the JWT (no extra network call)");
ok(sess.refresh_token === "refresh-1" && sess.expires_at > Math.floor(Date.now() / 1000),
  "refresh token and expiry stored");
st = ED.cloud.status();
ok(st.signedIn === true && st.email === "teacher@school.ca", "status reflects the signed-in account");
ok(ED.cloud.displayName() === "teacher@school.ca", "nav display name is the account email");

// error redirect
clearSession();
location.hash = "#error=access_denied&error_description=OAuth+consent+was+cancelled";
r = ED.cloud.handleRedirect();
ok(r.handled === true && r.signedIn === false && location.hash === "#/login",
  "OAuth error routes to the login page");
ok(/consent was cancelled/i.test(ED.cloud.takeAuthError() || ""), "error message surfaced once");
ok(ED.cloud.takeAuthError() === null, "error message cleared after being read");

// plain app hashes are untouched
location.hash = "#/results";
ok(ED.cloud.handleRedirect().handled === false && location.hash === "#/results",
  "normal app routes pass through untouched");

// ---------- 3. session refresh ----------
console.log("Session refresh:");
var seq = Promise.resolve();

seq = seq.then(function () {
  // fresh session: no network call
  localStorage.setItem("examdetective.session", JSON.stringify({
    access_token: jwt, refresh_token: "refresh-1",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-123", email: "teacher@school.ca" }
  }));
  calls = [];
  mockHttp(function () { throw new Error("must not be called"); });
  return ED.cloud.ensureFreshSession().then(function (s) {
    ok(s && s.access_token === jwt && calls.length === 0, "fresh token used as-is, no refresh call");
  });
});

seq = seq.then(function () {
  // expiring session: refresh endpoint hit with the anon key
  localStorage.setItem("examdetective.session", JSON.stringify({
    access_token: "old", refresh_token: "refresh-1",
    expires_at: Math.floor(Date.now() / 1000) + 10,
    user: { id: "user-123", email: "teacher@school.ca" }
  }));
  calls = [];
  var newJwt = fakeJwt({ sub: "user-123", email: "teacher@school.ca" });
  mockHttp(function (url) {
    if (/auth\/v1\/token\?grant_type=refresh_token/.test(url)) {
      return jsonRes(200, { access_token: newJwt, refresh_token: "refresh-2", expires_in: 3600 });
    }
    return jsonRes(404, {});
  });
  return ED.cloud.ensureFreshSession().then(function (s) {
    ok(calls.length === 1 && calls[0].opts.headers.apikey === "public-anon-key-that-is-long-enough",
      "refresh call carries the anon key");
    ok(s && s.access_token === newJwt && s.refresh_token === "refresh-2", "rotated tokens stored");
  });
});

seq = seq.then(function () {
  // failed refresh: session cleared, resolves null (never a zombie login)
  localStorage.setItem("examdetective.session", JSON.stringify({
    access_token: "old", refresh_token: "dead", expires_at: 1, user: {}
  }));
  mockHttp(function () { return jsonRes(400, { error: "invalid_grant" }); });
  return ED.cloud.ensureFreshSession().then(function (s) {
    ok(s === null && ED.cloud.session() === null, "failed refresh signs the user out cleanly");
  });
});

// ---------- 4. REST calls ----------
function freshSession() {
  localStorage.setItem("examdetective.session", JSON.stringify({
    access_token: jwt, refresh_token: "refresh-1",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-123", email: "teacher@school.ca" }
  }));
}

seq = seq.then(function () {
  console.log("REST calls:");
  freshSession();
  calls = [];
  mockHttp(function (url, opts) {
    if (/rest\/v1\/analyses\?select=/.test(url) && (!opts.method || opts.method === "GET")) {
      return jsonRes(200, [
        { id: "row-1", name: "Final Exam", created_at: "2026-06-30T00:00:00Z", updated_at: "2026-06-30T00:00:00Z", source: "uploaded", summary: { students: 55, questions: 75, flagged: 11 } }
      ]);
    }
    return jsonRes(404, {});
  });
  return ED.cloud.listAnalyses().then(function (res) {
    var c = calls[0];
    ok(res.ok && res.rows.length === 1 && res.rows[0].name === "Final Exam", "list returns account rows");
    ok(c.opts.headers.apikey && /^Bearer /.test(c.opts.headers.Authorization), "list carries anon key + bearer token");
    ok(/order=created_at\.desc/.test(c.url) && /summary:payload->summary/.test(c.url),
      "list is light: summaries only, newest first");
  });
});

seq = seq.then(function () {
  calls = [];
  mockHttp(function (url, opts) {
    if (opts.method === "POST" && /rest\/v1\/analyses$/.test(url)) {
      return jsonRes(201, [{ id: "row-new", name: "Saved one" }]);
    }
    return jsonRes(404, {});
  });
  return ED.cloud.saveAnalysis("Saved one", { active: { source: "uploaded" }, summary: { students: 3 } }).then(function (res) {
    ok(res.ok && res.id === "row-new", "save returns the new row id");
    var body = JSON.parse(calls[0].opts.body);
    ok(body.name === "Saved one" && body.payload && !("user_id" in body),
      "client never sends user_id — the database assigns ownership");
    ok(calls[0].opts.headers.Prefer === "return=representation", "save asks for the created row back");
  });
});

seq = seq.then(function () {
  mockHttp(function (url, opts) {
    if (/id=eq\.row-1/.test(url) && (!opts.method || opts.method === "GET")) {
      return jsonRes(200, [{ id: "row-1", name: "Final Exam", payload: { active: { source: "uploaded", analysis: { examName: "Final" } } } }]);
    }
    return jsonRes(404, {});
  });
  return ED.cloud.getAnalysis("row-1").then(function (res) {
    ok(res.ok && res.entry.active.analysis.examName === "Final", "get returns the stored payload");
    var applied = ED.data.applySavedEntry(res.entry);
    ok(applied.ok && ED.data.activeAnalysis().examName === "Final",
      "a downloaded entry restores the workspace exactly like a local reopen");
  });
});

seq = seq.then(function () {
  calls = [];
  mockHttp(function (url, opts) {
    if (opts.method === "PATCH") return jsonRes(204, null);
    if (opts.method === "DELETE") return jsonRes(204, null);
    return jsonRes(404, {});
  });
  return ED.cloud.renameAnalysis("row-1", "Better name").then(function (res) {
    ok(res.ok && /id=eq\.row-1/.test(calls[0].url), "rename PATCHes the right row");
    return ED.cloud.deleteAnalysis("row-1");
  }).then(function (res) {
    ok(res.ok && calls[1].opts.method === "DELETE" && /id=eq\.row-1/.test(calls[1].url),
      "delete targets the right row (the promised delete path exists)");
  });
});

seq = seq.then(function () {
  // signed out -> REST refuses without a network call
  clearSession();
  calls = [];
  mockHttp(function () { throw new Error("must not be called"); });
  return ED.cloud.listAnalyses().then(function (res) {
    ok(res.ok === false && res.error === "not-signed-in" && calls.length === 0,
      "REST refuses cleanly when signed out");
  });
});

// ---------- 5. migration ----------
seq = seq.then(function () {
  console.log("Migration:");
  freshSession();
  // two local saves, one already migrated (scoped to user-123, the signed-in account)
  localStorage.setItem("examdetective.saved.acct.user-123", JSON.stringify([
    { id: "save-a", name: "Local A", active: { source: "uploaded" }, summary: {} },
    { id: "save-b", name: "Local B", active: { source: "uploaded" }, summary: {}, cloudId: "row-b" }
  ]));
  calls = [];
  mockHttp(function (url, opts) {
    if (opts.method === "POST") return jsonRes(201, [{ id: "row-a" }]);
    return jsonRes(404, {});
  });
  return ED.cloud.migrateLocal().then(function (res) {
    ok(res.ok && res.uploaded === 1, "only the not-yet-migrated save is uploaded");
    ok(calls.length === 1 && JSON.parse(calls[0].opts.body).name === "Local A", "the right entry went up");
    var saved = ED.data.listSaved();
    ok(saved.filter(function (e) { return e.id === "save-a"; })[0].cloudId === "row-a",
      "uploaded save is marked with its cloud id");
    return ED.cloud.migrateLocal();
  }).then(function (res2) {
    ok(res2.uploaded === 0, "re-running migration uploads nothing (no duplicates)");
  });
});

// ---------- 6. sign-out ----------
seq = seq.then(function () {
  console.log("Sign-out:");
  freshSession();
  calls = [];
  mockHttp(function (url) {
    if (/auth\/v1\/logout/.test(url)) return jsonRes(204, null);
    return jsonRes(404, {});
  });
  return ED.cloud.signOut().then(function () {
    ok(ED.cloud.session() === null, "session cleared locally");
    ok(calls.length === 1 && /logout/.test(calls[0].url), "server-side revoke attempted (best effort)");
  });
});

// ---------- 7. views in each state ----------
seq = seq.then(function () {
  console.log("Views:");
  // unconfigured
  deconfigure(); clearSession();
  var loginHtml = ED.views.login();
  ok(loginHtml.indexOf("Not configured") !== -1 && loginHtml.indexOf("disabled") !== -1,
    "login (unconfigured): Google button stays visibly disabled");
  var savedHtml = ED.views.saved();
  ok(savedHtml.indexOf("Cloud sync") !== -1 && savedHtml.indexOf("Not configured") !== -1,
    "saved (unconfigured): honest not-configured card");

  // configured, signed out
  configure();
  loginHtml = ED.views.login();
  ok(loginHtml.indexOf('data-action="cloud-signin"') !== -1 && loginHtml.indexOf("aria-disabled") === -1,
    "login (configured): real Google sign-in button");
  savedHtml = ED.views.saved();
  ok(savedHtml.indexOf('data-action="cloud-signin"') !== -1 && savedHtml.indexOf("Signed out") !== -1,
    "saved (configured, signed out): sign-in prompt");

  // signed in
  freshSession();
  loginHtml = ED.views.login();
  ok(loginHtml.indexOf("teacher@school.ca") !== -1 && loginHtml.indexOf('data-action="cloud-signout"') !== -1,
    "login (signed in): shows the account and a sign-out");
  // one local save that has never been uploaded -> migration offer appears
  // (scoped to user-123, the signed-in account in this block)
  localStorage.setItem("examdetective.saved.acct.user-123", JSON.stringify([
    { id: "save-new", name: "Never uploaded", active: { source: "uploaded" }, summary: {} },
    { id: "save-b", name: "Local B", active: { source: "uploaded" }, summary: {}, cloudId: "row-b" }
  ]));
  savedHtml = ED.views.saved();
  ok(savedHtml.indexOf('id="cloud-list"') !== -1 && savedHtml.indexOf("teacher@school.ca") !== -1,
    "saved (signed in): account list area renders");
  ok(savedHtml.indexOf("cloud-migrate") !== -1 && /Copy 1 local analysis/.test(savedHtml),
    "saved (signed in): migration offer counts un-migrated local saves");
  ok(savedHtml.indexOf("row-level security") !== -1 || savedHtml.indexOf("enforced by the database") !== -1,
    "saved (signed in): states the actual security model");

  // auth error surfaces on the login page once
  localStorage.setItem("examdetective.authError", "OAuth consent was cancelled");
  loginHtml = ED.views.login();
  ok(loginHtml.indexOf("Sign-in problem") !== -1 && loginHtml.indexOf("consent was cancelled") !== -1,
    "login: auth error from the redirect is shown");
  ok(ED.views.login().indexOf("Sign-in problem") === -1, "auth error shows once, then clears");
  deconfigure(); clearSession();
});

// ---------- 8. account isolation of local storage (shared-device fix) ----------
// Direct regression test for the reported bug: on the same browser, signing
// in as a different Google account must NOT show the previous account's
// locally-saved analyses or open results.
seq = seq.then(function () {
  console.log("Account isolation (shared-device fix):");
  configure();

  function sessionFor(uid, email) {
    localStorage.setItem("examdetective.session", JSON.stringify({
      access_token: fakeJwt({ sub: uid, email: email }), refresh_token: "r-" + uid,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uid, email: email }
    }));
  }

  // Teacher A signs in, saves an analysis locally.
  sessionFor("user-A", "teacherA@school.ca");
  ED.data.setActiveUploaded({ source: "uploaded", examName: "A's Exam", sections: [], totalResponses: 1, totalQuestions: 1, flagged: [], uploadedMeta: {} });
  var saveA = ED.data.saveCurrent("Teacher A's analysis");
  ok(saveA.ok, "Teacher A saves an analysis while signed in");
  ok(ED.data.listSaved().length === 1 && ED.data.activeAnalysis().examName === "A's Exam",
    "Teacher A sees their own save and their own open analysis");

  // Teacher B signs in on the SAME browser with a different Google account.
  sessionFor("user-B", "teacherB@school.ca");
  ok(ED.data.listSaved().length === 0, "Teacher B's saved list is EMPTY — cannot see Teacher A's save");
  ok(ED.data.activeAnalysis() === null, "Teacher B has no open analysis — cannot see Teacher A's results");

  // Teacher A signs back in on the same browser: their data is untouched.
  sessionFor("user-A", "teacherA@school.ca");
  ok(ED.data.listSaved().length === 1 && ED.data.listSaved()[0].name === "Teacher A's analysis",
    "Teacher A's save survives the other account's session and is still theirs alone");
  ok(ED.data.activeAnalysis() && ED.data.activeAnalysis().examName === "A's Exam",
    "Teacher A's open analysis is still there too");

  // Fully signed out: back to the bare/anonymous bucket, sees neither account's data.
  clearSession();
  ok(ED.data.listSaved().length === 0, "signed out: anonymous bucket shows neither account's saves");
  deconfigure(); clearSession();
});

// ---------- 9. legacy local data (pre-scoping / previous device user) ----------
seq = seq.then(function () {
  console.log("Legacy local data (claim / discard / not-now):");
  configure();

  function sessionFor(uid, email) {
    localStorage.setItem("examdetective.session", JSON.stringify({
      access_token: fakeJwt({ sub: uid, email: email }), refresh_token: "r-" + uid,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uid, email: email }
    }));
  }

  // Bare-key data from before anyone signed in (or a previous device user).
  localStorage.setItem("examdetective.active", JSON.stringify({ source: "uploaded", analysis: { examName: "Unclaimed" } }));
  localStorage.setItem("examdetective.saved", JSON.stringify([{ id: "s1", name: "Unclaimed save", active: {}, summary: {} }]));

  ok(ED.data.legacyLocalStatus().show === false, "signed out: nothing to reconcile (anonymous IS the bare bucket)");

  sessionFor("user-claim", "claimer@school.ca");
  var st = ED.data.legacyLocalStatus();
  ok(st.show === true && st.hasActive === true && st.savedCount === 1,
    "signing in reveals the unscoped legacy data, with correct counts");

  var claimRes = ED.data.claimLegacyLocal();
  ok(claimRes.ok, "claim succeeds");
  ok(ED.data.legacyLocalStatus().show === false, "after claiming, nothing legacy is left to flag");
  ok(ED.data.listSaved().length === 1 && ED.data.listSaved()[0].name === "Unclaimed save",
    "claimed save now lives in the claiming account's own scoped bucket");
  ok(ED.data.activeAnalysis() && ED.data.activeAnalysis().examName === "Unclaimed",
    "claimed active analysis now lives in the claiming account's own scoped workspace");
  ok(localStorage.getItem("examdetective.saved") === null && localStorage.getItem("examdetective.active") === null,
    "the bare/unscoped keys are cleared after claiming — no longer visible to anyone else");

  // A different, unrelated account must NOT inherit the claimed data.
  sessionFor("user-other", "other@school.ca");
  ok(ED.data.listSaved().length === 0 && ED.data.legacyLocalStatus().show === false,
    "an unrelated account sees neither the claimed data nor a legacy prompt");

  // Discard flow: fresh legacy data, different signed-in account, choose "not mine".
  localStorage.setItem("examdetective.saved", JSON.stringify([{ id: "s2", name: "Not mine", active: {}, summary: {} }]));
  sessionFor("user-discard", "discarder@school.ca");
  ok(ED.data.legacyLocalStatus().show === true, "fresh legacy data is detected for a new account");
  var discardRes = ED.data.discardLegacyLocal();
  ok(discardRes.ok, "discard succeeds");
  ok(ED.data.legacyLocalStatus().show === false && ED.data.listSaved().length === 0,
    "after discarding, the legacy data is gone and was never claimed by this account");

  deconfigure(); clearSession();
});

// ---------- 10. Saved page renders the legacy banner honestly ----------
seq = seq.then(function () {
  console.log("Legacy banner (Saved page):");
  configure();
  localStorage.setItem("examdetective.saved", JSON.stringify([{ id: "s3", name: "Device leftover", active: {}, summary: {} }]));
  localStorage.setItem("examdetective.session", JSON.stringify({
    access_token: fakeJwt({ sub: "user-banner", email: "banner@school.ca" }), refresh_token: "r-banner",
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "user-banner", email: "banner@school.ca" }
  }));
  var html = ED.views.saved();
  ok(html.indexOf("Local data from another session on this device") !== -1, "legacy banner renders when unscoped data exists");
  ok(html.indexOf('data-action="legacy-claim"') !== -1 && html.indexOf('data-action="legacy-discard"') !== -1 &&
     html.indexOf('data-action="legacy-not-now"') !== -1, "banner offers claim, discard, and not-now — never a silent default");
  ED.actions["legacy-claim"]();
  html = ED.views.saved();
  ok(html.indexOf("Local data from another session on this device") === -1, "banner disappears once claimed");
  ok(html.indexOf("Device leftover") !== -1, "the claimed save now appears in this account's own saved list");
  deconfigure(); clearSession();
});

seq.then(function () {
  if (failures.length) {
    console.error("\nFAILURES:");
    failures.forEach(function (f) { console.error("  ✗ " + f); });
    process.exit(1);
  }
  console.log("\nAll " + passed + " cloud-sync tests passed.");
}).catch(function (e) { console.error("Test run crashed:", e); process.exit(1); });
