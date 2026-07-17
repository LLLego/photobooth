import { requireSupabase } from './supabase.js';

const BUCKET = 'photos';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateBlob(blob) {
  if (!(blob instanceof Blob)) throw new Error('A photo blob is required.');
  if (!ALLOWED_TYPES.has(blob.type)) throw new Error('Photo format is not supported.');
  if (blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) throw new Error('Photo must be smaller than 10 MB.');
}

function buildPath(sessionId, position, blob) {
  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
  return `${sessionId}/${crypto.randomUUID()}_p${position}.${ext}`;
}

async function uploadBlob(blob, path) {
  const c = requireSupabase();
  const { data, error } = await c.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType: blob.type,
  });
  if (error) throw error;
  return data?.path || path;
}

export async function uploadPhoto(sessionId, blob, position = 1) {
  if (!sessionId) throw new Error('sessionId is required for uploadPhoto');
  validateBlob(blob);
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const takenBy = userData?.user?.id;
  if (!takenBy) throw new Error('Sign in to upload a photo.');
  const path = buildPath(sessionId, position, blob);
  const storagePath = await uploadBlob(blob, path);
  const { data, error } = await c
    .from('photos')
    .insert({ session_id: sessionId, storage_path: storagePath, position, taken_by: takenBy })
    .select('*')
    .single();
  if (error) {
    try {
      const { error: cleanupError } = await c.storage.from(BUCKET).remove([storagePath]);
      if (cleanupError) console.warn('[db.photos] failed to roll back uploaded object', cleanupError);
    } catch (cleanupErr) {
      console.warn('[db.photos] failed to roll back uploaded object', cleanupErr);
    }
    throw error;
  }
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
  if (error) throw error;
  return data || [];
}

export async function getPhotoSignedUrl(storagePath, { expiresIn = 3600 } = {}) {
  if (!storagePath) return null;
  const c = requireSupabase();
  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function deletePhoto(photoId) {
  if (!photoId) return;
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const profileId = userData?.user?.id;
  if (!profileId) throw new Error('Sign in to delete a photo.');
  const { data: row, error: selectError } = await c
    .from('photos')
    .select('storage_path, taken_by')
    .eq('id', photoId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!row) return;
  if (row.taken_by !== profileId) throw new Error('You can only delete your own photos.');
  const { error: storageError } = await c.storage.from(BUCKET).remove([row.storage_path]);
  if (storageError) throw storageError;
  const { error } = await c.from('photos').delete().eq('id', photoId).eq('taken_by', profileId);
  if (error) throw error;
}
