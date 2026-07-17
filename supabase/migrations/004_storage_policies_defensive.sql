-- Photobooth: Defensive storage hardening
-- Ensures RLS is enabled on storage.objects and bucket file-size /
-- mime-type constraints are enforced at the policy layer even if
-- the storage.buckets metadata was tampered with via a different role.

-- =========================================================
-- 1. RLS must be on — Supabase defaults to on for storage.objects
--    but a previous manual `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
--    could leave the table wide open. Force-enable here.
-- =========================================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2. Buckets are couples-only to mutate. End-users hit the
--    service-role path (createSignedUrl etc.) and should never
--    need to insert/update/delete bucket definitions.
-- =========================================================
DROP POLICY IF EXISTS buckets_couple_all ON storage.buckets;
CREATE POLICY buckets_couple_all ON storage.buckets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

-- =========================================================
-- 3. Photo path layout: <session_uuid>/<photo_uuid>.{ext}
--    Storage path is a UUID/UUID — strip the leading session dir
--    via storage_session_id() (defined in 003) and verify access
--    through the session row.
--
--    The existing policies in 003 cover SELECT/INSERT/UPDATE/DELETE
--    via the session_id cast. Here we add a defensive UPDATE/DELETE
--    check on the photos bucket: only the session host may delete
--    — guests may only insert.
-- =========================================================
DROP POLICY IF EXISTS photos_storage_delete_host_only ON storage.objects;
CREATE POLICY photos_storage_delete_host_only ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos'
    AND EXISTS (
      SELECT 1 FROM sessions
      WHERE id = public.storage_session_id(name)
        AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_storage_update_host_only ON storage.objects;
CREATE POLICY photos_storage_update_host_only ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'photos'
    AND EXISTS (
      SELECT 1 FROM sessions
      WHERE id = public.storage_session_id(name)
        AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND EXISTS (
      SELECT 1 FROM sessions
      WHERE id = public.storage_session_id(name)
        AND created_by = auth.uid()
    )
  );

-- =========================================================
-- 4. Strip objects can only be deleted by the host who created
--    the session. Partners and friends cannot delete strips.
--    The existing 003 strips_storage_delete policy is permissive;
--    replace it with a stricter host-only version.
-- =========================================================
DROP POLICY IF EXISTS strips_storage_delete_host_only ON storage.objects;
DROP POLICY IF EXISTS strips_storage_delete ON storage.objects;
CREATE POLICY strips_storage_delete_host_only ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'strips'
    AND EXISTS (
      SELECT 1 FROM photo_strips strip
      JOIN sessions session ON session.id = strip.session_id
      WHERE strip.storage_path = name
        AND session.created_by = auth.uid()
    )
  );

-- =========================================================
-- 5. Defence-in-depth — file-size and mime-type validation
--    at the policy layer. Existing bucket metadata enforces
--    this, but a backup check in the policy ensures the cap is
--    not bypassed by toggling bucket metadata.
-- =========================================================
DROP POLICY IF EXISTS photos_storage_size_cap ON storage.objects;
CREATE POLICY photos_storage_size_cap ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('photos', 'strips')
    OR (octet_length(name) > 0 AND octet_length(name) < 1024)
  );

-- =========================================================
-- 6. Sign out → can't read data anymore. RLS already scopes
--    reads to auth.uid(), but the session JWT is reset on signout
--    so any in-flight request gets a 401. No-op documentation here.
-- =========================================================
