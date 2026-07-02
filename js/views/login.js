/* Sign-in page — states exactly what exists in this deployment.
   With Supabase configured (js/config.js): real Google sign-in via
   Supabase Auth; the session powers cloud saves on the Saved page.
   Without it: a local profile only, and the Google button stays
   disabled — this page never pretends. Setup: AUTH_AND_STORAGE_PLAN.md */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  function localProfileCard(profile) {
    var esc = ED.analysis.esc;
    if (profile) {
      return (
        '<div class="card">' +
          '<h2>Local profile: ' + esc(profile.name) + '</h2>' +
          '<p>A <b>local profile stored in this browser</b> — separate from any cloud account. Local saves stay on this device.</p>' +
          '<div class="btn-row mt-16">' +
            '<a class="btn btn-outline" href="#/saved">Open Saved Analyses</a>' +
            '<button class="btn btn-outline" data-action="login-signout">Remove local profile</button>' +
          '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="card">' +
        '<h2>Use a local profile <span class="src-chip-inline uploaded" style="vertical-align:middle;">Works offline</span></h2>' +
        '<p class="mb-16">Stored in <b>this browser only</b> — like a bookmark, not a cloud account. Your local saves stay on this device.</p>' +
        '<div class="field"><label for="login-name">Your name</label>' +
          '<input type="text" id="login-name" placeholder="e.g. G. Bradley" autocomplete="name">' +
          '<p class="field-error" id="login-error" hidden></p></div>' +
        '<button class="btn btn-primary" data-action="login-local">Create local profile</button>' +
      '</div>'
    );
  }

  ED.views.login = function () {
    var esc = ED.analysis.esc;
    var profile = ED.data.getProfile();
    var cloud = ED.cloud.status();
    var authError = ED.cloud.takeAuthError();

    var head =
      '<div class="page-head"><div class="eyebrow">Account</div><h1>Sign in</h1>' +
        '<p class="lede">Keep your analyses together — on this device, or in your account from any device.</p></div>';

    var errorNotice = authError
      ? '<div class="notice alert"><span class="notice-title">Sign-in problem</span>' + esc(authError) + '</div>'
      : "";

    var googleCard;
    if (cloud.configured && cloud.signedIn) {
      googleCard =
        '<div class="card">' +
          '<h2>Google account <span class="src-chip-inline uploaded" style="vertical-align:middle;">Signed in</span></h2>' +
          '<p class="mb-16">Signed in as <b>' + esc(cloud.email || "your Google account") + '</b>. ' +
            'Analyses saved to your account are available from any device you sign in on. Manage them on the Saved page.</p>' +
          '<div class="btn-row">' +
            '<a class="btn btn-primary" href="#/saved">Open Saved Analyses</a>' +
            '<button class="btn btn-outline" data-action="cloud-signout">Sign out</button>' +
          '</div>' +
        '</div>';
    } else if (cloud.configured) {
      googleCard =
        '<div class="card google-card">' +
          '<h2>Sign in with Google <span class="src-chip-inline uploaded" style="vertical-align:middle;">Available</span></h2>' +
          '<p class="mb-16">Signs in through this deployment’s Supabase project. Your saved analyses become available from any device; ' +
            'only you can see your rows (enforced by the database, not the browser).</p>' +
          '<button class="btn btn-outline google-btn" data-action="cloud-signin">' +
            '<span class="g-logo" aria-hidden="true">G</span> Sign in with Google' +
          '</button>' +
        '</div>';
    } else {
      googleCard =
        '<div class="card google-card">' +
          '<h2>Sign in with Google <span class="src-chip-inline demo" style="vertical-align:middle;">Not configured</span></h2>' +
          '<p class="mb-16">This deployment has no cloud configuration yet (js/config.js), so the button stays disabled — we won’t pretend it works before it does. ' +
            'The full setup path is documented in <b>AUTH_AND_STORAGE_PLAN.md</b>.</p>' +
          '<button class="btn btn-outline google-btn" disabled aria-disabled="true" title="Requires js/config.js — see AUTH_AND_STORAGE_PLAN.md">' +
            '<span class="g-logo" aria-hidden="true">G</span> Sign in with Google — after setup' +
          '</button>' +
        '</div>';
    }

    return (
      '<div class="page"><div class="container narrow">' +
        head + errorNotice + googleCard + localProfileCard(profile) +
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

  ED.actions["cloud-signin"] = function () {
    ED.cloud.signInWithGoogle();
  };

  ED.actions["cloud-signout"] = function () {
    ED.cloud.signOut().then(function () { ED.app.rerender(); });
  };
})();
