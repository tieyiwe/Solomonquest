-- Run in the Supabase SQL editor.
--
-- RLS LOCKDOWN
-- ============
-- The browser bundle ships the public anon key, and the older migrations
-- created policies like `for all using (true)` with no `to <role>` clause.
-- Anyone could therefore call Supabase REST directly with the anon key and
-- read/write grades, submissions, quiz answer keys, invitations, chat,
-- applications, profiles (emails/phones), expenses, ... bypassing every
-- access check in the Express API.
--
-- The API uses the service-role client, which bypasses RLS, so it needs none
-- of these policies. This file:
--   1. creates a few `security definer` helper functions used by policies;
--   2. on every app table that exists: enables RLS, drops EVERY policy
--      (the known permissive ones by name, then any leftovers), and revokes
--      all table privileges from `anon` and `authenticated`;
--   3. re-adds only the narrow SELECT policies the browser genuinely needs
--      (Realtime postgres_changes delivery + one direct read), `to
--      authenticated`, plus SELECT grants on just those tables;
--   4. revokes EXECUTE on RPC-callable functions the browser never calls.
--
-- Storage policies (storage-buckets.sql) are not touched.
--
-- Safe to re-run: every step is idempotent and skips tables/functions that
-- don't exist yet. Re-run it after running any OLDER migration file, since
-- those recreate their `using (true)` policies.

-- ─── 1. Helper functions ──────────────────────────────────────────────────
-- plpgsql so they can be created even if a referenced table/column is
-- missing; security definer so they can read profiles / chat_channel_members
-- without recursing into those tables' own RLS.

-- Caller's role, or null if not signed in / no profile / suspended.
create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prof jsonb;
begin
  if auth.uid() is null then return null; end if;
  select to_jsonb(p) into v_prof from public.profiles p where p.id = auth.uid();
  if v_prof is null or coalesce((v_prof->>'is_suspended')::boolean, false) then
    return null;
  end if;
  return v_prof->>'role';
end;
$$;

-- Caller's school, or null if not signed in / no profile / suspended.
create or replace function public.current_user_school_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prof jsonb;
begin
  if auth.uid() is null then return null; end if;
  select to_jsonb(p) into v_prof from public.profiles p where p.id = auth.uid();
  if v_prof is null or coalesce((v_prof->>'is_suspended')::boolean, false) then
    return null;
  end if;
  return nullif(v_prof->>'school_id', '')::uuid;
end;
$$;

-- Same membership rule the API uses (assertChannelMember in routes/chat.ts).
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_channel_id is null then return false; end if;
  return exists (
    select 1 from public.chat_channel_members m
    where m.channel_id = p_channel_id and m.user_id = auth.uid()
  );
end;
$$;

