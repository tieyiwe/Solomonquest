-- Run in the Supabase SQL editor, after question-banks.sql.
--
-- Teacher-chosen order for the questions in a question bank (the up/down
-- arrows on the Question banks page, saved by
-- PUT /question-banks/:id/questions/order).
--
--   question_bank_questions.position   0-based order within the bank
--
-- Backfill: questions without a position get one in their current display
-- order (created_at, then id), numbered after any already-positioned
-- questions of the same bank. Idempotent: safe to run more than once; a
-- second run changes nothing.

alter table public.question_bank_questions
  add column if not exists position int;

with base as (
  select bank_id, coalesce(max(position), -1) as top
  from public.question_bank_questions
  group by bank_id
),
numbered as (
  select q.id,
         b.top + row_number() over (partition by q.bank_id order by q.created_at, q.id) as pos
  from public.question_bank_questions q
  join base b on b.bank_id = q.bank_id
  where q.position is null
)
update public.question_bank_questions q
set position = n.pos
from numbered n
where q.id = n.id;

create index if not exists question_bank_questions_bank_position_idx
  on public.question_bank_questions (bank_id, position);
