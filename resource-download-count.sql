-- Run in the Supabase SQL editor.
--
-- school_resources has two different `create table` statements across the
-- schema files; only the extended one defines download_count. Guarantee the
-- column, and add an atomic increment so concurrent downloads can't lose
-- counts (a read-then-write from the API would).

alter table public.school_resources
  add column if not exists download_count int not null default 0;

create or replace function public.increment_school_resource_download(p_resource_id uuid, p_school_id uuid)
returns int
language sql
as $$
  update public.school_resources
     set download_count = coalesce(download_count, 0) + 1
   where id = p_resource_id
     and school_id = p_school_id
  returning download_count;
$$;
