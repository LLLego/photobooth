import { requireSupabase } from './supabase.js';

const favoriteMutations = new Map();

export function toggleFavorite(stripId) {
  if (!stripId) return Promise.reject(new Error('stripId required'));
  if (favoriteMutations.has(stripId)) return favoriteMutations.get(stripId);
  const mutation = performToggle(stripId).finally(() => favoriteMutations.delete(stripId));
  favoriteMutations.set(stripId, mutation);
  return mutation;
}

async function performToggle(stripId) {
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const profileId = userData?.user?.id;
  if (!profileId) throw new Error('Not signed in.');
  const { data: existing, error: selectError } = await c
    .from('favorites')
    .select('strip_id')
    .eq('profile_id', profileId)
    .eq('strip_id', stripId)
    .maybeSingle();
  if (selectError) throw selectError;
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
    .upsert({ profile_id: profileId, strip_id: stripId }, { onConflict: 'profile_id,strip_id', ignoreDuplicates: true });
  if (error) throw error;
  return true;
}

export async function getFavorites() {
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const profileId = userData?.user?.id;
  if (!profileId) return new Set();
  const { data, error } = await c
    .from('favorites')
    .select('strip_id, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return new Set((data || []).map((favorite) => favorite.strip_id));
}

export async function isFavorited(stripId) {
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const profileId = userData?.user?.id;
  if (!profileId) return false;
  const { data, error } = await c
    .from('favorites')
    .select('strip_id')
    .eq('profile_id', profileId)
    .eq('strip_id', stripId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
