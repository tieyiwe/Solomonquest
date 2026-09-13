-- Run in the Supabase SQL editor.
--
-- forum_reactions was defined inconsistently across the schema files
-- (a 4-column unique constraint in one, a 3-column one in another), and
-- neither actually enforces "one reaction per user per topic/comment" —
-- a plain UNIQUE(user_id, topic_id, comment_id) treats every NULL
-- comment_id (on a topic reaction) as distinct from every other NULL,
-- so it never collides and never blocks a duplicate. The app's upsert
-- calls (onConflict: "topic_id,user_id" / "comment_id,user_id") need a
-- real constraint matching exactly those column pairs to work at all.
--
-- Partial unique indexes fix this correctly: one for topic reactions
-- (only rows where comment_id is null), one for comment reactions (only
-- rows where topic_id is null).

drop index if exists public.forum_reactions_topic_user_idx;
create unique index forum_reactions_topic_user_idx
  on public.forum_reactions (topic_id, user_id)
  where comment_id is null;

drop index if exists public.forum_reactions_comment_user_idx;
create unique index forum_reactions_comment_user_idx
  on public.forum_reactions (comment_id, user_id)
  where topic_id is null;

-- If either statement above fails with "could not create unique index"
-- because existing duplicate rows already violate it, run this first to
-- keep only the most recent reaction per user per topic/comment, then
-- re-run the two statements above:
--
-- delete from public.forum_reactions a using public.forum_reactions b
--   where a.topic_id = b.topic_id and a.user_id = b.user_id
--     and a.comment_id is null and b.comment_id is null
--     and a.created_at < b.created_at;
-- delete from public.forum_reactions a using public.forum_reactions b
--   where a.comment_id = b.comment_id and a.user_id = b.user_id
--     and a.topic_id is null and b.topic_id is null
--     and a.created_at < b.created_at;
