-- Run in the Supabase SQL editor.
--
-- Powers per-school and per-user usage visibility for the super admin
-- dashboard (Usage & Costs section) — especially AI token spend, so the
-- platform team can see where cost is coming from, have an informed
-- conversation about upgrading a school's plan, or cap/throttle usage.

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  -- 'ai_chat' | 'chat_message' | 'forum_post' | 'video_call'
  event_type text not null,
  ai_model text,
  input_tokens integer,
  output_tokens integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.usage_events enable row level security;
drop policy if exists "usage_events_all" on public.usage_events;
create policy "usage_events_all" on public.usage_events for all using (true) with check (true);

create index if not exists usage_events_school_created_idx on public.usage_events (school_id, created_at desc);
create index if not exists usage_events_user_created_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_type_idx on public.usage_events (event_type, created_at desc);
