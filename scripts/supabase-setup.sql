-- Exam Detective — Supabase one-time setup
-- Paste this whole file into the Supabase dashboard → SQL Editor → Run.
-- Safe to re-run (idempotent).
--
-- What it creates:
--   analyses  — one row per saved analysis, owned by the signed-in teacher.
--               payload holds the same JSON the app saves locally
--               (aggregates, flags, answer key — never student names).
--   Row Level Security: teachers can see/edit/delete ONLY their own rows.
--   The client never sends user_id — the database fills it from auth.uid(),
--   so ownership can't be spoofed from the browser.

create table if not exists public.analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  name        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.analyses enable row level security;

drop policy if exists "own rows" on public.analyses;
create policy "own rows" on public.analyses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- List queries order by created_at per user.
create index if not exists analyses_user_created
  on public.analyses (user_id, created_at desc);

-- Deleting a Supabase auth user removes their analyses with them
-- (the app's responsible-use notice promises deletion).
-- The `references auth.users` above enforces integrity; add the cascade:
alter table public.analyses
  drop constraint if exists analyses_user_id_fkey,
  add constraint analyses_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
