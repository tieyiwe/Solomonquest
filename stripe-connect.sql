-- Run in the Supabase SQL editor.
--
-- Lets each school connect its own Stripe account (Stripe Connect,
-- "standard" account type) so tuition payments go directly to that
-- school, independent of the platform's own Stripe account. The platform
-- only ever holds the connected account id — no school's funds or bank
-- details ever pass through or are stored by SolomonQuest itself.

alter table public.schools add column if not exists stripe_connect_account_id text;
alter table public.schools add column if not exists stripe_connect_status text not null default 'not_connected';
alter table public.schools add column if not exists stripe_connect_details_submitted boolean not null default false;
alter table public.schools add column if not exists stripe_connect_charges_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schools_stripe_connect_status_check'
  ) then
    alter table public.schools
      add constraint schools_stripe_connect_status_check
      check (stripe_connect_status in ('not_connected', 'pending', 'connected', 'restricted'));
  end if;
end $$;

create index if not exists schools_stripe_connect_account_idx on public.schools (stripe_connect_account_id);
