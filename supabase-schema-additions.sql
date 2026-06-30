/home/user/Solomonquest/supabase-schema-additions.sql
-- Zoom support columns on video_sessions
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS provider text DEFAULT 'jitsi' CHECK (provider IN ('jitsi', 'zoom'));
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS join_url text;
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS start_url text;
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS zoom_meeting_id text;

-- Ensure school names are unique (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS schools_name_unique ON schools (LOWER(name));

-- School name uniqueness note: enforced at DB level via unique index above
-- The API should also check and return a friendly error message

-- School branding columns
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#4f46e5';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#7c3aed';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS heading_font text DEFAULT 'Inter';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS heading_color text DEFAULT '#1e1b4b';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS banner_url text;

-- ─── Internal email for all users ────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS internal_email text UNIQUE;

-- Function to generate a unique internal email: firstname + lastNameInitial @solomonquest.com
-- e.g. John Doe → johnd@solomonquest.com
-- Conflicts get a numeric suffix: johnd2@solomonquest.com, johnd3@solomonquest.com, ...
CREATE OR REPLACE FUNCTION public.generate_internal_email(
  p_first_name text,
  p_last_name text
) RETURNS text AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_counter int := 1;
BEGIN
  -- Build base: lowercase firstname + lowercase first letter of lastname
  v_base := LOWER(REGEXP_REPLACE(COALESCE(p_first_name, 'user'), '[^a-z]', '', 'g'))
    || LOWER(LEFT(REGEXP_REPLACE(COALESCE(p_last_name, ''), '[^a-zA-Z]', '', 'g'), 1));

  -- Fallback if base is empty
  IF v_base = '' OR v_base IS NULL THEN
    v_base := 'user';
  END IF;

  v_candidate := v_base || '@solomonquest.com';

  -- Loop until we find a unique email
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE internal_email = v_candidate) LOOP
    v_counter := v_counter + 1;
    v_candidate := v_base || v_counter::text || '@solomonquest.com';
  END LOOP;

  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update handle_new_user trigger to also set internal_email
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

  -- Generate unique student ID: school initials + epoch-based suffix
  SELECT UPPER(LEFT(name, 2)) INTO v_school_initials FROM public.schools LIMIT 1;
  v_unique_id := COALESCE(v_school_initials, 'SQ') || '-'
    || LPAD((EXTRACT(EPOCH FROM now())::bigint % 100000000)::text, 8, '0');

  INSERT INTO public.profiles (id, first_name, last_name, unique_student_id, internal_email)
  VALUES (
    new.id,
    v_first_name,
    v_last_name,
    v_unique_id,
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

-- Backfill internal_email for any existing profiles that don't have one yet
UPDATE public.profiles
SET internal_email = public.generate_internal_email(first_name, last_name)
WHERE internal_email IS NULL;

-- ─── School branding enhancements ─────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS banner_slides jsonb DEFAULT '[]'::jsonb;
-- Each slide: { id, image_url, title, subtitle, cta_text, cta_url, overlay_color, overlay_opacity }

ALTER TABLE schools ADD COLUMN IF NOT EXISTS hero_animation text DEFAULT 'fade'
  CHECK (hero_animation IN ('fade', 'slide', 'zoom', 'bounce', 'none'));

ALTER TABLE schools ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#f59e0b';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS body_font text DEFAULT 'Inter';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS border_radius text DEFAULT 'rounded'
  CHECK (border_radius IN ('sharp', 'rounded', 'pill'));
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stats_visible boolean DEFAULT true;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stats jsonb DEFAULT '[]'::jsonb;
-- Each stat: { label, value, icon }  e.g. { label: "Students", value: "500+", icon: "users" }

ALTER TABLE schools ADD COLUMN IF NOT EXISTS features_section jsonb DEFAULT '[]'::jsonb;
-- Each feature: { icon, title, description }

ALTER TABLE schools ADD COLUMN IF NOT EXISTS testimonials jsonb DEFAULT '[]'::jsonb;
-- Each testimonial: { name, role, quote, avatar_url }

ALTER TABLE schools ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb;
-- { facebook, twitter, instagram, linkedin, youtube, website }

ALTER TABLE schools ADD COLUMN IF NOT EXISTS announcement_banner text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS announcement_color text DEFAULT '#4f46e5';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS show_announcement boolean DEFAULT false;

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools,
  created_by uuid REFERENCES profiles,
  target_user_id uuid REFERENCES profiles,
  target_role text,  -- if set, sends to all users of this role in school
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

-- ─── Internal messaging ───────────────────────────────────────────────────────
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
  deleted_by jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_all" ON internal_messages;
CREATE POLICY "messages_all" ON internal_messages FOR ALL USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
ALTER PUBLICATION supabase_realtime ADD TABLE internal_messages;

-- ─── Super Admin Platform Tables ──────────────────────────────────────────────

-- Platform-level audit log (every significant action)
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles,
  actor_email text,
  action text NOT NULL,
  target_type text,   -- 'school' | 'user' | 'course' | 'platform'
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

-- School deletion requests (from school admin requesting deletion)
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

-- School soft-delete archive (30-day backup before permanent delete)
CREATE TABLE IF NOT EXISTS school_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  school_data jsonb NOT NULL,    -- full snapshot of school row
  stats_snapshot jsonb,          -- { students, teachers, courses, enrollments } at time of deletion
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

-- Platform settings
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

-- Insert defaults for platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('max_schools_per_admin', '1'::jsonb),
  ('max_students_per_school', '10000'::jsonb),
  ('max_courses_per_school', '500'::jsonb),
  ('allow_school_registration', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_message', '"Platform is under maintenance. Please check back later."'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Internal messages (in-platform email)
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
ALTER PUBLICATION supabase_realtime ADD TABLE internal_messages;

-- ─── Role-based unique ID prefix support ──────────────────────────────────────

-- Function to generate prefixed unique ID based on role
CREATE OR REPLACE FUNCTION generate_unique_id_for_role(
  p_role TEXT,
  p_school_initials TEXT
) RETURNS TEXT AS $$
DECLARE
  prefix TEXT := '';
  id_num BIGINT;
BEGIN
  IF p_role = 'teacher' THEN prefix := 'T-';
  ELSIF p_role = 'staff' THEN prefix := 'S-';
  END IF;
  id_num := EXTRACT(EPOCH FROM NOW())::BIGINT % 100000000;
  RETURN prefix || p_school_initials || '-' || LPAD(id_num::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to update unique_student_id prefix when role changes
CREATE OR REPLACE FUNCTION handle_role_change_id() RETURNS TRIGGER AS $$
DECLARE
  school_initials TEXT := 'SQ';
  school_name TEXT;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NEW.unique_student_id IS NOT NULL THEN
    -- Get school initials
    SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^A-Za-z ]', '', 'g'), 2))
    INTO school_initials
    FROM schools WHERE id = NEW.school_id;
    IF school_initials IS NULL OR school_initials = '' THEN school_initials := 'SQ'; END IF;

    -- Rewrite prefix based on new role, keep existing number portion
    DECLARE
      num_part TEXT := REGEXP_REPLACE(NEW.unique_student_id, '^[TSts]-?[A-Z]+-', '');
    BEGIN
      IF NEW.role = 'teacher' THEN
        NEW.unique_student_id := 'T-' || school_initials || '-' || num_part;
      ELSIF NEW.role = 'staff' THEN
        NEW.unique_student_id := 'S-' || school_initials || '-' || num_part;
      ELSE
        -- student or other: no prefix
        NEW.unique_student_id := school_initials || '-' || num_part;
      END IF;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_role_change_update_id ON profiles;
CREATE TRIGGER on_role_change_update_id
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_role_change_id();
