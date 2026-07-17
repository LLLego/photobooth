import { requireSupabase, isSupabaseConfigured } from './supabase.js';

export async function fetchThemes() {
  if (!isSupabaseConfigured) return [];
  const c = requireSupabase();
  const { data, error } = await c
    .from('themes')
    .select('id, slug, display_name, manifest_url, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}
