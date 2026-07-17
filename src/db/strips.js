import { requireSupabase } from './supabase.js';

const BUCKET = 'strips';
const MAX_STRIP_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateBlob(blob) {
  if (!(blob instanceof Blob)) throw new Error('A strip blob is required.');
  if (!ALLOWED_TYPES.has(blob.type)) throw new Error('Strip format is not supported.');
  if (blob.size <= 0 || blob.size > MAX_STRIP_BYTES) throw new Error('Strip must be smaller than 20 MB.');
}

function buildPath(stripId, blob) {
  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
  return `${stripId}/${crypto.randomUUID()}.${ext}`;
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

async function resolveThemeId(themeSlug) {
  if (!themeSlug || themeSlug === 'none') return null;
  const c = requireSupabase();
  const { data, error } = await c
    .from('themes')
    .select('id')
    .eq('slug', themeSlug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export async function uploadStrip({ sessionId, blob, layout = 'strip_4', themeId, isPrivate = false }) {
  if (!sessionId) throw new Error('sessionId is required for uploadStrip');
  validateBlob(blob);
  const c = requireSupabase();
  const themeUuid = await resolveThemeId(themeId);
  const { data: sessionRow, error: sessionError } = await c
    .from('sessions')
    .select('created_by')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow) throw new Error('Session not found or not accessible.');
  const { data: stripRow, error: stripError } = await c
    .from('photo_strips')
    .insert({ session_id: sessionId, storage_path: 'pending', layout, theme_id: themeUuid, is_private: isPrivate })
    .select('id')
    .single();
  if (stripError) throw stripError;
  let storagePath = null;
  try {
    storagePath = await uploadBlob(blob, buildPath(stripRow.id, blob));
    const { data, error } = await c
      .from('photo_strips')
      .update({ storage_path: storagePath })
      .eq('id', stripRow.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    if (storagePath) {
      try {
        const { error: storageCleanupError } = await c.storage.from(BUCKET).remove([storagePath]);
        if (storageCleanupError) console.warn('[db.strips] failed to roll back uploaded object', storageCleanupError);
      } catch (cleanupErr) {
        console.warn('[db.strips] failed to roll back uploaded object', cleanupErr);
      }
    }
    try {
      const { error: rowCleanupError } = await c.from('photo_strips').delete().eq('id', stripRow.id);
      if (rowCleanupError) console.warn('[db.strips] failed to roll back strip row', rowCleanupError);
    } catch (rowErr) {
      console.warn('[db.strips] failed to roll back strip row', rowErr);
    }
    throw err;
  }
}

export async function listStrips({ limit = 24, offset = 0, themeSlug, mode, favorites, profileId } = {}) {
  const c = requireSupabase();
  let query = c
    .from('photo_strips')
    .select('id, session_id, storage_path, layout, theme_id, is_private, created_at, sessions:session_id!inner(mode, created_by, partner_id), themes:theme_id(slug, display_name)')
    .neq('storage_path', 'pending')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (mode) query = query.eq('sessions.mode', mode);
  if (themeSlug) query = query.eq('themes.slug', themeSlug);
  const { data, error } = await query;
  if (error) {
    // Fallback: if the themes embed select fails (e.g. schema drift), retry
    // without it so the gallery still renders. The decorate() function in
    // gallery.js handles a null `themes` embed gracefully.
    const msg = String(error?.message || '');
    if (msg.toLowerCase().includes('themes') || error?.code === 'PGRST100') {
      console.warn('[db.strips] themes embed unavailable, retrying without it', error);
      let fallback = c
        .from('photo_strips')
        .select('id, session_id, storage_path, layout, theme_id, is_private, created_at, sessions:session_id!inner(mode, created_by, partner_id)')
        .neq('storage_path', 'pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (mode) fallback = fallback.eq('sessions.mode', mode);
      const { data: fbData, error: fbError } = await fallback;
      if (fbError) throw fbError;
      return await applyFavoritesFilter(fbData || [], { favorites, profileId, client: c });
    }
    throw error;
  }
  return await applyFavoritesFilter(data || [], { favorites, profileId, client: c });
}

async function applyFavoritesFilter(rows, { favorites, profileId, client }) {
  if (!favorites || !profileId) return rows;
  try {
    const { data: favoriteRows, error: favoriteError } = await client
      .from('favorites')
      .select('strip_id')
      .eq('profile_id', profileId);
    if (favoriteError) {
      console.warn('[db.strips] favorites lookup failed', favoriteError);
      return rows;
    }
    const favoriteIds = new Set((favoriteRows || []).map((favorite) => favorite.strip_id));
    return rows.filter((row) => favoriteIds.has(row.id));
  } catch (err) {
    console.warn('[db.strips] favorites filter failed', err);
    return rows;
  }
}

export async function getStripSignedUrl(storagePath, { expiresIn = 3600 } = {}) {
  if (!storagePath || storagePath === 'pending') return null;
  const c = requireSupabase();
  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function deleteStrip(stripId) {
  if (!stripId) return;
  const c = requireSupabase();
  const { data: row, error: selectError } = await c
    .from('photo_strips')
    .select('storage_path')
    .eq('id', stripId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!row) return;
  if (row.storage_path && row.storage_path !== 'pending') {
    const { error: storageError } = await c.storage.from(BUCKET).remove([row.storage_path]);
    if (storageError) throw storageError;
  }
  const { error } = await c.from('photo_strips').delete().eq('id', stripId);
  if (error) throw error;
}
