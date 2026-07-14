import { requireSupabase } from './supabase.js';

export async function toggleFavorite(stripId) {
  if (!stripId) throw new Error('stripId required');
  const c = requireSupabase();
  const { data: userData } = await c.auth.getUser();
  const profileId = userData?.user?.id;
  if (!profileId) throw new Error('Not signed in.');
  const { data: existing, error: selErr } = await c
    .from('favorites')
    .select('strip_id')
    .eq('profile_id', profileId)
    .eq('strip_id', stripId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error } = await c
      .from('favorites')
      .delete()
      .eq('profile_id', profileId)
      .eq('strip_id', stripId);
    if (error) throw error;
    return false;
  }
  const { error } = await c
    .from('favorites')
    .insert({ profile_id: profileId, strip_id: stripId });
  if (error) throw error;
  return true;
}

export async function getFavorites() {
  const c = requireSupabase();
  const { data: userData } = await c.auth.getUser();
  const profileId = userData?.user?.id;
  if (!profileId) return new Set();
  const { data, error } = await c
    .from('favorites')
    .select('strip_id, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[db.favorites] getFavorites error', error);
    return new Set();
  }
  return new Set((data || []).map((f) => f.strip_id));
}

export async function isFavorited(stripId) {
  const c = requireSupabase();
  const { data: userData } = await c.auth.getUser();
  const profileId = userData?.user?.id;
  if (!profileId) return false;
  const { data, error } = await c
    .from('favorites')
    .select('strip_id')
    .eq('profile_id', profileId)
    .eq('strip_id', stripId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}
