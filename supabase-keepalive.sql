-- Run in the Supabase SQL editor.
--
-- Keep-alive for the Supabase FREE plan, which pauses a project after about
-- 7 days without database activity. The "keepalive" GitHub Action in your
-- private backups repo (template: ops/supabase-backups/ in this repo) runs
-- `select public.keepalive_ping();` every 6 days, a day before the pause
-- would kick in. The call writes one timestamp, which is real database
-- activity.
--
-- Not callable from the browser: only the database owner (the connection
-- string the Action uses) may run it. The table has RLS on and no policies.
-- Idempotent: safe to run more than once.

create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  last_ping timestamptz not null default now(),
  ping_count bigint not null default 0
);

alter table public.keepalive enable row level security;
revoke all on table public.keepalive from anon, authenticated;

create or replace function public.keepalive_ping()
returns timestamptz
language sql
set search_path = public
as $$
  insert into public.keepalive as k (id, last_ping, ping_count)
  values (1, now(), 1)
  on conflict (id) do update
    set last_ping = now(),
        ping_count = k.ping_count + 1
  returning last_ping;
$$;

revoke all on function public.keepalive_ping() from public, anon, authenticated;
