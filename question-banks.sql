-- Run in the Supabase SQL editor.
--
-- Question banks: reusable pools of quiz questions, per course or shared
-- across a school (course_id null).
--
--   question_banks           the bank itself
--   question_bank_questions  questions, stored in the same shape the quiz
--                            builder writes to quiz_questions (question /
--                            type / options [{id,text,is_correct}] /
--                            correct_answer / points), plus free-form tags
--   quiz_bank_draws          "random draw" rules on a quiz: draw N questions
--                            from a bank (optionally only those with a tag),
--                            fresh for every attempt
--   quiz_attempts.drawn_question_ids
--                            the bank question ids drawn for that attempt,
--                            chosen server-side when the attempt starts, so
--                            grading uses exactly the questions the student saw
--
-- "Add from bank" copies the chosen questions into quiz_questions, so it
-- needs no extra columns.
--
-- RLS is enabled with NO policies: only the API (service role) touches these
-- tables. Idempotent: safe to run more than once.

create table if not exists public.question_banks (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  course_id    uuid references public.courses(id) on delete cascade,
  name         text not null,
  description  text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.question_banks enable row level security;

create index if not exists question_banks_school_id_idx on public.question_banks (school_id);
create index if not exists question_banks_course_id_idx on public.question_banks (course_id);

create table if not exists public.question_bank_questions (
  id                       uuid primary key default gen_random_uuid(),
  bank_id                  uuid not null references public.question_banks(id) on delete cascade,
  type                     text not null,
  question                 text not null default '',
  options                  jsonb,
  correct_answer           jsonb,
  points                   int not null default 1,
  tags                     text[] not null default '{}',
  source_quiz_question_id  uuid,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.question_bank_questions enable row level security;

create index if not exists question_bank_questions_bank_id_idx on public.question_bank_questions (bank_id);
create index if not exists question_bank_questions_tags_idx on public.question_bank_questions using gin (tags);

create table if not exists public.quiz_bank_draws (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  bank_id     uuid not null references public.question_banks(id) on delete cascade,
  draw_count  int not null default 1,
  tag         text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_bank_draws_draw_count_check') then
    alter table public.quiz_bank_draws
      add constraint quiz_bank_draws_draw_count_check check (draw_count >= 1 and draw_count <= 100);
  end if;
end $$;

alter table public.quiz_bank_draws enable row level security;

create index if not exists quiz_bank_draws_quiz_id_idx on public.quiz_bank_draws (quiz_id);
create index if not exists quiz_bank_draws_bank_id_idx on public.quiz_bank_draws (bank_id);

alter table public.quiz_attempts
  add column if not exists drawn_question_ids jsonb;
