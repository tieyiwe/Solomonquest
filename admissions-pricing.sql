-- Run in the Supabase SQL editor. Idempotent: safe to run more than once.
--
-- Program pricing, an optional application fee, and the customised
-- "congratulations" email sent when an application is approved.
--
--   tuition_plans.pricing_note      short public note under a program price,
--                                   e.g. "includes materials"
--   school_admission_settings       one row per school: application fee
--                                   (OFF by default = free) and the admission
--                                   details used in the approval email
--   program_admission_settings      optional per-program overrides: its own
--                                   application fee amount, message and next
--                                   steps (null = use the school default)
--   student_applications.fee_*      what the applicant owes / paid / had waived
--   student_applications.congrats_* whether the approval email went out
--   student_applications.tuition_payment_id  the tuition record created on
--                                   approval for a priced program
--
-- Without a school_admission_settings row a school behaves exactly as before:
-- applications are free and approval uses the built-in default message.
--
-- RLS is enabled with NO policies on the new tables: only the API (service
-- role) touches them, so the browser's anon key can't read or write them.

-- ─── Program pricing note ────────────────────────────────────────────────────
alter table public.tuition_plans add column if not exists pricing_note text;

-- ─── School-wide admission settings ──────────────────────────────────────────
create table if not exists public.school_admission_settings (
  school_id                  uuid primary key references public.schools(id) on delete cascade,
  application_fee_enabled    boolean not null default false,
  application_fee_cents      integer not null default 0,
  application_fee_currency   text not null default 'usd',
  congrats_headline          text,
  congrats_message           text,
  -- [{ "title": "...", "description": "...", "url": "https://..." | null }]
  next_steps                 jsonb not null default '[]'::jsonb,
  -- ["Copy of ID", "Transcript"]
  required_documents         jsonb not null default '[]'::jsonb,
  start_date                 date,
  contact_name               text,
  contact_email              text,
  contact_phone              text,
  -- [{ "label": "Student handbook", "url": "https://..." }]
  extra_links                jsonb not null default '[]'::jsonb,
  updated_by                 uuid references public.profiles(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_admission_settings_fee_check') then
    alter table public.school_admission_settings
      add constraint school_admission_settings_fee_check check (application_fee_cents >= 0);
  end if;
end $$;

alter table public.school_admission_settings enable row level security;

-- ─── Per-program overrides ───────────────────────────────────────────────────
create table if not exists public.program_admission_settings (
  program_id              uuid primary key references public.programs(id) on delete cascade,
  school_id               uuid not null references public.schools(id) on delete cascade,
  -- null = use the school's default fee
  application_fee_cents   integer,
  congrats_message        text,
  -- null = use the school's next steps
  next_steps              jsonb,
  updated_by              uuid references public.profiles(id) on delete set null,
  updated_at              timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'program_admission_settings_fee_check') then
    alter table public.program_admission_settings
      add constraint program_admission_settings_fee_check check (application_fee_cents is null or application_fee_cents >= 0);
  end if;
end $$;

create index if not exists program_admission_settings_school_idx on public.program_admission_settings (school_id);
alter table public.program_admission_settings enable row level security;

-- ─── Application fee + approval email tracking on each application ──────────
alter table public.student_applications add column if not exists fee_status text not null default 'not_required';
alter table public.student_applications add column if not exists fee_amount_cents integer;
alter table public.student_applications add column if not exists fee_currency text;
alter table public.student_applications add column if not exists fee_paid_at timestamptz;
alter table public.student_applications add column if not exists fee_stripe_session_id text;
alter table public.student_applications add column if not exists fee_stripe_payment_intent_id text;
alter table public.student_applications add column if not exists fee_waived_by uuid references public.profiles(id) on delete set null;
alter table public.student_applications add column if not exists fee_waived_at timestamptz;
alter table public.student_applications add column if not exists fee_waiver_reason text;
alter table public.student_applications add column if not exists congrats_email_status text;
alter table public.student_applications add column if not exists congrats_email_sent_at timestamptz;
alter table public.student_applications add column if not exists congrats_email_error text;
alter table public.student_applications add column if not exists tuition_payment_id uuid references public.tuition_payments(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'student_applications_fee_status_check') then
    alter table public.student_applications
      add constraint student_applications_fee_status_check
      check (fee_status in ('not_required', 'awaiting_payment', 'paid', 'waived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'student_applications_congrats_email_status_check') then
    alter table public.student_applications
      add constraint student_applications_congrats_email_status_check
      check (congrats_email_status is null or congrats_email_status in ('sent', 'failed'));
  end if;
end $$;

-- Accounting reads paid fees by school + paid_at; the webhook looks up by id.
create index if not exists student_applications_fee_paid_idx
  on public.student_applications (school_id, fee_paid_at)
  where fee_status = 'paid';
