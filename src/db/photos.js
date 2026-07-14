import { requireSupabase } from './supabase.js';

const BUCKET = 'photos';

async function uploadBlob(blob, path) {
  const c = requireSupabase();
  const { data, error } = await c.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: blob.type || 'image/webp',
  });
  if (error) throw error;
  return data?.path || path;
}

function buildPath(sessionId, position, blob) {
  const ext = (blob?.type?.includes('png') ? 'png' : blob?.type?.includes('jpeg') ? 'jpg' : 'webp');
  return `${sessionId}/${Date.now()}_p${position}.${ext}`;
}

export async function uploadPhoto(sessionId, blob, position = 1) {
  if (!sessionId) throw new Error('sessionId is required for uploadPhoto');
  const c = requireSupabase();
  const { data: userData } = await c.auth.getUser();
  const takenBy = userData?.user?.id || null;
  const path = buildPath(sessionId, position, blob);
  const storagePath = await uploadBlob(blob, path);
  const { data, error } = await c
    .from('photos')
    .insert({
      session_id: sessionId,
      storage_path: storagePath,
      position,
      taken_by: takenBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getPhotos(sessionId) {
  if (!sessionId) return [];
  const c = requireSupabase();
  const { data, error } = await c
    .from('photos')
    .select('id, session_id, storage_path, position, taken_by, created_at')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });
  if (error) {
    console.warn('[db.photos] getPhotos error', error);
    return [];
  }
  return data || [];
}

export async function getPhotoSignedUrl(storagePath, { expiresIn = 3600 } = {}) {
  if (!storagePath) return null;
  const c = requireSupabase();
  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function deletePhoto(photoId) {
  if (!photoId) return;
  const c = requireSupabase();
  const { data: row, error: selErr } = await c
    .from('photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (selErr) {
    console.warn('[db.photos] deletePhoto select error', selErr);
  }
  if (row?.storage_path) {
    await c.storage.from(BUCKET).remove([row.storage_path]);
  }
  const { error } = await c.from('photos').delete().eq('id', photoId);
  if (error) throw error;
}
