/* ============================================================
   Exam Detective — router & event wiring
   Hash-based navigation: #/dashboard, #/new-analysis/3, etc.
   Views are plain functions on ED.views that return HTML;
   interactive elements use data-action / data-change attributes
   handled by the delegated listeners below (ED.actions).
   ============================================================ */

window.ED = window.ED || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  // route prefix -> [view function name, nav highlight key]
  var ROUTES = {
    "": ["landing", null],
    "dashboard": ["dashboard", "dashboard"],
    "new-analysis": ["wizard", "new-analysis"],
    "results": ["results", "dashboard"],
    "comparison": ["comparison", "comparison"],
    "reports": ["reports", "reports"],
    "saved": ["saved", "saved"],
    "login": ["login", "login"],
    "help": ["help", "help"],
    "settings": ["settings", "settings"]
  };

  function parseHash() {
    // "#/new-analysis/3" -> { route: "new-analysis", param: "3" }
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var parts = h.split("/");
    return { route: parts[0] || "", param: parts.slice(1).join("/") };
  }

  function setActiveNav(key) {
    document.querySelectorAll(".mainnav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === key);
    });
  }

  function render() {
    var app = document.getElementById("app");
    var info = parseHash();
    var entry = ROUTES[info.route];
    if (!entry) {
      // In-page anchors like #q36 (Results "View details") or #help-files
      // (Help contents) land here on hashchange. If the element exists on
      // the current page, scroll to it — do NOT re-route to the homepage.
      var anchorId = (location.hash || "").replace(/^#\/?/, "");
      var target = anchorId && document.getElementById(anchorId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (target.tabIndex < 0) target.tabIndex = -1; // focusable for a11y
        target.focus({ preventScroll: true });
        return;
      }
      entry = ROUTES[""];
    }
    var viewFn = ED.views[entry[0]];
    var html = viewFn ? viewFn(info.param) : "";
    if (html === "") return; // view redirected (e.g. wizard step 7)
    app.innerHTML = html;
    setActiveNav(entry[1]);
    // Reflect the local profile in the nav (local storage, not real auth).
    var signin = document.getElementById("nav-signin");
    if (signin && window.ED.data) {
      var p = ED.data.getProfile();
      signin.textContent = p ? p.name : "Sign in";
    }
    // New page: move focus + scroll to top (or to an in-page anchor).
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
    document.title = "Exam Detective" + (entry[1] ? " — " + entry[0].charAt(0).toUpperCase() + entry[0].slice(1) : "");
  }

  // Re-render the current view in place (used after state changes).
  function rerender() { render(); }

  ED.app = { render: render, rerender: rerender };

  // Delegated click handler for [data-action] buttons.
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-action]");
    if (!el) return;
    var fn = ED.actions[el.getAttribute("data-action")];
    if (fn) { ev.preventDefault(); fn(el, ev); }
  });

  // Delegated change handler for [data-change] inputs/selects.
  document.addEventListener("change", function (ev) {
    var el = ev.target.closest("[data-change]");
    if (!el) return;
    var fn = ED.actions[el.getAttribute("data-change")];
    if (fn) fn(el, ev);
  });

  window.addEventListener("hashchange", render);
  render();
})();
