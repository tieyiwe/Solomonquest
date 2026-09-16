-- Run in the Supabase SQL editor.
--
-- profiles.is_suspended is referenced by PATCH
-- /super-admin/users/:id/suspend and by GET /super-admin/users (both in
-- artifacts/api-server/src/routes/super-admin.ts) but was never migrated —
-- the suspend endpoint has silently failed since it was written, and once
-- GET /super-admin/users started selecting the column directly it broke
-- that entire request with a "column does not exist" error, failing the
-- whole Users tab in the super admin dashboard.

alter table public.profiles add column if not exists is_suspended boolean not null default false;

create index if not exists profiles_is_suspended_idx on public.profiles (is_suspended) where is_suspended = true;
