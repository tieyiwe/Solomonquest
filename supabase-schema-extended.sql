-- ============================================================
-- SolomonQuest LMS — Extended Schema (appended to supabase-schema.sql)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fix handle_new_user trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. ALTER existing tables
-- ------------------------------------------------------------

-- courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS banner_url    text,
  ADD COLUMN IF NOT EXISTS objectives    text[],
  ADD COLUMN IF NOT EXISTS syllabus      text,
  ADD COLUMN IF NOT EXISTS duration      text;

-- student_applications — extra columns
ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS reviewed_by       uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason  text;

-- student_applications — replace status check constraint
ALTER TABLE public.student_applications
  DROP CONSTRAINT IF EXISTS student_applications_status_check;

ALTER TABLE public.student_applications
  ADD CONSTRAINT student_applications_status_check
  CHECK (status IN ('submitted','received','under_review','finalizing','approved','rejected'));

-- profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_bio text;

-- ------------------------------------------------------------
-- 3. NEW TABLES
-- ------------------------------------------------------------

-- invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'teacher',
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by  uuid REFERENCES public.profiles(id),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','expired')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role        text NOT NULL,
  feature     text NOT NULL,
  is_enabled  boolean NOT NULL DEFAULT true,
  UNIQUE (school_id, role, feature)
);

-- application_form_fields
CREATE TABLE IF NOT EXISTS public.application_form_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label       text NOT NULL,
  field_type  text NOT NULL
                CHECK (field_type IN ('text','paragraph','dropdown','checkbox','date','file','number')),
  is_required boolean NOT NULL DEFAULT false,
  options     jsonb,
  sort_order  int NOT NULL DEFAULT 0
);

-- application_form_responses
CREATE TABLE IF NOT EXISTS public.application_form_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  field_id        uuid NOT NULL REFERENCES public.application_form_fields(id) ON DELETE CASCADE,
  value           text
);

-- application_course_selections
CREATE TABLE IF NOT EXISTS public.application_course_selections (
  application_id  uuid NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, course_id)
);

-- course_resources
CREATE TABLE IF NOT EXISTS public.course_resources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  uploaded_by    uuid REFERENCES public.profiles(id),
  title          text NOT NULL,
  description    text,
  resource_type  text NOT NULL
                   CHECK (resource_type IN ('document','image','video','link','other')),
  file_url       text,
  external_url   text,
  section        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- school_resources
CREATE TABLE IF NOT EXISTS public.school_resources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES public.profiles(id),
  title           text NOT NULL,
  description     text,
  resource_type   text NOT NULL
                    CHECK (resource_type IN ('document','image','video','link','other')),
  file_url        text,
  external_url    text,
  category        text,
  visible_to      jsonb NOT NULL DEFAULT '["admin","teacher","student","staff"]',
  download_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- chat_channels
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  course_id   uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  name        text NOT NULL,
  type        text NOT NULL
                CHECK (type IN ('school','course','direct','private')),
  created_by  uuid REFERENCES public.profiles(id),
  is_private  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- chat_channel_members
CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id  uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

-- chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id        uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES public.profiles(id),
  content           text NOT NULL,
  thread_parent_id  uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_edited         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- forum_topics
CREATE TABLE IF NOT EXISTS public.forum_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  course_id   uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  posted_by   uuid REFERENCES public.profiles(id),
  title       text NOT NULL,
  content     text NOT NULL,
  is_pinned   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- forum_comments
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  posted_by   uuid REFERENCES public.profiles(id),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- forum_reactions
CREATE TABLE IF NOT EXISTS public.forum_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    uuid REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction    text NOT NULL,
  UNIQUE (user_id, topic_id, comment_id)
);

-- video_sessions
CREATE TABLE IF NOT EXISTS public.video_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  started_by  uuid REFERENCES public.profiles(id),
  room_id     text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);

-- quizzes
CREATE TABLE IF NOT EXISTS public.quizzes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  description              text,
  time_limit_minutes       int,
  max_attempts             int NOT NULL DEFAULT 1,
  randomize_questions      boolean NOT NULL DEFAULT false,
  randomize_options        boolean NOT NULL DEFAULT false,
  show_results_immediately boolean NOT NULL DEFAULT true,
  is_published             boolean NOT NULL DEFAULT false,
  created_by               uuid REFERENCES public.profiles(id),
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- quiz_questions
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text  text NOT NULL,
  question_type  text NOT NULL
                   CHECK (question_type IN ('multiple_choice','true_false','short_answer','essay','fill_blank','matching')),
  points         int NOT NULL DEFAULT 1,
  sort_order     int NOT NULL DEFAULT 0,
  explanation    text
);

