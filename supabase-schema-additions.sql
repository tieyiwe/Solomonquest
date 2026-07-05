-- SolomonQuest schema additions — run this in your Supabase SQL Editor

-- ─── Video sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses,
  started_by uuid REFERENCES profiles,
  provider text DEFAULT 'jitsi' CHECK (provider IN ('jitsi', 'zoom')),
  room_name text,
  join_url text,
  start_url text,
  zoom_meeting_id text,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_sessions_all" ON video_sessions;
CREATE POLICY "video_sessions_all" ON video_sessions FOR ALL USING (true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_sessions;
  END IF;
END $$;

-- ─── School uniqueness ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS schools_name_unique ON schools (LOWER(name));

-- ─── School branding columns ──────────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#4f46e5';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#7c3aed';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS heading_font text DEFAULT 'Inter';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS heading_color text DEFAULT '#1e1b4b';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS banner_slides jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS hero_animation text DEFAULT 'fade'
  CHECK (hero_animation IN ('fade', 'slide', 'zoom', 'bounce', 'none'));
ALTER TABLE schools ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#f59e0b';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS body_font text DEFAULT 'Inter';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS border_radius text DEFAULT 'rounded'
  CHECK (border_radius IN ('sharp', 'rounded', 'pill'));
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stats_visible boolean DEFAULT true;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stats jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS features_section jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS testimonials jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS announcement_banner text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS announcement_color text DEFAULT '#4f46e5';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS show_announcement boolean DEFAULT false;

-- ─── Profile columns ──────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS internal_email text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unique_student_id text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS online_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- ─── Internal email generation ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_internal_email(
  p_first_name text,
  p_last_name text
) RETURNS text AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_counter int := 1;
BEGIN
  v_base := LOWER(REGEXP_REPLACE(COALESCE(p_first_name, 'user'), '[^a-z]', '', 'g'))
    || LOWER(LEFT(REGEXP_REPLACE(COALESCE(p_last_name, ''), '[^a-zA-Z]', '', 'g'), 1));
  IF v_base = '' OR v_base IS NULL THEN v_base := 'user'; END IF;
  v_candidate := v_base || '@solomonquest.com';
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE internal_email = v_candidate) LOOP
    v_counter := v_counter + 1;
    v_candidate := v_base || v_counter::text || '@solomonquest.com';
  END LOOP;
  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── New user trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_first_name text;
  v_last_name  text;
  v_unique_id  text;
  v_school_initials text;
BEGIN
  v_first_name := COALESCE(new.raw_user_meta_data->>'first_name', '');
  v_last_name  := COALESCE(new.raw_user_meta_data->>'last_name', '');
  SELECT UPPER(LEFT(name, 2)) INTO v_school_initials FROM public.schools LIMIT 1;
  v_unique_id := COALESCE(v_school_initials, 'SQ') || '-'
    || LPAD((EXTRACT(EPOCH FROM now())::bigint % 100000000)::text, 8, '0');
  INSERT INTO public.profiles (id, first_name, last_name, unique_student_id, internal_email)
  VALUES (
    new.id, v_first_name, v_last_name, v_unique_id,
    public.generate_internal_email(v_first_name, v_last_name)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill internal_email for existing profiles
UPDATE public.profiles
SET internal_email = public.generate_internal_email(first_name, last_name)
WHERE internal_email IS NULL;

-- ─── Role-based unique ID prefix ─────────────────────────────────────────────
-- When a user's role changes, their unique ID gets the correct prefix:
--   teacher → T-SQ-XXXXXXXX   staff → S-SQ-XXXXXXXX   student → SQ-XXXXXXXX
CREATE OR REPLACE FUNCTION handle_role_change_id() RETURNS TRIGGER AS $$
DECLARE
  v_initials TEXT := 'SQ';
  v_num_part TEXT;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NEW.unique_student_id IS NOT NULL THEN
    SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^A-Za-z ]', '', 'g'), 2))
    INTO v_initials FROM schools WHERE id = NEW.school_id;
    IF v_initials IS NULL OR v_initials = '' THEN v_initials := 'SQ'; END IF;
    v_num_part := REGEXP_REPLACE(NEW.unique_student_id, '^([TS]-)?[A-Z]+-', '');
    IF NEW.role = 'teacher' THEN
      NEW.unique_student_id := 'T-' || v_initials || '-' || v_num_part;
    ELSIF NEW.role = 'staff' THEN
      NEW.unique_student_id := 'S-' || v_initials || '-' || v_num_part;
    ELSE
      NEW.unique_student_id := v_initials || '-' || v_num_part;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_role_change_update_id ON profiles;
