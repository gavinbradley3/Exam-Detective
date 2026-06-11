/* Sign-in page — honest about what exists today.
   This app is static (no backend), so there is NO real Google login
   yet. What works now: a local profile + analyses saved in this
   browser. The real path to Google login is documented in
   AUTH_AND_STORAGE_PLAN.md. Do not make this page pretend otherwise. */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  ED.views.login = function () {
    var esc = ED.analysis.esc;
    var profile = ED.data.getProfile();

    if (profile) {
      return (
        '<div class="page"><div class="container narrow">' +
          '<div class="page-head"><div class="eyebrow">Account</div><h1>Hi, ' + esc(profile.name) + '</h1></div>' +
          '<div class="card">' +
            '<h2>Local profile</h2>' +
            '<p>You’re using a <b>local profile stored in this browser</b> — not a cloud account. Your saved analyses and settings live on this device only and won’t follow you to another computer.</p>' +
            '<div class="btn-row mt-16">' +
              '<a class="btn btn-primary" href="#/saved">Open Saved Analyses</a>' +
              '<button class="btn btn-outline" data-action="login-signout">Remove local profile</button>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<h2>Google sign-in — not connected yet</h2>' +
            '<p>Real Google login needs an authentication provider and a small backend, which this build doesn’t have. The recommended setup (Supabase Auth + Google OAuth) is written up in <b>AUTH_AND_STORAGE_PLAN.md</b> in the project folder, including exactly what’s required to make it real.</p>' +
          '</div>' +
        '</div></div>'
      );
    }

    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head"><div class="eyebrow">Sign in</div><h1>Sign in</h1>' +
          '<p class="lede">Keep your analyses and settings together under a name.</p></div>' +

        '<div class="card">' +
          '<h2>Use a local profile <span class="src-chip-inline uploaded" style="vertical-align:middle;">Works now</span></h2>' +
          '<p class="mb-16">Stored in <b>this browser only</b> — like a bookmark, not a cloud account. Your saved analyses stay on this device.</p>' +
          '<div class="field"><label for="login-name">Your name</label>' +
            '<input type="text" id="login-name" placeholder="e.g. G. Bradley" autocomplete="name">' +
            '<p class="field-error" id="login-error" hidden></p></div>' +
          '<button class="btn btn-primary" data-action="login-local">Create local profile</button>' +
        '</div>' +

        '<div class="card google-card">' +
          '<h2>Sign in with Google <span class="src-chip-inline demo" style="vertical-align:middle;">Not connected</span></h2>' +
          '<p class="mb-16">This button is intentionally disabled. Wiring it up requires a real authentication provider (client ID, OAuth consent screen, and a place to store your data). We won’t pretend it works before it does.</p>' +
          '<button class="btn btn-outline google-btn" disabled aria-disabled="true" title="Google sign-in requires a backend provider — see AUTH_AND_STORAGE_PLAN.md">' +
            '<span class="g-logo" aria-hidden="true">G</span> Sign in with Google — coming after provider setup' +
          '</button>' +
          '<p class="small muted mt-8">The full setup path (Supabase Auth + Google OAuth, environment variables, security notes) is documented in <b>AUTH_AND_STORAGE_PLAN.md</b>.</p>' +
        '</div>' +
      '</div></div>'
    );
  };

  ED.actions["login-local"] = function () {
    var input = document.getElementById("login-name");
    var err = document.getElementById("login-error");
    var name = input ? input.value.trim() : "";
    if (!name) {
      if (err) { err.textContent = "Enter a name first — anything you’ll recognize."; err.hidden = false; }
      return;
    }
    ED.data.setProfile(name);
    location.hash = "#/saved";
  };

  ED.actions["login-signout"] = function () {
    ED.data.clearProfile();
    ED.app.rerender();
  };
})();
