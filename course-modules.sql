-- Run in the Supabase SQL editor.
--
-- Course modules & lessons, prerequisites and per-student progress.
--
--   course_modules       ordered modules inside a course; optional
--                        prerequisite (the previous module, or a chosen one)
--   course_lessons       lesson content (text body, optional video URL,
--                        optional file attachments in the course-resources
--                        bucket under courses/<course id>/...)
--   course_module_items  the ordered contents of a module: a lesson, or a
--                        link to an existing assignment or quiz. An item can
--                        be "sequential" (previous item must be done first).
--   lesson_completions   a student's "Mark complete" (or auto-complete after
--                        watching a required video) on a lesson.
--
-- Assignment / quiz completion is derived from submissions / quiz_attempts,
-- so it needs no table here.
--
-- RLS is enabled with NO policies: only the API (service-role client, which
-- bypasses RLS) reads or writes these tables. A permissive policy would let
-- anyone holding the public anon key reach them directly over REST.
-- Idempotent: safe to run more than once.

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  is_published boolean not null default false,
  prerequisite_mode text not null default 'none'
    check (prerequisite_mode in ('none', 'previous', 'module')),
  prerequisite_module_id uuid references public.course_modules(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null references public.course_modules(id) on delete cascade,
  title text not null,
  body text,
  video_url text,
  require_video_watch boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_module_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null references public.course_modules(id) on delete cascade,
  item_type text not null check (item_type in ('lesson', 'assignment', 'quiz')),
  lesson_id uuid references public.course_lessons(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  position int not null default 0,
  is_sequential boolean not null default false,
  created_at timestamptz not null default now(),
  constraint course_module_items_target_check check (
    (item_type = 'lesson' and lesson_id is not null and assignment_id is null and quiz_id is null)
    or (item_type = 'assignment' and assignment_id is not null and lesson_id is null and quiz_id is null)
    or (item_type = 'quiz' and quiz_id is not null and lesson_id is null and assignment_id is null)
  )
);

create table if not exists public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'video')),
  completed_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_module_items enable row level security;
alter table public.lesson_completions enable row level security;

create index if not exists course_modules_course_idx on public.course_modules (course_id, position);
create index if not exists course_modules_prereq_idx on public.course_modules (prerequisite_module_id);
create index if not exists course_lessons_course_idx on public.course_lessons (course_id);
create index if not exists course_lessons_module_idx on public.course_lessons (module_id);
create index if not exists course_module_items_module_idx on public.course_module_items (module_id, position);
create index if not exists course_module_items_course_idx on public.course_module_items (course_id);
create index if not exists course_module_items_lesson_idx on public.course_module_items (lesson_id);
create index if not exists course_module_items_assignment_idx on public.course_module_items (assignment_id);
create index if not exists course_module_items_quiz_idx on public.course_module_items (quiz_id);
create index if not exists lesson_completions_student_course_idx on public.lesson_completions (student_id, course_id);
create index if not exists lesson_completions_course_idx on public.lesson_completions (course_id);