create or replace function public.can_view_chat_message(p_message_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_message_id is null then return false; end if;
  return exists (
    select 1
    from public.chat_messages msg
    join public.chat_channel_members m on m.channel_id = msg.channel_id
    where msg.id = p_message_id and m.user_id = auth.uid()
  );
end;
$$;

-- Mirrors canAccessForumScope + the school check in routes/forum.ts:
-- super_admin: any topic; otherwise same school, then admin: any; unscoped
-- topic: anyone in the school; course topic: that course's teacher or an
-- actively-enrolled student/staff; program topic: same across the program's
-- courses. program_id is read via jsonb so this works before
-- forum-scoping-mentions.sql has added the column.
create or replace function public.can_view_forum_topic(p_topic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.current_user_role();
  v_school uuid := public.current_user_school_id();
  v_topic jsonb;
  v_course uuid;
  v_program uuid;
begin
  if v_uid is null or v_role is null or p_topic_id is null then return false; end if;

  select to_jsonb(t) into v_topic from public.forum_topics t where t.id = p_topic_id;
  if v_topic is null then return false; end if;

  if v_role = 'super_admin' then return true; end if;
  if v_school is null or nullif(v_topic->>'school_id', '')::uuid is distinct from v_school then
    return false;
  end if;
  if v_role = 'admin' then return true; end if;

  v_course := nullif(v_topic->>'course_id', '')::uuid;
  v_program := nullif(v_topic->>'program_id', '')::uuid;

  if v_course is null and v_program is null then return true; end if;

  if v_course is not null then
    if v_role = 'teacher' then
      return exists (select 1 from public.courses c where c.id = v_course and c.teacher_id = v_uid);
    end if;
    return exists (
      select 1 from public.course_enrollments e
      where e.course_id = v_course and e.student_id = v_uid and e.status = 'active'
    );
  end if;

  if v_role = 'teacher' then
    return exists (select 1 from public.courses c where c.program_id = v_program and c.teacher_id = v_uid);
  end if;
  return exists (
    select 1 from public.course_enrollments e
    join public.courses c on c.id = e.course_id
    where c.program_id = v_program and e.student_id = v_uid and e.status = 'active'
  );
end;
$$;

-- Policies evaluate as the querying role, so `authenticated` must be able
-- to execute the helpers; nobody else needs them.
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.current_user_school_id() from public, anon;
revoke execute on function public.is_channel_member(uuid) from public, anon;
revoke execute on function public.can_view_chat_message(uuid) from public, anon;
revoke execute on function public.can_view_forum_topic(uuid) from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_user_school_id() to authenticated, service_role;
grant execute on function public.is_channel_member(uuid) to authenticated, service_role;
grant execute on function public.can_view_chat_message(uuid) to authenticated, service_role;
grant execute on function public.can_view_forum_topic(uuid) to authenticated, service_role;

-- ─── 2. Enable RLS, drop every policy, revoke browser privileges ──────────
do $$
declare
  v_tables text[] := array[
    'agent_conversations', 'announcements', 'application_course_selections',
    'application_form_fields', 'application_form_responses', 'assignments',
    'attendance', 'chat_calls', 'chat_channel_members', 'chat_channels',
    'chat_message_edits', 'chat_message_reactions', 'chat_messages',
    'course_audit_log', 'course_enrollments', 'course_resources', 'courses',
    'expenses', 'forum_comments', 'forum_mentions', 'forum_reactions',
    'forum_topics', 'internal_messages', 'invitations', 'note_shares', 'notes',
    'notifications', 'parent_student_links', 'platform_audit_log',
    'platform_settings', 'profiles', 'programs', 'quiz_answers',
    'quiz_attempts', 'quiz_question_options', 'quiz_questions', 'quizzes',
    'reminders', 'role_permissions', 'school_agents', 'school_archive',
    'school_creation_requests', 'school_deletion_requests', 'school_resources',
    'schools', 'student_applications', 'submissions', 'terms', 'transcripts',
    'tuition_installments', 'tuition_payments', 'tuition_plans',
    'usage_events', 'video_sessions', 'video_watch_progress'
  ];
  -- Every policy the migration files create, by exact name. Listed so the
  -- intent is greppable; the sweep below would catch them anyway.
  v_named text[][] := array[
    -- supabase-schema.sql: `using (true)`
    ['profiles', 'profiles_read'],
    ['schools', 'schools_read'],
    ['programs', 'programs_read'],
    ['courses', 'courses_read'],
    ['course_enrollments', 'enrollments_all'],
    ['assignments', 'assignments_all'],
    ['submissions', 'submissions_all'],
    ['announcements', 'announcements_all'],
    ['notifications', 'notifications_all'],
    ['student_applications', 'applications_all'],
    ['attendance', 'attendance_all'],
    ['invitations', 'invitations_all'],
    ['role_permissions', 'role_permissions_all'],
    ['application_form_fields', 'app_form_fields_all'],
    ['application_form_responses', 'app_form_responses_all'],
    ['application_course_selections', 'app_course_selections_all'],
    ['course_resources', 'course_resources_all'],
    ['school_resources', 'school_resources_all'],
    ['chat_channels', 'chat_channels_all'],
    ['chat_channel_members', 'chat_channel_members_all'],
    ['chat_messages', 'chat_messages_all'],
    ['forum_topics', 'forum_topics_all'],
    ['forum_comments', 'forum_comments_all'],
    ['forum_reactions', 'forum_reactions_all'],
    ['video_sessions', 'video_sessions_all'],
    ['quizzes', 'quizzes_all'],
    ['quiz_questions', 'quiz_questions_all'],
    ['quiz_question_options', 'quiz_question_options_all'],
    ['quiz_attempts', 'quiz_attempts_all'],
    ['quiz_answers', 'quiz_answers_all'],
    -- supabase-schema.sql: scoped but too broad (a user could set their own
    -- role to super_admin, create a school bypassing approval, rewrite their
    -- school's billing columns, or write courses/programs unvalidated)
    ['profiles', 'profiles_insert'],
    ['profiles', 'profiles_update'],
    ['schools', 'schools_insert'],
    ['schools', 'schools_update'],
    ['programs', 'programs_write'],
    ['courses', 'courses_write'],
    -- supabase-schema-extended.sql: `using (true) with check (true)`
    ['invitations', 'Allow all on invitations'],
    ['role_permissions', 'Allow all on role_permissions'],
    ['application_form_fields', 'Allow all on application_form_fields'],
    ['application_form_responses', 'Allow all on application_form_responses'],
    ['application_course_selections', 'Allow all on application_course_selections'],
    ['course_resources', 'Allow all on course_resources'],
    ['school_resources', 'Allow all on school_resources'],
    ['chat_channels', 'Allow all on chat_channels'],
    ['chat_channel_members', 'Allow all on chat_channel_members'],
    ['chat_messages', 'Allow all on chat_messages'],
    ['forum_topics', 'Allow all on forum_topics'],
    ['forum_comments', 'Allow all on forum_comments'],
    ['forum_reactions', 'Allow all on forum_reactions'],
    ['video_sessions', 'Allow all on video_sessions'],
    ['quizzes', 'Allow all on quizzes'],
    ['quiz_questions', 'Allow all on quiz_questions'],
    ['quiz_question_options', 'Allow all on quiz_question_options'],
    ['quiz_attempts', 'Allow all on quiz_attempts'],
    ['quiz_answers', 'Allow all on quiz_answers'],
    -- supabase-schema-additions.sql
    ['reminders', 'reminders_all'],
    ['school_deletion_requests', 'deletion_requests_policy'],
    ['transcripts', 'Allow all on transcripts'],
    ['chat_calls', 'Allow all on chat_calls'],
    ['school_agents', 'school_agents_all'],
    ['notes', 'notes_all'],
    ['note_shares', 'note_shares_all'],
    ['tuition_plans', 'tuition_plans_all'],
    ['tuition_payments', 'tuition_payments_all'],
    ['tuition_installments', 'tuition_installments_all'],
    ['chat_message_reactions', 'chat_message_reactions_all'],
    ['chat_message_edits', 'chat_message_edits_all'],
    -- supabase-schema-additions.sql: scoped FOR ALL policies — the browser
    -- never writes these directly, and FOR ALL let users forge rows
    -- (e.g. insert a DM "from" anyone into their own inbox, or edit the
    -- audit log as super_admin outside the API)
    ['internal_messages', 'messages_rls'],
    ['agent_conversations', 'agent_conversations_own'],
    ['platform_audit_log', 'audit_log_superadmin'],
    ['school_archive', 'archive_superadmin'],
    ['platform_settings', 'platform_settings_superadmin'],
    -- later single-table migrations: `using (true) with check (true)`
    ['expenses', 'expenses_all'],
    ['course_audit_log', 'course_audit_log_all'],
    ['forum_mentions', 'forum_mentions_all'],
    ['video_watch_progress', 'video_watch_progress_all'],
    ['parent_student_links', 'parent_student_links_all'],
    ['school_creation_requests', 'school_creation_requests_all'],
    ['terms', 'terms_all'],
    ['usage_events', 'usage_events_all']
  ];
  v_t text;
  v_i int;
  v_pol record;
begin
  for v_i in 1 .. array_length(v_named, 1) loop
    if exists (select 1 from pg_policies where schemaname = 'public'
               and tablename = v_named[v_i][1] and policyname = v_named[v_i][2]) then
      execute format('drop policy if exists %I on public.%I', v_named[v_i][2], v_named[v_i][1]);
    end if;
  end loop;

  foreach v_t in array v_tables loop
    if to_regclass(format('public.%I', v_t)) is null then
      raise notice 'rls-lockdown: table public.% does not exist, skipping', v_t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_t);

    -- Sweep: drop anything else (hand-made policies, renamed variants, and
    -- this file's own policies from a previous run — recreated below).
    for v_pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = v_t
    loop
      execute format('drop policy if exists %I on public.%I', v_pol.policyname, v_t);
    end loop;

    -- Defense in depth: even if an old migration later recreates a
    -- `using (true)` policy, the browser roles still can't write.
    execute format('revoke all on table public.%I from anon, authenticated', v_t);
  end loop;
end $$;

-- ─── 3. The narrow policies the browser actually needs ────────────────────
-- Each is SELECT-only, `to authenticated`. Realtime postgres_changes checks
-- the subscriber's SELECT RLS before delivering a row, so these are what
-- keep live updates working.
do $$
begin
  -- notifications: components/NotificationBell.tsx realtime INSERT
  -- (filter user_id=eq.<me>); components/ui/NotificationBell.tsx direct read.
  if to_regclass('public.notifications') is not null then
    create policy "lockdown_notifications_select_own" on public.notifications
      for select to authenticated
      using (user_id = auth.uid());
    grant select on public.notifications to authenticated;
  end if;

  -- internal_messages: NotificationBell + MessagesPage realtime INSERT
  -- (filter to_user_id=eq.<me>).
  if to_regclass('public.internal_messages') is not null then
    create policy "lockdown_internal_messages_select_party" on public.internal_messages
      for select to authenticated
      using (from_user_id = auth.uid() or to_user_id = auth.uid());
    grant select on public.internal_messages to authenticated;
  end if;

  -- chat_messages: ChatPage realtime INSERT (per channel and global unread).
  if to_regclass('public.chat_messages') is not null then
    create policy "lockdown_chat_messages_select_member" on public.chat_messages
      for select to authenticated
      using (sender_id = auth.uid() or public.is_channel_member(channel_id));
    grant select on public.chat_messages to authenticated;
  end if;

  -- chat_channel_members: ChatPage realtime UPDATE (DM read receipts — the
  -- caller needs to see the OTHER member's row in channels they belong to).
  if to_regclass('public.chat_channel_members') is not null then
    create policy "lockdown_chat_channel_members_select_member" on public.chat_channel_members
      for select to authenticated
      using (user_id = auth.uid() or public.is_channel_member(channel_id));
    grant select on public.chat_channel_members to authenticated;
  end if;

  -- chat_calls: ChatPage realtime INSERT/UPDATE (incoming call ringing).
  if to_regclass('public.chat_calls') is not null then
    create policy "lockdown_chat_calls_select_member" on public.chat_calls
      for select to authenticated
      using (public.is_channel_member(channel_id));
    grant select on public.chat_calls to authenticated;
  end if;

  -- chat_message_reactions: ChatPage realtime * (reaction refresh).
  if to_regclass('public.chat_message_reactions') is not null then
    create policy "lockdown_chat_message_reactions_select_member" on public.chat_message_reactions
      for select to authenticated
      using (user_id = auth.uid() or public.can_view_chat_message(message_id));
    grant select on public.chat_message_reactions to authenticated;
  end if;

  -- forum_comments: ForumTopicPage realtime INSERT (filter topic_id=eq.<id>).
  if to_regclass('public.forum_comments') is not null then
    create policy "lockdown_forum_comments_select_visible" on public.forum_comments
      for select to authenticated
      using (public.can_view_forum_topic(topic_id));
    grant select on public.forum_comments to authenticated;
  end if;

  -- profiles: own row only. Not read directly by the app, but the storage
  -- upload policies (storage-buckets.sql) subquery the caller's own profile.
  if to_regclass('public.profiles') is not null then
    create policy "lockdown_profiles_select_own" on public.profiles
      for select to authenticated
      using (id = auth.uid());
    grant select on public.profiles to authenticated;
  end if;

  -- courses: the storage policy "course-resources insert/delete" joins
  -- public.courses as the uploading teacher/admin, so they must be able to
  -- see their school's courses. Nobody else reads courses directly.
  if to_regclass('public.courses') is not null then
    create policy "lockdown_courses_select_staff" on public.courses
      for select to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or (public.current_user_role() in ('admin', 'teacher')
            and school_id = public.current_user_school_id())
      );
    grant select on public.courses to authenticated;
  end if;
end $$;

-- ─── 4. Functions callable via RPC that the browser never calls ───────────
-- The browser calls no RPCs; the API calls these with the service role.
-- (Supabase grants EXECUTE to anon/authenticated by default, so revoking
-- from PUBLIC alone is not enough.)
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    -- security definer, was granted to authenticated: any user could
    -- overwrite any student's watch progress (video-completion grading)
    'public.upsert_video_watch_progress(uuid, uuid, numeric, numeric, numeric)',
    -- bumps any resource's download counter
    'public.increment_school_resource_download(uuid, uuid)',
    -- security definer; lets anyone probe which internal emails exist
    'public.generate_internal_email(text, text)'
  ] loop
    if to_regprocedure(v_fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
      execute format('grant execute on function %s to service_role', v_fn);
    end if;
  end loop;
end $$;
