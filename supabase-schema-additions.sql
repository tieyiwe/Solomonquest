/home/user/Solomonquest/supabase-schema-additions.sql
-- Zoom support columns on video_sessions
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS provider text DEFAULT 'jitsi' CHECK (provider IN ('jitsi', 'zoom'));
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS join_url text;
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS start_url text;
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS zoom_meeting_id text;
