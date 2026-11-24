-- Run in the Supabase SQL editor (after supabase-schema-additions.sql,
-- stripe-tuition.sql and parent-portal.sql). Safe to run more than once.
--
-- Tuition ledger: every money movement against a student's tuition is its
-- own row here (payment, discount/scholarship, waiver, adjustment, refund).
-- Balances are never stored; the API computes them from the billed
-- installments (tuition_payments / tuition_installments) plus the
-- non-voided ledger rows. Mistakes are voided with a reason, never deleted.
--
-- Also adds:
--   * tuition_reminders: history of balance reminders (who, when, channel,
--     the balance at the time);
--   * schools.payment_instructions: free text shown to students and in
--     reminders while online payment is not connected;
--   * 'partial' as an installment status (an installment that has received
--     some, but not all, of its amount);
--   * a backfill so installments/payments already marked paid appear in the
--     ledger, which keeps every balance exactly what it was before.
--
-- RLS is enabled with NO policies: only the API (service role) touches these
-- tables, and the browser roles get no privileges on them.

-- ─── Ledger ────────────────────────────────────────────────────────────────
create table if not exists public.tuition_ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  -- The tuition_payments row (a student's enrolment in one tuition plan) and,
  -- optionally, the installment the money was earmarked for. Both are
  -- optional: an unallocated payment is applied oldest-due-first.
  payment_id      uuid references public.tuition_payments(id) on delete set null,
  installment_id  uuid references public.tuition_installments(id) on delete set null,
  -- Always positive, except 'adjustment', which is signed:
  --   > 0 credits the student (lowers what they owe),
  --   < 0 charges the student (raises what they owe).
  amount_cents    integer not null,
  currency        text not null default 'usd',
  kind            text not null,
  method          text,
  reference       text,
  note            text,
  -- Display label for non-cash credits, e.g. "Scholarship", "Sibling discount".
  label           text,
  -- The day the money was actually received (cash basis for the P&L).
  paid_on         date not null default current_date,
  receipt_number  text,
  -- Where the row came from: an admin, the Stripe webhook, the test-only
  -- "simulate payment" path, or the one-time import of existing records.
  source          text not null default 'manual',
  recorded_by     uuid references public.profiles(id) on delete set null,
  recorded_at     timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references public.profiles(id) on delete set null,
  void_reason     text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tuition_ledger_entries_kind_check') then
    alter table public.tuition_ledger_entries
      add constraint tuition_ledger_entries_kind_check
      check (kind in ('payment', 'adjustment', 'discount', 'refund', 'waiver'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tuition_ledger_entries_amount_check') then
    alter table public.tuition_ledger_entries
      add constraint tuition_ledger_entries_amount_check
      check ((kind = 'adjustment' and amount_cents <> 0) or (kind <> 'adjustment' and amount_cents > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tuition_ledger_entries_method_check') then
    alter table public.tuition_ledger_entries
      add constraint tuition_ledger_entries_method_check
      check (method is null or method in
        ('cash', 'bank_transfer', 'cheque', 'mobile_money', 'card_in_person', 'online', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tuition_ledger_entries_source_check') then
    alter table public.tuition_ledger_entries
      add constraint tuition_ledger_entries_source_check
      check (source in ('manual', 'stripe', 'simulated', 'backfill'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tuition_ledger_entries_void_check') then
    alter table public.tuition_ledger_entries
      add constraint tuition_ledger_entries_void_check
      check (voided_at is null or (void_reason is not null and length(trim(void_reason)) > 0));
  end if;
end $$;

create index if not exists tuition_ledger_school_student_idx
  on public.tuition_ledger_entries (school_id, student_id);
create index if not exists tuition_ledger_school_paid_on_idx
  on public.tuition_ledger_entries (school_id, paid_on);
create index if not exists tuition_ledger_payment_idx
  on public.tuition_ledger_entries (payment_id);
create index if not exists tuition_ledger_installment_idx
  on public.tuition_ledger_entries (installment_id);
create unique index if not exists tuition_ledger_receipt_number_uniq
  on public.tuition_ledger_entries (school_id, receipt_number)
  where receipt_number is not null;
-- A Stripe payment (identified by its PaymentIntent / Checkout Session id)
-- is recorded at most once, however many times Stripe retries the webhook.
create unique index if not exists tuition_ledger_stripe_ref_uniq
  on public.tuition_ledger_entries (reference)
  where source = 'stripe' and reference is not null;
-- The backfill below imports each paid installment at most once.
create unique index if not exists tuition_ledger_backfill_installment_uniq
  on public.tuition_ledger_entries (installment_id)
  where source = 'backfill' and installment_id is not null;

alter table public.tuition_ledger_entries enable row level security;
revoke all on table public.tuition_ledger_entries from anon, authenticated;

-- ─── Reminder history ──────────────────────────────────────────────────────
create table if not exists public.tuition_reminders (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  sent_by           uuid references public.profiles(id) on delete set null,
  sent_at           timestamptz not null default now(),
  -- e.g. {in_app,email}
  channels          text[] not null default '{}',
  -- sent | failed | no_email | opted_out | smtp_off
  email_status      text,
  parents_notified  integer not null default 0,
  -- Balance in the student's main currency when the reminder went out.
  balance_cents     integer not null default 0,
  overdue_cents     integer not null default 0,
  currency          text not null default 'usd',
  -- Every currency's totals and each outstanding item, as sent.
  balances          jsonb not null default '[]'::jsonb,
  items             jsonb not null default '[]'::jsonb,
  custom_note       text,
  message           text not null default ''
);

create index if not exists tuition_reminders_school_student_idx
  on public.tuition_reminders (school_id, student_id, sent_at desc);

alter table public.tuition_reminders enable row level security;
revoke all on table public.tuition_reminders from anon, authenticated;

-- ─── Payment instructions (school setting) ─────────────────────────────────
alter table public.schools
  add column if not exists payment_instructions text;

-- ─── Installment status: allow 'partial' ───────────────────────────────────
do $$
declare
  ck_name text;
begin
  select conname into ck_name
  from pg_constraint
  where conrelid = 'public.tuition_installments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
    and pg_get_constraintdef(oid) not like '%partial%';

  if ck_name is not null then
    execute format('alter table public.tuition_installments drop constraint %I', ck_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tuition_installments'::regclass
      and conname = 'tuition_installments_status_check'
  ) then
    alter table public.tuition_installments
      add constraint tuition_installments_status_check
      check (status in ('pending', 'partial', 'paid', 'failed'));
  end if;
end $$;

-- ─── Backfill existing payments into the ledger ────────────────────────────
-- Before this migration a balance was "sum of installments marked paid"
-- (or, for a payment with no installment rows, its full amount once the
-- payment was marked paid). Importing exactly those amounts, one ledger row
-- per paid installment, makes the computed balance identical.
insert into public.tuition_ledger_entries
  (school_id, student_id, payment_id, installment_id, amount_cents, currency,
   kind, method, reference, note, paid_on, source, recorded_at)
select
  p.school_id,
  p.student_id,
  p.id,
  i.id,
  i.amount_cents,
  coalesce(p.currency, 'usd'),
  'payment',
  case when i.stripe_payment_intent_id is not null then 'online' else 'other' end,
  i.stripe_payment_intent_id,
  'Imported from the payment records that existed before the ledger',
  coalesce(i.paid_at, p.updated_at, p.created_at)::date,
  'backfill',
  coalesce(i.paid_at, p.updated_at, p.created_at)
from public.tuition_installments i
join public.tuition_payments p on p.id = i.payment_id
where i.status = 'paid'
  and i.amount_cents > 0
  and not exists (
    select 1 from public.tuition_ledger_entries l
    where l.installment_id = i.id and l.source = 'backfill'
  );

insert into public.tuition_ledger_entries
  (school_id, student_id, payment_id, amount_cents, currency,
   kind, method, note, paid_on, source, recorded_at)
select
  p.school_id,
  p.student_id,
  p.id,
  p.amount_cents,
  coalesce(p.currency, 'usd'),
  'payment',
  'other',
  'Imported from the payment records that existed before the ledger',
  coalesce(p.updated_at, p.created_at)::date,
  'backfill',
  coalesce(p.updated_at, p.created_at)
from public.tuition_payments p
where p.status = 'paid'
  and p.amount_cents > 0
  and not exists (select 1 from public.tuition_installments i where i.payment_id = p.id)
  and not exists (
    select 1 from public.tuition_ledger_entries l
    where l.payment_id = p.id and l.source = 'backfill'
  );

-- Receipt numbers for imported payments (R-YYYYMMDD-XXXXXXXX, the same format
-- the API uses for new ones).
update public.tuition_ledger_entries
set receipt_number = 'R-' || to_char(paid_on, 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where receipt_number is null
  and kind = 'payment';