CREATE TRIGGER on_role_change_update_id
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_role_change_id();

-- ─── Reminders ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools,
  created_by uuid REFERENCES profiles,
  target_user_id uuid REFERENCES profiles,
  target_role text,
  course_id uuid REFERENCES courses,
  message text NOT NULL,
  send_at timestamptz NOT NULL,
  sent boolean DEFAULT false,
  type text CHECK (type IN ('admin_to_teacher', 'teacher_to_student')) DEFAULT 'admin_to_teacher',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminders_all" ON reminders;
CREATE POLICY "reminders_all" ON reminders FOR ALL USING (true);

-- ─── Internal messaging (in-platform email) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools,
  from_user_id uuid REFERENCES profiles NOT NULL,
  to_user_id uuid REFERENCES profiles NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  parent_id uuid REFERENCES internal_messages,
  thread_id uuid,
  deleted_by jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_rls" ON internal_messages;
CREATE POLICY "messages_rls" ON internal_messages FOR ALL USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'internal_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE internal_messages;
  END IF;
END $$;

-- ─── Super Admin Platform Tables ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_name text,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_superadmin" ON platform_audit_log;
CREATE POLICY "audit_log_superadmin" ON platform_audit_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE TABLE IF NOT EXISTS school_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools NOT NULL,
  school_name text NOT NULL,
  requested_by uuid REFERENCES profiles NOT NULL,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  reviewed_by uuid REFERENCES profiles,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE school_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deletion_requests_policy" ON school_deletion_requests;
CREATE POLICY "deletion_requests_policy" ON school_deletion_requests FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS school_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  school_data jsonb NOT NULL,
  stats_snapshot jsonb,
  deleted_by uuid REFERENCES profiles,
  deletion_request_id uuid REFERENCES school_deletion_requests,
  restore_deadline timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  restored_at timestamptz,
  permanently_deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE school_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "archive_superadmin" ON school_archive;
CREATE POLICY "archive_superadmin" ON school_archive FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES profiles,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_settings_superadmin" ON platform_settings;
CREATE POLICY "platform_settings_superadmin" ON platform_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

