-- Run in the Supabase SQL editor.
--
-- Same class of bug as schools-deleted-at.sql: a batch of columns that the
-- API server reads and writes on every request for these features, but that
-- were never actually migrated. Each one made the whole feature fail — either
-- a hard 500/400 from PostgREST ("column does not exist") or, where the code
-- ignores the error object, a silently empty/blank result.
--
-- Everything here is additive and idempotent — safe to re-run.

-- ─── Assignments: the assignment-type / video-assignment feature ──────────────
-- routes/assignments.ts creates every assignment with these columns and the
-- video-watch-progress endpoint selects assignment_type + require_full_watch.
-- Without them, assignment creation failed outright for every school.
alter table public.assignments add column if not exists assignment_type text not null default 'standard'
  check (assignment_type in ('standard', 'video', 'file', 'quiz'));
alter table public.assignments add column if not exists instructions text;
alter table public.assignments add column if not exists file_url text;
alter table public.assignments add column if not exists video_url text;
alter table public.assignments add column if not exists require_full_watch boolean not null default false;

-- ─── Attendance: student self check-in ───────────────────────────────────────
-- routes/attendance.ts POST /attendance/checkin upserts these and then selects
-- checked_in_at back; self check-in 500'd every time.
alter table public.attendance add column if not exists checked_in_at timestamptz;
alter table public.attendance add column if not exists checkin_method text
  check (checkin_method in ('self', 'teacher', 'auto'));

-- ─── Courses: live-class scheduling (gates self check-in) ────────────────────
-- The check-in route selects courses.is_live/class_date; the missing columns
-- made every check-in attempt return "Course not found".
alter table public.courses add column if not exists is_live boolean not null default false;
alter table public.courses add column if not exists class_date date;

alter table public.courses add column if not exists class_end_time text;

-- ─── Schools: admin toggles that could never be saved ────────────────────────
-- PATCH /schools/:id writes applications_open and assignment_routing, and
-- mapSchool() reads both back on every public school page. Neither column
-- existed, so saving either setting 500'd and the public page always reported
-- applications as closed.
alter table public.schools add column if not exists applications_open boolean not null default false;
alter table public.schools add column if not exists assignment_routing jsonb;

-- ─── role_permissions: feature-flag model the whole codebase actually uses ───
-- The original table is keyed on (role, permission, granted); every route and
-- the per-school feature-flag middleware use (role, feature, is_enabled).
-- Result: the permissions API 500'd and no per-school feature flag could be
-- read or written.
alter table public.role_permissions add column if not exists feature text;
alter table public.role_permissions add column if not exists is_enabled boolean not null default true;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='role_permissions' and column_name='permission') then
    execute 'alter table public.role_permissions alter column permission drop not null';
    execute 'update public.role_permissions set feature = permission where feature is null';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='role_permissions' and column_name='granted') then
    execute 'update public.role_permissions set is_enabled = coalesce(granted, true)';
  end if;
end $$;
create unique index if not exists role_permissions_school_role_feature_idx
  on public.role_permissions (school_id, role, feature);

-- ─── video_sessions: active-session lookup ───────────────────────────────────
-- routes/video.ts filtered on a `status` column that does not exist, so the
-- "join live class" lookup errored and no student could ever join.
alter table public.video_sessions add column if not exists is_active boolean not null default true;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='video_sessions'
               and column_name='title' and is_nullable='NO') then
    execute 'alter table public.video_sessions alter column title drop not null';
  end if;
end $$;
create index if not exists video_sessions_course_active_idx
  on public.video_sessions (course_id, is_active);

-- ─── student_applications: updated_at ────────────────────────────────────────
-- Selected by the student's own-applications list, which 500'd without it.
alter table public.student_applications add column if not exists updated_at timestamptz not null default now();

-- ─── Quizzes: the quiz engine's real column model ────────────────────────────
-- quizzes.ts writes attempt_limit / release_scores_immediately, stores each
-- question self-contained (type/question/options/correct_answer/order_index)
-- rather than in quiz_question_options, and records per-attempt answers and
-- point totals. None of those columns existed, so creating a quiz, adding a
-- question, and submitting an attempt all failed.
alter table public.quizzes add column if not exists attempt_limit int;
alter table public.quizzes add column if not exists release_scores_immediately boolean not null default true;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='quizzes' and column_name='max_attempts') then
    execute 'update public.quizzes set attempt_limit = max_attempts where attempt_limit is null';
  end if;
end $$;

alter table public.quiz_questions add column if not exists type text;
alter table public.quiz_questions add column if not exists question text;
alter table public.quiz_questions add column if not exists options jsonb;
alter table public.quiz_questions add column if not exists correct_answer jsonb;
alter table public.quiz_questions add column if not exists order_index int not null default 0;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='quiz_questions' and column_name='question_text') then
    execute 'alter table public.quiz_questions alter column question_text drop not null';
    execute 'update public.quiz_questions set question = question_text where question is null';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='quiz_questions' and column_name='question_type') then
    execute 'alter table public.quiz_questions alter column question_type drop not null';
    execute 'update public.quiz_questions set type = question_type where type is null';
  end if;
end $$;

alter table public.quiz_attempts add column if not exists status text not null default 'in_progress'
  check (status in ('in_progress', 'submitted', 'graded'));
alter table public.quiz_attempts add column if not exists earned_points numeric;
alter table public.quiz_attempts add column if not exists total_points numeric;
alter table public.quiz_attempts add column if not exists answers jsonb;
alter table public.quiz_attempts add column if not exists graded_answers jsonb;
create index if not exists quiz_attempts_quiz_student_idx
  on public.quiz_attempts (quiz_id, student_id);
