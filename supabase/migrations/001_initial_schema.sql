-- Photobooth: Initial Schema
-- Run this in Supabase SQL Editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE app_role AS ENUM ('couple', 'friend');
CREATE TYPE session_mode AS ENUM ('single', 'dual');
CREATE TYPE strip_layout AS ENUM ('strip_4', 'grid_2x2', 'polaroid', 'single');

-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'friend',
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Themes
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  manifest_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  mode session_mode NOT NULL DEFAULT 'single',
  partner_id UUID REFERENCES profiles(id),
  theme_id UUID REFERENCES themes(id),
  layout strip_layout NOT NULL DEFAULT 'strip_4',
  room_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Photos
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  taken_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Photo strips
CREATE TABLE photo_strips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  layout strip_layout NOT NULL DEFAULT 'strip_4',
  theme_id UUID REFERENCES themes(id),
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Favorites
CREATE TABLE favorites (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strip_id UUID NOT NULL REFERENCES photo_strips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, strip_id)
);

-- Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  invited_email TEXT,
  room_code TEXT UNIQUE,
  accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sessions_created_by ON sessions(created_by);
CREATE INDEX idx_sessions_partner ON sessions(partner_id);
CREATE INDEX idx_sessions_room_code ON sessions(room_code) WHERE room_code IS NOT NULL;
CREATE INDEX idx_photos_session ON photos(session_id);
CREATE INDEX idx_photo_strips_session ON photo_strips(session_id);
CREATE INDEX idx_photo_strips_created ON photo_strips(created_at DESC);
CREATE INDEX idx_favorites_profile ON favorites(profile_id);

-- Seed themes
INSERT INTO themes (slug, display_name, manifest_url, sort_order) VALUES
  ('hundred-acre-gang', 'Hundred Acre Gang', '/themes/hundred-acre-gang/manifest.json', 0),
  ('pucca', 'Pucca', '/themes/pucca/manifest.json', 1),
  ('hello-kitty', 'Hello Kitty', '/themes/hello-kitty/manifest.json', 2),
  ('minimal', 'Minimal', '/themes/minimal/manifest.json', 3);

-- RLS: Enable
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_strips ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

-- RLS: Themes (read all)
CREATE POLICY themes_read_all ON themes FOR SELECT TO authenticated USING (true);

-- RLS: Profiles (read all, update own)
CREATE POLICY profiles_read_all ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- RLS: Sessions (couple = all, friend = own + partnered)
CREATE POLICY sessions_couple_all ON sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

CREATE POLICY sessions_friend_own ON sessions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
    AND (created_by = auth.uid() OR partner_id = auth.uid())
  );

-- RLS: Photos (couple = all, friend = from own sessions)
CREATE POLICY photos_couple_all ON photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

CREATE POLICY photos_friend_own ON photos FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
    AND session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid() OR partner_id = auth.uid())
  );

-- RLS: Photo Strips (couple = all, friend = non-private from own sessions)
CREATE POLICY strips_couple_all ON photo_strips FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

CREATE POLICY strips_friend_own ON photo_strips FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
    AND is_private = false
    AND session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid() OR partner_id = auth.uid())
  );

-- RLS: Favorites (own only)
CREATE POLICY favorites_own ON favorites FOR ALL TO authenticated
  USING (profile_id = auth.uid());

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'display_name', ''), 'friend');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
