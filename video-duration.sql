-- Run in the Supabase SQL editor.
--
-- The real length of a "Video Watch" assignment's video, read by the
-- teacher's browser from the video file's metadata (or typed in by the
-- teacher when it can't be read) and saved with the assignment.
--
--   assignments.video_duration_seconds   length in seconds, > 0 and <= 12h
--
-- POST /assignments/:id/watch-progress uses this value instead of the
-- duration the student's browser reports, so a student can't shrink the
-- video to finish it early. Assignments without a value (everything created
-- before this file is run, until a teacher re-saves them) keep the old
-- behaviour: the first duration the student's player reports is locked in.
-- There is no data backfill: the length can only be read from the video.
--
-- Idempotent: safe to run more than once.

alter table public.assignments
  add column if not exists video_duration_seconds numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_video_duration_seconds_check') then
    alter table public.assignments
      add constraint assignments_video_duration_seconds_check
      check (video_duration_seconds is null or (video_duration_seconds > 0 and video_duration_seconds <= 43200));
  end if;
end $$;
