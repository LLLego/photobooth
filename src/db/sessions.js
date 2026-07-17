import { requireSupabase } from './supabase.js';

export async function createSession({ mode = 'single', themeId, layout = 'strip_4', partnerId = null, roomCode = null } = {}) {
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const createdBy = userData?.user?.id;
  if (!createdBy) throw new Error('Cannot create a session while signed out.');
  const insert = {
    created_by: createdBy,
    mode,
    layout,
    partner_id: partnerId,
    room_code: roomCode,
    status: 'active',
  };
  if (themeId && themeId !== 'none') {
    const { data: themeRow, error: themeError } = await c
      .from('themes')
      .select('id')
      .eq('slug', themeId)
      .eq('is_active', true)
      .maybeSingle();
    if (themeError) throw themeError;
    if (!themeRow) throw new Error('The selected theme is unavailable.');
    insert.theme_id = themeRow.id;
  }
  const { data, error } = await c.from('sessions').insert(insert).select('*').single();
  if (error) throw error;
  return data;
}

export async function getSession(sessionId) {
  if (!sessionId) return null;
  const c = requireSupabase();
  const { data, error } = await c.from('sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function completeSession(sessionId) {
  if (!sessionId) return;
  const c = requireSupabase();
  const { error } = await c
    .from('sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function listSessions({ limit = 20, mode } = {}) {
  const c = requireSupabase();
  let query = c
    .from('sessions')
    .select('id, mode, status, layout, created_at, completed_at, theme_id, partner_id, room_code')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (mode) query = query.eq('mode', mode);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
