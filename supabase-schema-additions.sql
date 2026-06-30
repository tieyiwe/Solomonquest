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
