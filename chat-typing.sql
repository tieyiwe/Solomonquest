-- Run in the Supabase SQL editor (after rls-lockdown.sql).
--
-- CHAT: PRIVACY-SAFE "TYPING…" INDICATOR
-- ======================================
-- The chat page broadcasts "typing" over a Supabase Realtime channel named
-- `typing:<chat channel uuid>`, joined as a PRIVATE channel:
--
--   supabase.channel('typing:<channelId>', { config: { private: true } })
--
-- A public broadcast channel would let anyone holding the anon key and a
-- channel id watch who is typing. With Realtime Authorization, joining a
-- private channel (receiving) is checked against SELECT policies on
-- realtime.messages and sending a broadcast against INSERT policies, with
-- realtime.topic() returning the topic being joined. This file adds exactly
-- two policies, both `to authenticated`, that allow broadcast on a topic
-- only when it is `typing:<uuid>` and the caller is a member of that chat
-- channel (public.is_channel_member, from rls-lockdown.sql). Every other
-- topic, a malformed id, anon users and presence are denied.
--
-- If this file has not been run, joins are refused and the app silently
-- turns the indicator off (no errors, no toasts).
--
-- Assumptions (Supabase Realtime Authorization; the docs could not be
-- fetched from this environment, so the file is written defensively):
--   * the table is realtime.messages with a text column `extension` whose
--     value is 'broadcast' for broadcast messages ('presence' for presence);
--   * realtime.topic() returns the joined topic WITHOUT the client-side
--     "realtime:" prefix, i.e. exactly 'typing:<uuid>';
--   * private channels need supabase-js >= 2.44 / realtime-js with the
--     `private` channel option (installed: 2.108.2), and Realtime
--     Authorization available on the project (all hosted projects).
-- If realtime.messages or realtime.topic() does not exist, the policy step
-- is skipped with a NOTICE instead of failing.
--
-- Idempotent: safe to re-run.

-- ─── Membership helper (normally created by rls-lockdown.sql) ─────────────
do $$
begin
  if to_regprocedure('public.is_channel_member(uuid)') is null then
    execute $fn$
      create function public.is_channel_member(p_channel_id uuid)
      returns boolean
      language plpgsql
      stable
      security definer
      set search_path = public
      as $body$
      begin
        if auth.uid() is null or p_channel_id is null then return false; end if;
        return exists (
          select 1 from public.chat_channel_members m
          where m.channel_id = p_channel_id and m.user_id = auth.uid()
        );
      end;
      $body$
    $fn$;
  end if;
end $$;

revoke execute on function public.is_channel_member(uuid) from public, anon;
grant execute on function public.is_channel_member(uuid) to authenticated, service_role;

-- ─── Topic parser ────────────────────────────────────────────────────────
-- 'typing:<uuid>' → the uuid; anything else → null (never an error: the
-- regex is checked before the cast, so a non-uuid topic can't raise
-- invalid_text_representation inside a policy). is_channel_member(null)
-- is false, so null means deny.
create or replace function public.chat_typing_channel_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null
     or p_topic !~* '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return substr(p_topic, 8)::uuid;
end;
$$;

revoke execute on function public.chat_typing_channel_id(text) from public, anon;
grant execute on function public.chat_typing_channel_id(text) to authenticated, service_role;

-- ─── Policies on realtime.messages ───────────────────────────────────────
do $$
begin
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null then
    raise notice 'chat-typing: realtime.messages / realtime.topic() not found, skipping policies (typing indicator stays off)';
    return;
  end if;

  -- Supabase ships realtime.messages with RLS on; make sure, but don't fail
  -- if this role doesn't own the table.
  begin
    execute 'alter table realtime.messages enable row level security';
  exception when insufficient_privilege then
    raise notice 'chat-typing: could not (re-)enable RLS on realtime.messages (not owner); assuming it is on';
  end;

  execute 'drop policy if exists "chat_typing_select_member" on realtime.messages';
  execute 'drop policy if exists "chat_typing_insert_member" on realtime.messages';

  -- Receive (join + read broadcasts) on typing:<id> — members of <id> only.
  execute $p$
    create policy "chat_typing_select_member" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and public.is_channel_member(public.chat_typing_channel_id((select realtime.topic())))
      )
  $p$;

  -- Send broadcasts on typing:<id> — members of <id> only.
  execute $p$
    create policy "chat_typing_insert_member" on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension = 'broadcast'
        and public.is_channel_member(public.chat_typing_channel_id((select realtime.topic())))
      )
  $p$;
end $$;
