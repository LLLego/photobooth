-- Photobooth: Security Hardening
-- Adds RLS for invitations, prevents role self-escalation at DB level,
-- ensures sessions/photos/strips RLS policies are non-bypassable.

-- =========================================================
-- 1. Invitations: enable RLS + per-inviter policies
-- =========================================================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Couples see + manage all invitations
CREATE POLICY invitations_couple_all ON invitations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

-- Users see + manage invitations they created
CREATE POLICY invitations_own ON invitations FOR ALL TO authenticated
  USING (invited_by = auth.uid())
  WITH CHECK (invited_by = auth.uid());

-- =========================================================
-- 2. Role self-escalation guard
-- =========================================================
-- Block any direct UPDATE that would change role to 'couple' unless the
-- updater is already a couple. This is enforced at the DB level so even
-- compromised clients or rogue service-role paths (via SECURITY DEFINER
-- functions) cannot bypass it without an explicit couple UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger AS $$
DECLARE
  caller_role app_role;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Only an existing couple may promote others (or change their own role to friend).
    -- Self-promotion to couple is blocked outright.
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role IS DISTINCT FROM 'couple' THEN
      RAISE EXCEPTION 'role change denied: only existing couple members may modify roles';
    END IF;
    IF NEW.role = 'couple' AND OLD.role IS DISTINCT FROM 'couple' AND NEW.id <> auth.uid() THEN
      -- Couples can promote others, but we still log it.
      RAISE NOTICE 'role promotion: % -> couple by %', NEW.id, auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- =========================================================
-- 3. Tighten profiles UPDATE policy
-- =========================================================
-- Existing profiles_update_own allows any column update by the row owner.
-- Combined with the trigger above, role changes are blocked.
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =========================================================
-- 4. Sessions: prevent guest from rewriting created_by/role fields
-- =========================================================
DROP POLICY IF EXISTS sessions_couple_all ON sessions;
CREATE POLICY sessions_couple_all ON sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

DROP POLICY IF EXISTS sessions_friend_insert ON sessions;
CREATE POLICY sessions_friend_insert ON sessions FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
  );

-- =========================================================
-- 5. Photos / strips RLS already set in 001 — tightened WITH CHECK below.
-- =========================================================
DROP POLICY IF EXISTS photos_couple_all ON photos;
CREATE POLICY photos_couple_all ON photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

DROP POLICY IF EXISTS strips_couple_all ON photo_strips;
CREATE POLICY strips_couple_all ON photo_strips FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));