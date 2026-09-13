-- Run in the Supabase SQL editor.
--
-- Backs a unified grading engine: one correct grade-writing path (fixes a
-- bug where grades entered through the gradebook UI never reached the
-- transcripts table), and course grade calculation that blends
-- assignments, quizzes, and (optionally) attendance.
--
-- All additive/idempotent — safe to re-run, safe if some columns already
-- exist on your instance from earlier ad-hoc changes.

alter table public.submissions add column if not exists feedback text;
alter table public.submissions add column if not exists graded_at timestamptz;
alter table public.submissions add column if not exists graded_by uuid references public.profiles(id) on delete set null;
alter table public.submissions add column if not exists submitted_at timestamptz default now();

-- How much weight (0-100) a course's attendance rate carries in a
-- student's overall course grade. 0 (the default) means attendance
-- doesn't affect the grade at all — existing courses are unaffected
-- until a teacher/admin explicitly sets this.
alter table public.courses add column if not exists attendance_weight_percent numeric not null default 0
  check (attendance_weight_percent >= 0 and attendance_weight_percent <= 100);

-- Server-verified watch progress for video-type assignments — the
-- player pings this periodically. require_full_watch assignments are
-- auto-graded to full points once a student's progress here crosses the
-- completion threshold, instead of trusting the client's local state
-- (which nothing previously verified server-side).
create table if not exists public.video_watch_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  max_watched_seconds numeric not null default 0,
  duration_seconds numeric,
  watched_percent numeric not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

alter table public.video_watch_progress enable row level security;
drop policy if exists "video_watch_progress_all" on public.video_watch_progress;
create policy "video_watch_progress_all" on public.video_watch_progress for all using (true) with check (true);

create index if not exists video_watch_progress_assignment_idx on public.video_watch_progress (assignment_id);
create index if not exists video_watch_progress_student_idx on public.video_watch_progress (student_id);
