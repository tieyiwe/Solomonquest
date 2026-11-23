-- Run in the Supabase SQL editor.
--
-- CSV bulk import (Admin -> Bulk import). Students are invited through the
-- normal invitation flow; these columns let an imported invitation carry
-- the student's name (pre-filled on the accept page) and the courses to
-- enrol them in once they accept. Idempotent.

alter table public.invitations
  add column if not exists first_name text;

alter table public.invitations
  add column if not exists last_name text;

-- Array of course ids (as JSON strings) to enrol the student in on accept.
alter table public.invitations
  add column if not exists course_ids jsonb;
