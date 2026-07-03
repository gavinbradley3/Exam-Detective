# Auth & Storage Plan

Last updated: 2026-07-02

## Where things stand today

**The app-side sync layer is BUILT** (js/cloud.js — hand-rolled Supabase
GoTrue + PostgREST client, zero dependencies, covered by
`node scripts/cloud-test.js`). It activates the moment a deployment
provides its own `js/config.js`; until then every page says honestly that
cloud sync is not configured.

- **Login**: with config present, the Sign in page has a real
  "Sign in with Google" button (Supabase OAuth, implicit flow; tokens are
  intercepted before the hash router runs). Without config, the button is
  visibly disabled — nothing pretends.
- **Saves**: local `localStorage` saves keep working exactly as before,
  signed in or not. Signed in, the Saved page adds the account list
  (list/save/reopen/rename/delete) plus a one-time "copy local analyses to
  your account" migration that never duplicates.
- **Ownership**: the client never sends `user_id`; the database assigns it
  from `auth.uid()` and row-level security restricts every operation to
  the owner's rows (scripts/supabase-setup.sql).

## Recommended path: Supabase Auth (Google OAuth) + Postgres

One provider covers both needs — authentication and a database — with a
generous free tier and no server for us to run.

Why Supabase over Firebase here: SQL tables map cleanly onto our data shapes
(`analyses` rows holding the JSON the app already produces), row-level
security makes "teachers see only their own analyses" a one-line policy, and
the JS client works from a static site without a build step.
Firebase Auth + Firestore is a fine alternative if the school district
already lives in Google Cloud.

### What gets stored (and what doesn't)

Store per user:
- settings (subject/grade/export defaults)
- saved analyses: the same JSON the app saves locally today —
  parsed section aggregates, the answer key, results metadata, flags
- NO raw uploaded files in v1, and **no student names** — the CSV parser
  already counts students without keeping names; keep it that way

### Setup steps (when you're ready)

1. Create a project at supabase.com → note the project URL and anon key.
2. In Google Cloud Console: create an OAuth client ID (web), configure the
   consent screen, add the Supabase callback URL
   (`https://<project>.supabase.co/auth/v1/callback`).
3. In Supabase → Authentication → Providers → Google: paste the Google
   client ID + secret.
4. Create the table — run `scripts/supabase-setup.sql` in the Supabase
   SQL editor (it is the statement below plus an index and a
   delete-cascade, and is safe to re-run):
   ```sql
   create table analyses (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users not null default auth.uid(),
     name text not null,
     payload jsonb not null,        -- the saved-analysis JSON
     created_at timestamptz default now()
   );
   alter table analyses enable row level security;
   create policy "own rows" on analyses
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
5. ~~Client wiring~~ — DONE (js/cloud.js, js/views/login.js,
   js/views/saved.js). No Supabase JS SDK needed: the client talks to
   GoTrue/PostgREST directly with fetch.
6. Copy `js/config.example.js` to `js/config.js` and paste your project
   URL + anon key. That's the on-switch.

### Required environment/config values

Static sites can't hide secrets, and with Supabase they don't need to:

- `SUPABASE_URL` — public, safe to ship in the page
- `SUPABASE_ANON_KEY` — public *by design*; security comes from row-level
  security policies, not from hiding this key
- Google OAuth **client secret** — lives only in the Supabase dashboard,
  **never** in this repo

If a build step is ever added, put the two public values in a `.env` file
(already gitignored) and inject at build time; until then a small
`js/config.js` with the two public values is acceptable.

### Security notes

- Never commit the Google client secret (it never needs to be in this repo).
- Keep row-level security ON before storing anything real.
- Add a delete-account/delete-analysis path on day one — this app's own
  responsible-use notice promises deletion.
- Exam keys and class aggregates are sensitive school material: confirm the
  district allows cloud storage of it before enabling sync, and name the
  region you picked for the Supabase project.

### What still needs to be built in the app

- ~~`js/cloud.js`~~ — DONE (list/save/get/rename/delete + auth + refresh)
- ~~Login state in the nav~~ — DONE (account email wins over local profile)
- ~~Migration prompt~~ — DONE ("Copy N local analyses to account", marks
  each local save with its cloud row id so re-running never duplicates)
- ~~Local storage scoped per signed-in account~~ — DONE (js/data-store.js).
  Fixed a real privacy gap found on the live site: on a shared/school
  computer, `localStorage` has no concept of "signed in as" on its own, so
  a second Google account signing in on the same browser could see the
  first account's locally-saved analyses and open results. Local storage
  keys are now suffixed with the signed-in account's id
  (`examdetective.saved.acct.<uid>`), so switching accounts on the same
  device isolates local data the same way cloud rows are isolated by RLS.
  Signed out (or cloud not configured), storage is unchanged — the single
  shared bare-key workspace exactly as before. Pre-existing unscoped data
  is never silently claimed or silently hidden: the Saved page shows a
  banner ("This is mine — move it into my account" / "Not mine — delete
  it" / "Not now") whenever signed-in and unscoped data is sitting on the
  device.
- Conflict handling is last-write-wins by design in v1 (saves are
  append-only rows, so conflicts are effectively new rows).
- ~~Scoping the IN-PROGRESS wizard state by account~~ — DONE. Mid-upload
  files and answer keys in the New Analysis wizard are stored under the
  same per-account key scheme as saves, so an abandoned half-finished
  analysis on a shared computer is invisible to the next account. The
  legacy-data banner covers unscoped wizard leftovers too (claim /
  delete / not now), and an untouched empty wizard is never flagged as
  someone's data.
- Not built yet (deliberately): sharing analyses between accounts,
  archive/duplicate for cloud rows (local-only for now), realtime sync.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` deploys the app to GitHub Pages and
GENERATES `js/config.js` into the site at deploy time from two repository
variables — `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (Settings →
Secrets and variables → Actions → Variables). The file stays gitignored
and uncommitted; the values are public-by-design and ship to every
browser, with all protection coming from row-level security. The workflow
refuses to deploy a secret key (`sb_secret_` / `service_role`), stages
ONLY index.html + css/ + js/ (never `scripts/fixtures/real/`, which holds
real exam material), runs all seven test suites first, and verifies the
generated config is accepted by cloud.js before publishing. Without the
variables, the site deploys and honestly reports cloud sync as not
configured. Note: Pages is static hosting — AI Deep Review needs
`server.js` and honestly reports itself unavailable on the Pages site.

## Turning it on (the owner's 3 steps)

1. Run `scripts/supabase-setup.sql` once in the Supabase SQL editor.
2. In Google Cloud + Supabase dashboards, finish the OAuth provider steps
   above (client ID/secret pasted into Supabase — never into this repo).
3. Copy `js/config.example.js` to `js/config.js`, paste the project URL +
   anon key, and serve the site. The Sign in and Saved pages light up on
   their own; everything is verified by `node scripts/cloud-test.js`
   (mocked) and the manual checklist's cloud section (live).
