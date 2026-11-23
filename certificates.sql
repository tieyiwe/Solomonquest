-- Run in the Supabase SQL editor.
--
-- Certificates of completion.
--
--   certificate_settings  one row per school: the school's own certificate
--                         design (logo, title, wording, signatories, accent
--                         colour) and issuing rules. Until a school has
--                         enabled AND saved this, the API issues nothing.
--   certificates          every issued certificate. The rendered wording,
--                         names, logo and signatories are copied onto the row
--                         when it is issued, so a certificate always looks the
--                         way it did on the day it was awarded even if the
--                         school later changes its design. Each has a unique
--                         verification_code for the public /verify/<code>
--                         page (served through the API, never read directly).
--
-- Logos and signature images live in the existing "school-assets" bucket
-- under school-logos/<school id>/certificate-*.<ext> (storage-buckets.sql
-- already lets that school's admins upload there).
--
-- RLS is enabled with NO policies: only the API (service role) touches these
-- tables. Idempotent: safe to run more than once.

create table if not exists public.certificate_settings (
  school_id           uuid primary key references public.schools(id) on delete cascade,
  enabled             boolean not null default false,
  logo_url            text,
  title               text not null default 'Certificate of Completion',
  body_template       text not null default 'This is to certify that {studentName} has successfully completed {courseName} at {schoolName}, awarded on {date}.',
  -- [{ "name": "...", "title": "...", "signatureUrl": "..." | null }], at most two
  signatories         jsonb not null default '[]'::jsonb,
  accent_color        text not null default '#c9a054',
  issue_mode          text not null default 'approval',
  pass_percent        numeric not null default 70,
  teachers_can_issue  boolean not null default false,
  configured_at       timestamptz,
  updated_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'certificate_settings_issue_mode_check') then
    alter table public.certificate_settings
      add constraint certificate_settings_issue_mode_check check (issue_mode in ('approval', 'auto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'certificate_settings_pass_percent_check') then
    alter table public.certificate_settings
      add constraint certificate_settings_pass_percent_check check (pass_percent >= 0 and pass_percent <= 100);
  end if;
end $$;

alter table public.certificate_settings enable row level security;

create table if not exists public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  course_id          uuid references public.courses(id) on delete set null,
  program_id         uuid references public.programs(id) on delete set null,
  verification_code  text not null unique,
  -- Snapshot of what was printed on the certificate when it was issued.
  student_name       text not null,
  course_name        text,
  program_name       text,
  school_name        text not null,
  title              text not null,
  body               text not null,
  logo_url           text,
  accent_color       text,
  signatories        jsonb not null default '[]'::jsonb,
  final_percent      numeric,
  issue_method       text not null default 'manual',
  issued_by          uuid references public.profiles(id) on delete set null,
  issued_at          timestamptz not null default now(),
  status             text not null default 'valid',
  revoked_at         timestamptz,
  revoked_by         uuid references public.profiles(id) on delete set null,
  revoke_reason      text,
  created_at         timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'certificates_status_check') then
    alter table public.certificates
      add constraint certificates_status_check check (status in ('valid', 'revoked'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'certificates_issue_method_check') then
    alter table public.certificates
      add constraint certificates_issue_method_check check (issue_method in ('manual', 'approved', 'auto'));
  end if;
end $$;

alter table public.certificates enable row level security;

create index if not exists certificates_school_id_idx on public.certificates (school_id);
create index if not exists certificates_student_id_idx on public.certificates (student_id);
create index if not exists certificates_course_id_idx on public.certificates (course_id);

-- At most one VALID certificate per student per course / per program
-- (a revoked one can be re-issued). Also stops two concurrent auto-issues
-- from both landing.
create unique index if not exists certificates_one_valid_per_course
  on public.certificates (student_id, course_id)
  where status = 'valid' and course_id is not null;
create unique index if not exists certificates_one_valid_per_program
  on public.certificates (student_id, program_id)
  where status = 'valid' and program_id is not null and course_id is null;