INSERT INTO platform_settings (key, value) VALUES
  ('max_schools_per_admin', '1'::jsonb),
  ('max_students_per_school', '10000'::jsonb),
  ('max_courses_per_school', '500'::jsonb),
  ('allow_school_registration', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_message', '"Platform is under maintenance. Please check back later."'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Forum topic cover image
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS cover_image text;

-- Branding extended columns
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_css text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS branding jsonb DEFAULT '{}'::jsonb;

-- ─── Invitations status column ─────────────────────────────────────────────────
-- supabase-schema.sql's invitations table was created without a `status` column,
-- but the API reads/writes it on every request, so invites failed silently.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_status_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_status_check
  CHECK (status IN ('pending','accepted','expired'));
UPDATE public.invitations SET status = 'accepted' WHERE accepted_at IS NOT NULL AND status = 'pending';
UPDATE public.invitations SET status = 'expired' WHERE accepted_at IS NULL AND expires_at < now() AND status = 'pending';

-- ─── Course resources publish workflow ─────────────────────────────────────────
-- Resources previously showed to students the instant a teacher added them.
-- Add a draft/publish gate matching assignments and quizzes.
ALTER TABLE public.course_resources ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
-- Existing resources were already visible to students; keep that behavior on upgrade.
UPDATE public.course_resources SET is_published = true WHERE is_published IS NOT true;

-- ─── Structured course semester/term dates ─────────────────────────────────────
-- courses.term stays a free-text label (e.g. "Spring 2026" or a custom name),
-- but admins can now also pin down real start/end dates for that term so the
-- transcript can show accurate semester dates regardless of which label was
-- picked (standard or custom).
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS term_start_date date;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS term_end_date date;

-- Defensive: the "transcripts" table is referenced by the grading routes but
-- had no tracked migration in this repo. Create it if it doesn't already
-- exist so fresh environments don't 500 on every grade/transcript call.
CREATE TABLE IF NOT EXISTS public.transcripts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  course_id      uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  assignment_id  uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  submission_id  uuid UNIQUE,
  grade          text,
  feedback       text,
  graded_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on transcripts" ON public.transcripts;
CREATE POLICY "Allow all on transcripts" ON public.transcripts FOR ALL USING (true) WITH CHECK (true);

-- ─── Backfill chat_channels columns ────────────────────────────────────────────
-- On some environments chat_channels was created before this table's full
-- definition existed, so CREATE TABLE IF NOT EXISTS in schema-extended.sql
-- silently skipped it and it's missing columns the app requires (seen as
-- "Could not find the 'type' column of 'chat_channels' in the schema cache").
--
-- Some of those environments also used a legacy column name, channel_type,
-- that is NOT NULL with no default — simply adding a separate `type` column
-- (as an earlier version of this migration did) left channel_type's NOT NULL
-- requirement in place, so every insert (which only sets `type`) then failed
-- with "null value in column channel_type violates not-null constraint".
-- Migrate off channel_type onto `type` wholesale if it's present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_channels' AND column_name = 'channel_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'chat_channels' AND column_name = 'type'
    ) THEN
      ALTER TABLE public.chat_channels ADD COLUMN type text;
    END IF;
    UPDATE public.chat_channels SET type = channel_type WHERE type IS NULL;
    ALTER TABLE public.chat_channels ALTER COLUMN channel_type DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS type text;
UPDATE public.chat_channels SET type = 'private' WHERE type IS NULL;
ALTER TABLE public.chat_channels ALTER COLUMN type SET NOT NULL;
ALTER TABLE public.chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels ADD CONSTRAINT chat_channels_type_check CHECK (type IN ('school','course','direct','private'));
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- ─── chat_calls table ───────────────────────────────────────────────────────────
-- Referenced by the chat video-call routes but had no tracked migration.
CREATE TABLE IF NOT EXISTS public.chat_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  jitsi_room  text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on chat_calls" ON public.chat_calls;
CREATE POLICY "Allow all on chat_calls" ON public.chat_calls FOR ALL USING (true) WITH CHECK (true);

-- ─── Backfill chat_messages columns ────────────────────────────────────────────
-- Same story as chat_channels: this environment's chat_messages table predates
-- its full column set, so it was missing thread_parent_id (seen as "Could not
-- find the 'thread_parent_id' column of 'chat_messages' in the schema cache").
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS thread_parent_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- ─── Channel archiving ──────────────────────────────────────────────────────────
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- ─── In-app ringing calls ───────────────────────────────────────────────────────
-- Who started a call, so other members' clients know to ring (and the
-- initiator's own client knows not to ring itself), plus realtime delivery
-- of new calls / call-ended so the incoming-call UI and the caller's view
-- both update live.
ALTER TABLE public.chat_calls ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls;
  END IF;
END $$;

-- Force PostgREST to pick up the columns above immediately instead of
-- waiting for its schema cache to refresh on its own.
NOTIFY pgrst, 'reload schema';
