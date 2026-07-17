-- Photobooth: Storage policies and friend write access

ALTER TABLE themes ADD COLUMN IF NOT EXISTS preview_color TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('photos', 'photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('strips', 'strips', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.storage_session_id(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN split_part(object_name, '/', 1)::UUID;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS sessions_friend_update_host ON sessions;
CREATE POLICY sessions_friend_update_host ON sessions FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS photos_friend_insert ON photos;
CREATE POLICY photos_friend_insert ON photos FOR INSERT TO authenticated
  WITH CHECK (
    taken_by = auth.uid()
    AND session_id IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_friend_delete ON photos;
CREATE POLICY photos_friend_delete ON photos FOR DELETE TO authenticated
  USING (taken_by = auth.uid());

DROP POLICY IF EXISTS strips_friend_insert ON photo_strips;
CREATE POLICY strips_friend_insert ON photo_strips FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS strips_friend_update ON photo_strips;
CREATE POLICY strips_friend_update ON photo_strips FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS strips_friend_delete ON photo_strips;
CREATE POLICY strips_friend_delete ON photo_strips FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_storage_select ON storage.objects;
CREATE POLICY photos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos'
    AND public.storage_session_id(name) IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_storage_insert ON storage.objects;
CREATE POLICY photos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND public.storage_session_id(name) IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_storage_update ON storage.objects;
CREATE POLICY photos_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'photos'
    AND public.storage_session_id(name) IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND public.storage_session_id(name) IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS photos_storage_delete ON storage.objects;
CREATE POLICY photos_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos'
    AND public.storage_session_id(name) IN (
      SELECT id FROM sessions
      WHERE created_by = auth.uid() OR partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS strips_storage_select ON storage.objects;
CREATE POLICY strips_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'strips'
    AND EXISTS (
      SELECT 1 FROM photo_strips strip
      JOIN sessions session ON session.id = strip.session_id
      WHERE strip.storage_path = name
        AND (session.created_by = auth.uid() OR session.partner_id = auth.uid())
        AND (strip.is_private = false OR session.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS strips_storage_insert ON storage.objects;
CREATE POLICY strips_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'strips'
    AND split_part(name, '/', 1)::UUID IN (
      SELECT strip.id FROM photo_strips strip
      JOIN sessions session ON session.id = strip.session_id
      WHERE session.created_by = auth.uid() OR session.partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS strips_storage_update ON storage.objects;
CREATE POLICY strips_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'strips'
    AND split_part(name, '/', 1)::UUID IN (
      SELECT strip.id FROM photo_strips strip
      JOIN sessions session ON session.id = strip.session_id
      WHERE session.created_by = auth.uid() OR session.partner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'strips'
    AND split_part(name, '/', 1)::UUID IN (
      SELECT strip.id FROM photo_strips strip
      JOIN sessions session ON session.id = strip.session_id
      WHERE session.created_by = auth.uid() OR session.partner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS strips_storage_delete ON storage.objects;
CREATE POLICY strips_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'strips'
    AND split_part(name, '/', 1)::UUID IN (
      SELECT strip.id FROM photo_strips strip
      JOIN sessions session ON session.id = strip.session_id
      WHERE session.created_by = auth.uid() OR session.partner_id = auth.uid()
    )
  );
