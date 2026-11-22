-- Run in the Supabase SQL editor.
--
-- Lets a student attach an actual file to an assignment submission
-- (previously the only option was pasting a link into the text box).
-- The file is uploaded through the API (POST
-- /assignments/:assignmentId/submissions/upload, virus-scanned like chat
-- attachments) into the "submission-files" storage bucket, which the API
-- creates on first use; the stored public URL lands here. The teacher
-- gradebook already reads submission.fileUrl to show / convert the file.
-- Idempotent.

alter table public.submissions
  add column if not exists file_url text;

alter table public.submissions
  add column if not exists file_name text;