-- quiz_question_options
CREATE TABLE IF NOT EXISTS public.quiz_question_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_text  text NOT NULL,
  is_correct   boolean NOT NULL DEFAULT false,
  match_text   text,
  sort_order   int NOT NULL DEFAULT 0
);

-- quiz_attempts
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  score         numeric,
  status        text NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','submitted','graded'))
);

-- quiz_answers
CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id         uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id        uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  answer_text        text,
  selected_option_id uuid REFERENCES public.quiz_question_options(id) ON DELETE SET NULL,
  is_correct         boolean,
  points_earned      numeric
);

-- ------------------------------------------------------------
-- 4. Enable RLS on all new tables with open policies
-- ------------------------------------------------------------

-- invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on invitations" ON public.invitations;
CREATE POLICY "Allow all on invitations" ON public.invitations FOR ALL USING (true) WITH CHECK (true);

-- role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on role_permissions" ON public.role_permissions;
CREATE POLICY "Allow all on role_permissions" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);

-- application_form_fields
ALTER TABLE public.application_form_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on application_form_fields" ON public.application_form_fields;
CREATE POLICY "Allow all on application_form_fields" ON public.application_form_fields FOR ALL USING (true) WITH CHECK (true);

-- application_form_responses
ALTER TABLE public.application_form_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on application_form_responses" ON public.application_form_responses;
CREATE POLICY "Allow all on application_form_responses" ON public.application_form_responses FOR ALL USING (true) WITH CHECK (true);

-- application_course_selections
ALTER TABLE public.application_course_selections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on application_course_selections" ON public.application_course_selections;
CREATE POLICY "Allow all on application_course_selections" ON public.application_course_selections FOR ALL USING (true) WITH CHECK (true);

-- course_resources
ALTER TABLE public.course_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on course_resources" ON public.course_resources;
CREATE POLICY "Allow all on course_resources" ON public.course_resources FOR ALL USING (true) WITH CHECK (true);

-- school_resources
ALTER TABLE public.school_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on school_resources" ON public.school_resources;
CREATE POLICY "Allow all on school_resources" ON public.school_resources FOR ALL USING (true) WITH CHECK (true);

-- chat_channels
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on chat_channels" ON public.chat_channels;
CREATE POLICY "Allow all on chat_channels" ON public.chat_channels FOR ALL USING (true) WITH CHECK (true);

-- chat_channel_members
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on chat_channel_members" ON public.chat_channel_members;
CREATE POLICY "Allow all on chat_channel_members" ON public.chat_channel_members FOR ALL USING (true) WITH CHECK (true);

-- chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on chat_messages" ON public.chat_messages;
CREATE POLICY "Allow all on chat_messages" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);

-- forum_topics
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on forum_topics" ON public.forum_topics;
CREATE POLICY "Allow all on forum_topics" ON public.forum_topics FOR ALL USING (true) WITH CHECK (true);

-- forum_comments
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on forum_comments" ON public.forum_comments;
CREATE POLICY "Allow all on forum_comments" ON public.forum_comments FOR ALL USING (true) WITH CHECK (true);

-- forum_reactions
ALTER TABLE public.forum_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on forum_reactions" ON public.forum_reactions;
CREATE POLICY "Allow all on forum_reactions" ON public.forum_reactions FOR ALL USING (true) WITH CHECK (true);

-- video_sessions
ALTER TABLE public.video_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on video_sessions" ON public.video_sessions;
CREATE POLICY "Allow all on video_sessions" ON public.video_sessions FOR ALL USING (true) WITH CHECK (true);

-- quizzes
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on quizzes" ON public.quizzes;
CREATE POLICY "Allow all on quizzes" ON public.quizzes FOR ALL USING (true) WITH CHECK (true);

-- quiz_questions
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on quiz_questions" ON public.quiz_questions;
CREATE POLICY "Allow all on quiz_questions" ON public.quiz_questions FOR ALL USING (true) WITH CHECK (true);

-- quiz_question_options
ALTER TABLE public.quiz_question_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on quiz_question_options" ON public.quiz_question_options;
CREATE POLICY "Allow all on quiz_question_options" ON public.quiz_question_options FOR ALL USING (true) WITH CHECK (true);

-- quiz_attempts
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on quiz_attempts" ON public.quiz_attempts;
CREATE POLICY "Allow all on quiz_attempts" ON public.quiz_attempts FOR ALL USING (true) WITH CHECK (true);

-- quiz_answers
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on quiz_answers" ON public.quiz_answers;
CREATE POLICY "Allow all on quiz_answers" ON public.quiz_answers FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 5. Supabase Realtime
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
