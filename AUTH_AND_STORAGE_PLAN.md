# Auth & Storage Plan

Last updated: 2026-06-11

## Where things stand today (be honest with yourself when reading this)

Exam Detective is a **static site** — HTML, CSS, and JavaScript with no backend,
no server, and no API keys. That means:

- **There is no real login.** The "Sign in" page offers a *local profile*
  (a name stored in this browser) and shows a deliberately disabled Google
  button labeled "not connected". Nothing pretends otherwise.
- **Saved analyses live in `localStorage`** — this browser, this device.
  Clearing browser data deletes them. The Saved page provides JSON
  export/import as the safety net.
- Real Google login + cloud saving **cannot be made real from inside this
  repo alone**: it requires creating accounts/keys with an external provider
  (Google Cloud OAuth consent screen + an auth/database service), which only
  the project owner can do.

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
4. Create the table:
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
5. Add the Supabase JS client to `index.html` and a small `js/cloud.js`
   that mirrors the `ED.data` save/list/reopen API (so views don't change).
6. Swap the disabled Google button in `js/views/login.js` for
   `supabase.auth.signInWithOAuth({ provider: "google" })`.

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

- `js/cloud.js` (Supabase client wrapper mirroring `ED.data`)
- Login state in the nav driven by the Supabase session instead of the
  local profile
- A migration prompt: "You have 3 analyses saved in this browser — move
  them to your account?"
- Offline/conflict handling can stay simple: last write wins in v1.

## Why this isn't already done

Doing it without real provider credentials would mean shipping a fake login
flow — exactly what this project refuses to do. The moment you create the
Supabase + Google OAuth accounts and share the two public config values,
the wiring above is a small, well-defined task.
