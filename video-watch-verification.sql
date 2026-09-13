-- Run in the Supabase SQL editor.
--
-- Defensive follow-up to grading-engine.sql's video_watch_progress table
-- for server-side video-watch verification (POST
-- /assignments/:id/watch-progress in artifacts/api-server). Additive/
-- idempotent only — safe to re-run, and a no-op if grading-engine.sql's
-- version of this table is already exactly as below.

create table if not exists public.video_watch_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  max_watched_seconds numeric not null default 0,
  duration_seconds numeric,
  watched_percent numeric not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.video_watch_progress add column if not exists max_watched_seconds numeric not null default 0;
alter table public.video_watch_progress add column if not exists duration_seconds numeric;
alter table public.video_watch_progress add column if not exists watched_percent numeric not null default 0;
alter table public.video_watch_progress add column if not exists completed boolean not null default false;
alter table public.video_watch_progress add column if not exists updated_at timestamptz not null default now();

-- Enforce the (assignment_id, student_id) upsert key the watch-progress
-- route relies on, if it isn't already there.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'video_watch_progress_assignment_id_student_id_key'
  ) then
    alter table public.video_watch_progress
      add constraint video_watch_progress_assignment_id_student_id_key
      unique (assignment_id, student_id);
  end if;
end $$;

alter table public.video_watch_progress enable row level security;
drop policy if exists "video_watch_progress_all" on public.video_watch_progress;
create policy "video_watch_progress_all" on public.video_watch_progress for all using (true) with check (true);

create index if not exists video_watch_progress_assignment_idx on public.video_watch_progress (assignment_id);
create index if not exists video_watch_progress_student_idx on public.video_watch_progress (student_id);
