import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'photobooth.auth',
        storage: typeof window === 'undefined' ? undefined : window.localStorage,
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    const err = new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
    );
    err.code = 'SUPABASE_NOT_CONFIGURED';
    throw err;
  }
  return supabase;
}

export function renderSupabaseMissing(mount) {
  if (!mount) return;
  mount.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'min-h-dvh flex items-center justify-center p-8';
  const card = document.createElement('div');
  card.className = 'card max-w-md w-full p-8 text-center fade-up';
  const title = document.createElement('h1');
  title.className = 'heading-display text-2xl mb-2';
  title.textContent = 'Setup required';
  const body = document.createElement('p');
  body.className = 'text-warmth-700 leading-relaxed mb-4';
  body.textContent =
    'This photobooth needs Supabase credentials. Create a .env file in the project root with the following values, then restart the dev server.';
  const code = document.createElement('pre');
  code.className = 'text-left bg-warmth-100 text-warmth-900 rounded-2xl p-4 text-xs overflow-x-auto font-mono';
  code.textContent = 'VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY';
  const link = document.createElement('a');
  link.className = 'btn-accent mt-6 inline-flex';
  link.href = 'https://supabase.com/dashboard';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'Open Supabase dashboard';
  card.append(title, body, code, link);
  root.append(card);
  mount.append(root);
}
