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
