-- Run in the Supabase SQL editor.
--
-- Parent progress digest: each school's admins configure a digest (what it
-- contains, who gets it, when it goes out) and send it to parents, either
-- on a schedule or with "Send now".
--
--   1. school_digest_settings: one row per school. The API computes
--      next_run_at from the schedule (in the school's chosen timezone); the
--      dispatcher claims a due run atomically by moving next_run_at forward
--      only if it still holds the value it read, so two server instances
--      never send the same digest twice.
--   2. digest_runs: history of every send (manual or scheduled), with
--      recipient, email and failure counts.
--
-- Idempotent: safe to re-run. Both tables have RLS enabled with NO
-- policies on purpose: only the API's service-role client (which bypasses
-- RLS) reads or writes them, so the public anon key gets no access.

-- 1. Per-school settings -----------------------------------------------------

create table if not exists public.school_digest_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'weekly',
  weekday smallint not null default 5,
  day_of_month smallint not null default 1,
  send_time text not null default '16:00',
  timezone text not null default 'UTC',
  include_grades boolean not null default true,
  include_attendance boolean not null default true,
  include_missing_late boolean not null default true,
  include_completion boolean not null default true,
  include_upcoming boolean not null default true,
  include_announcements boolean not null default true,
  message text,
  audience text not null default 'all',
  audience_program_ids uuid[] not null default '{}',
  audience_course_ids uuid[] not null default '{}',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_manual_send_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Constraints added separately so re-running on an existing table works.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_digest_settings_frequency_check') then
    alter table public.school_digest_settings
      add constraint school_digest_settings_frequency_check
      check (frequency in ('manual', 'weekly', 'biweekly', 'monthly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_digest_settings_weekday_check') then
    alter table public.school_digest_settings
      add constraint school_digest_settings_weekday_check check (weekday between 0 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_digest_settings_day_check') then
    alter table public.school_digest_settings
      add constraint school_digest_settings_day_check check (day_of_month between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_digest_settings_time_check') then
    alter table public.school_digest_settings
      add constraint school_digest_settings_time_check check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_digest_settings_message_check') then
    alter table public.school_digest_settings
      add constraint school_digest_settings_message_check check (message is null or char_length(message) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_digest_settings_audience_check') then
    alter table public.school_digest_settings
      add constraint school_digest_settings_audience_check check (audience in ('all', 'programs', 'courses'));
  end if;
end $$;

alter table public.school_digest_settings enable row level security;

-- The dispatcher's every-minute poll: enabled schools whose next run is due.
create index if not exists school_digest_settings_due_idx
  on public.school_digest_settings (next_run_at)
  where enabled and next_run_at is not null;

-- 2. Send history ------------------------------------------------------------

create table if not exists public.digest_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  trigger text not null,
  triggered_by uuid references public.profiles(id) on delete set null,
  scheduled_for timestamptz,
  status text not null default 'running',
  recipients integer not null default 0,
  in_app_sent integer not null default 0,
  emails_sent integer not null default 0,
  emails_failed integer not null default 0,
  skipped_opted_out integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'digest_runs_trigger_check') then
    alter table public.digest_runs
      add constraint digest_runs_trigger_check check (trigger in ('manual', 'scheduled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'digest_runs_status_check') then
    alter table public.digest_runs
      add constraint digest_runs_status_check check (status in ('running', 'completed', 'failed'));
  end if;
end $$;

alter table public.digest_runs enable row level security;

create index if not exists digest_runs_school_started_idx
  on public.digest_runs (school_id, started_at desc);
create index if not exists digest_runs_triggered_by_idx
  on public.digest_runs (triggered_by);

-- Second guard against double-sending: one scheduled run per school per
-- scheduled time, even if two instances somehow both pass the claim.
create unique index if not exists digest_runs_one_per_slot
  on public.digest_runs (school_id, scheduled_for)
  where trigger = 'scheduled';

-- Browser roles never touch these tables (the API uses the service role).
revoke all on public.school_digest_settings from anon, authenticated;
revoke all on public.digest_runs from anon, authenticated;
