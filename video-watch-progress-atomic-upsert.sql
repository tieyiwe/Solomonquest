-- Run in the Supabase SQL editor.
--
-- Fixes a real race condition in POST /assignments/:id/watch-progress
-- (artifacts/api-server/src/routes/assignments.ts): the route used to
-- read max_watched_seconds, compute GREATEST(previous, new) in application
-- code, then upsert the whole row. Two concurrent requests for the same
-- student/assignment (e.g. two tabs) can both read the same previous value
-- and then both write, letting the lower of the two silently win — breaking
-- the "high-water mark never decreases" anti-cheat invariant.
--
-- This function makes the GREATEST computation happen atomically inside a
-- single upsert statement instead of in JS, so concurrent calls can no
-- longer race each other.

create or replace function public.upsert_video_watch_progress(
  p_assignment_id uuid,
  p_student_id uuid,
  p_watched_seconds numeric,
  p_duration_seconds numeric,
  p_completion_threshold_percent numeric
)
returns public.video_watch_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.video_watch_progress;
begin
  insert into public.video_watch_progress as vwp
    (assignment_id, student_id, max_watched_seconds, duration_seconds, watched_percent, completed, updated_at)
  values
    (
      p_assignment_id,
      p_student_id,
      greatest(0, p_watched_seconds),
      p_duration_seconds,
      case when p_duration_seconds > 0
        then least(100, greatest(0, p_watched_seconds) / p_duration_seconds * 100)
        else 0
      end,
      case when p_duration_seconds > 0
        then (least(100, greatest(0, p_watched_seconds) / p_duration_seconds * 100)) >= p_completion_threshold_percent
        else false
      end,
      now()
    )
  on conflict (assignment_id, student_id) do update set
    max_watched_seconds = greatest(vwp.max_watched_seconds, excluded.max_watched_seconds),
    duration_seconds = excluded.duration_seconds,
    watched_percent = case when excluded.duration_seconds > 0
      then least(100, greatest(vwp.max_watched_seconds, excluded.max_watched_seconds) / excluded.duration_seconds * 100)
      else vwp.watched_percent
    end,
    completed = vwp.completed or (
      case when excluded.duration_seconds > 0
        then (least(100, greatest(vwp.max_watched_seconds, excluded.max_watched_seconds) / excluded.duration_seconds * 100)) >= p_completion_threshold_percent
        else false
      end
    ),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_video_watch_progress(uuid, uuid, numeric, numeric, numeric) to authenticated, service_role;
