-- Run in the Supabase SQL editor.
--
-- CHAT: DELETE A SINGLE MESSAGE (soft delete)
-- ===========================================
-- DELETE /chat/messages/:id blanks the message's content and attachment and
-- stamps deleted_at / deleted_by instead of removing the row:
-- chat_messages.thread_parent_id is `on delete set null`, so a hard delete
-- would turn every reply of a deleted thread parent into a top-level message.
-- Lists and threads then return the row as a "Message deleted" placeholder.
--
-- Other members see the deletion live through the existing realtime UPDATE
-- subscription on chat_messages (the lockdown SELECT policy already covers
-- it, and chat_messages is already in the supabase_realtime publication).
--
-- Idempotent: safe to re-run.

alter table public.chat_messages add column if not exists deleted_at timestamptz;
alter table public.chat_messages add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- Unread counts filter on deleted_at within a channel.
create index if not exists chat_messages_channel_deleted_idx
  on public.chat_messages (channel_id, created_at)
  where deleted_at is null;
