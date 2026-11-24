-- Run in the Supabase SQL editor. Idempotent: safe to run more than once.
--
-- The columns the school branding page (Dashboard -> Branding) saves to.
-- They are also in supabase-schema-additions.sql; this file exists so a
-- database that skipped that file can be fixed on its own. Without the
-- `branding` column, saving branding fails with a message pointing here.
--
--   logo_url, tagline, primary_color, secondary_color  real columns
--   branding (jsonb)  slides, hero settings, accent / heading colours, fonts,
--                     radius, stats, features, testimonials, announcement,
--                     social links and custom CSS

alter table public.schools add column if not exists logo_url text;
alter table public.schools add column if not exists tagline text;
alter table public.schools add column if not exists primary_color text;
alter table public.schools add column if not exists secondary_color text;
alter table public.schools add column if not exists branding jsonb default '{}'::jsonb;
