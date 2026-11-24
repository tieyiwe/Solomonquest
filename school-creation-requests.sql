-- Run in the Supabase SQL editor.
--
-- Replaces the previous "sign up, then instantly create a school" flow with
-- a request/approval step: a prospective school owner submits their contact
-- info + suggested school name + reason, a super admin reviews it, and
-- approving is what actually creates the school (see POST
-- /school-requests/:id/approve in artifacts/api-server). This is also the
-- future hook point for payment-plan selection at approval time.

create table if not exists public.school_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_name text not null,
  requester_email text not null,
  requester_phone text,
  suggested_school_name text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  school_id uuid references public.schools(id),
  created_at timestamptz not null default now()
);

alter table public.school_creation_requests enable row level security;
drop policy if exists "school_creation_requests_all" on public.school_creation_requests;
create policy "school_creation_requests_all" on public.school_creation_requests for all using (true) with check (true);

create index if not exists school_creation_requests_requester_idx on public.school_creation_requests (requester_id);
create index if not exists school_creation_requests_status_idx on public.school_creation_requests (status, created_at desc);
