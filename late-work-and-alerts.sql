-- Run in the Supabase SQL editor.
--
-- Late-work rules, per-student extensions, and at-risk alert thresholds.
--
--   1. assignments: per-assignment late policy (accept late work?, penalty
--      % per day late, maximum penalty %, optional hard cutoff after which
--      submissions are refused).
--   2. submissions: whether the hand-in was late and by how much, plus the
--      teacher's raw (pre-penalty) score and the penalty % applied. The
--      existing `grade` column keeps holding the score that counts (after
--      any penalty), so the gradebook, transcripts and course-grade maths
--      stay consistent without changes.
--   3. assignment_extensions: a teacher-granted new due date for one
--      student on one assignment, optionally waiving the late penalty.
--   4. school_risk_settings: per-school thresholds for the "At-risk
--      students" view (defaults 70% grade, 80% attendance, 2 missing/late
--      in 14 days, 14 days without login).
--
-- Idempotent: safe to re-run. New tables have RLS enabled with NO
-- policies on purpose: only the API's service-role client (which bypasses
-- RLS) reads or writes them, so the public anon key gets no access.

-- 1. Late policy on assignments ----------------------------------------------

alter table public.assignments
  add column if not exists allow_late_submissions boolean not null default true;

alter table public.assignments
  add column if not exists late_penalty_per_day numeric not null default 0
  check (late_penalty_per_day >= 0 and late_penalty_per_day <= 100);

alter table public.assignments
  add column if not exists late_penalty_max numeric not null default 100
  check (late_penalty_max >= 0 and late_penalty_max <= 100);

alter table public.assignments
  add column if not exists late_cutoff_at timestamptz;

-- 2. Lateness + penalty on submissions -----------------------------------------

alter table public.submissions
  add column if not exists submitted_late boolean not null default false;

alter table public.submissions
  add column if not exists minutes_late integer not null default 0;

alter table public.submissions
  add column if not exists raw_grade numeric;

alter table public.submissions
  add column if not exists late_penalty_percent numeric not null default 0;

-- 3. Per-student extensions ----------------------------------------------------

create table if not exists public.assignment_extensions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  extended_due_at timestamptz not null,
  waive_penalty boolean not null default false,
  reason text,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

alter table public.assignment_extensions enable row level security;

create index if not exists assignment_extensions_student_idx on public.assignment_extensions (student_id);

-- 4. At-risk thresholds per school ---------------------------------------------

create table if not exists public.school_risk_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  min_grade_percent numeric not null default 70
    check (min_grade_percent >= 0 and min_grade_percent <= 100),
  min_attendance_percent numeric not null default 80
    check (min_attendance_percent >= 0 and min_attendance_percent <= 100),
  max_missing_or_late integer not null default 2
    check (max_missing_or_late >= 1),
  inactive_days integer not null default 14
    check (inactive_days >= 1),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.school_risk_settings enable row level security;

-- The at-risk view looks up each student's most recent login event.
create index if not exists platform_audit_log_action_performed_by_idx
  on public.platform_audit_log (action, performed_by, created_at desc);
