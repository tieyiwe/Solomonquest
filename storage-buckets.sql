-- Run in the Supabase SQL editor.
--
-- Creates the two storage buckets the browser uploads to directly, plus the
-- rules for who may upload where. (The "chat-attachments" and
-- "submission-files" buckets are created automatically by the API server on
-- first use, so they are not here.)
--
--   school-assets     public images
--     avatars/<user id>/...        a user's own profile photo
--     school-logos/<school id>/... logos, uploaded by that school's admins
--   course-resources  public course files
--     courses/<course id>/...      uploaded by teachers/admins of that course's school
--
-- Both buckets are public-read because the app stores and shows their public
-- URLs. Idempotent: safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('school-assets', 'school-assets', true, 5242880,
    array['image/png','image/jpeg','image/webp','image/gif']),
  ('course-resources', 'course-resources', true, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- school-assets: avatars -----------------------------------------------------
drop policy if exists "school-assets avatar insert" on storage.objects;
drop policy if exists "school-assets avatar update" on storage.objects;
drop policy if exists "school-assets avatar delete" on storage.objects;

create policy "school-assets avatar insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "school-assets avatar update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "school-assets avatar delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- school-assets: school logos ------------------------------------------------
drop policy if exists "school-assets logo insert" on storage.objects;
drop policy if exists "school-assets logo update" on storage.objects;
drop policy if exists "school-assets logo delete" on storage.objects;

create policy "school-assets logo insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school-logos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'super_admin'
             or (p.role = 'admin' and p.school_id::text = (storage.foldername(name))[2]))
    )
  );

create policy "school-assets logo update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school-logos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'super_admin'
             or (p.role = 'admin' and p.school_id::text = (storage.foldername(name))[2]))
    )
  );

create policy "school-assets logo delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school-logos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'super_admin'
             or (p.role = 'admin' and p.school_id::text = (storage.foldername(name))[2]))
    )
  );

-- course-resources -----------------------------------------------------------
drop policy if exists "course-resources insert" on storage.objects;
drop policy if exists "course-resources delete" on storage.objects;

create policy "course-resources insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-resources'
    and (storage.foldername(name))[1] = 'courses'
    and exists (
      select 1
      from public.courses c
      join public.profiles p on p.id = auth.uid()
      where c.id::text = (storage.foldername(name))[2]
        and (p.role = 'super_admin'
             or (p.role in ('admin','teacher') and p.school_id = c.school_id))
    )
  );

create policy "course-resources delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'course-resources'
    and (storage.foldername(name))[1] = 'courses'
    and exists (
      select 1
      from public.courses c
      join public.profiles p on p.id = auth.uid()
      where c.id::text = (storage.foldername(name))[2]
        and (p.role = 'super_admin'
             or (p.role in ('admin','teacher') and p.school_id = c.school_id))
    )
  );

-- Upserts (avatar / logo replace) also need to read the existing object.
-- Public buckets serve files by URL without this; it only covers API reads.
drop policy if exists "school-assets read" on storage.objects;
create policy "school-assets read" on storage.objects
  for select to authenticated
  using (bucket_id = 'school-assets');
