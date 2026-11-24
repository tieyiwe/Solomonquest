-- Run in the Supabase SQL editor.
--
-- schools.deleted_at is referenced throughout the soft-delete/archive/
-- restore flow (GET /super-admin/schools, POST /super-admin/schools/:id/
-- delete, POST /super-admin/schools/:id/execute-deletion, POST
-- /super-admin/archive/:id/restore — all in artifacts/api-server/src/
-- routes/super-admin.ts) but was never actually migrated onto the
-- schools table. GET /super-admin/schools selects it directly, so every
-- request 500'd with "column does not exist" — the cause of "Failed to
-- load schools." The delete/restore flows likely also silently failed to
-- track deletion state correctly since they relied on this same column.

alter table public.schools add column if not exists deleted_at timestamptz;

create index if not exists schools_deleted_at_idx on public.schools (deleted_at) where deleted_at is not null;
