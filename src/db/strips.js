import { requireSupabase } from './supabase.js';

const BUCKET = 'strips';

function buildPath(stripId, blob) {
  const ext = (blob?.type?.includes('png') ? 'png' : blob?.type?.includes('jpeg') ? 'jpg' : 'webp');
  return `${stripId}/${Date.now()}.${ext}`;
}

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

async function resolveThemeId(themeSlug) {
  if (!themeSlug) return null;
  const c = requireSupabase();
  const { data } = await c.from('themes').select('id').eq('slug', themeSlug).maybeSingle();
  return data?.id || null;
}

export async function uploadStrip({ sessionId, blob, layout = 'strip_4', themeId, isPrivate = false }) {
  if (!sessionId) throw new Error('sessionId is required for uploadStrip');
  const c = requireSupabase();
  const themeUuid = await resolveThemeId(themeId);
  const { data: sessionRow } = await c
    .from('sessions')
    .select('created_by')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sessionRow) throw new Error('Session not found or not accessible.');
  const { data: stripRow, error: stripErr } = await c
    .from('photo_strips')
    .insert({
      session_id: sessionId,
      storage_path: 'pending',
      layout,
      theme_id: themeUuid,
      is_private: isPrivate,
    })
    .select('id')
    .single();
  if (stripErr) throw stripErr;
  const path = buildPath(stripRow.id, blob);
  const storagePath = await uploadBlob(blob, path);
  const { data, error } = await c
    .from('photo_strips')
    .update({ storage_path: storagePath })
    .eq('id', stripRow.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listStrips({ limit = 24, offset = 0, themeSlug, mode, favorites, profileId } = {}) {
  const c = requireSupabase();
  let query = c
    .from('photo_strips')
    .select('id, session_id, storage_path, layout, theme_id, is_private, created_at, sessions:session_id (mode, created_by, partner_id)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (mode) {
    query = query.eq('sessions.mode', mode);
  }
  if (themeSlug) {
    query = query.eq('themes.slug', themeSlug);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('[db.strips] listStrips error', error);
    return [];
  }
  let rows = data || [];
  if (favorites && profileId) {
    const { data: favRows } = await c
      .from('favorites')
      .select('strip_id')
      .eq('profile_id', profileId);
    const favSet = new Set((favRows || []).map((f) => f.strip_id));
    rows = rows.filter((r) => favSet.has(r.id));
  }
  return rows;
}

export async function getStripSignedUrl(storagePath, { expiresIn = 3600 } = {}) {
  if (!storagePath) return null;
  const c = requireSupabase();
  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function deleteStrip(stripId) {
  if (!stripId) return;
  const c = requireSupabase();
  const { data: row, error: selErr } = await c
    .from('photo_strips')
    .select('storage_path')
    .eq('id', stripId)
    .maybeSingle();
  if (selErr) console.warn('[db.strips] deleteStrip select error', selErr);
  if (row?.storage_path) {
    await c.storage.from(BUCKET).remove([row.storage_path]);
  }
  const { error } = await c.from('photo_strips').delete().eq('id', stripId);
  if (error) throw error;
}
