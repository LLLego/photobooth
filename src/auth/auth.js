import { requireSupabase, supabase, isSupabaseConfigured } from '../db/supabase.js';

function client() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase environment variables are not configured.');
  }
  return requireSupabase();
}

export async function signUp({ email, password, displayName }) {
  if (!email || !password) throw new Error('Email and password are required.');
  const c = client();
  const { data, error } = await c.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { display_name: (displayName || '').trim() },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  if (!email || !password) throw new Error('Email and password are required.');
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  const c = requireSupabase();
  const { error } = await c.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const c = requireSupabase();
  const { data, error } = await c.auth.getSession();
  if (error) return null;
  return data?.session || null;
}

export async function getUser() {
  if (!isSupabaseConfigured) return null;
  const c = requireSupabase();
  const { data, error } = await c.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

export async function fetchProfile(userId) {
  if (!userId) return null;
  const c = client();
  const { data, error } = await c
    .from('profiles')
    .select('id, display_name, role, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[auth] fetchProfile error', error);
    return null;
  }
  return data;
}

export async function updateProfile(userId, patch) {
  if (!userId) throw new Error('userId is required');
  const c = client();
  const { data, error } = await c
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, display_name, role')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) {
    callback('SIGNED_OUT', null);
    return { data: { subscription: { unsubscribe() {} } } };
  }
  const c = requireSupabase();
  const { data } = c.auth.onAuthStateChange((event, session) => callback(event, session));
  return data;
}

export { supabase };
