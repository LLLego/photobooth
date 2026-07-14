import { listStrips, getStripSignedUrl, deleteStrip } from '../db/strips.js';
import { toggleFavorite, getFavorites, isFavorited } from '../db/favorites.js';
import { getState, set, pushToast } from '../state.js';

const SIGNED_URL_TTL = 3600;

function decorate(strip) {
  return {
    ...strip,
    themeSlug: strip?.themes?.slug || null,
    themeName: strip?.themes?.display_name || 'Minimal',
    previewColor: strip?.themes?.preview_color || '#F5F5F5',
    mode: strip?.sessions?.mode || 'single',
    createdAt: strip?.created_at,
  };
}

export async function fetchStrips({ limit, offset, theme, mode, favorites, reset = false } = {}) {
  const s = getState();
  const filters = { ...(s.gallery?.filters || {}), theme, mode, favorites };
  const lim = limit ?? s.gallery?.limit ?? 24;
  const off = reset ? 0 : (offset ?? s.gallery?.offset ?? 0);
  set({ gallery: { ...s.gallery, loading: true, error: null, filters } });
  try {
    const rows = await listStrips({
      limit: lim,
      offset: off,
      themeSlug: theme && theme !== 'all' ? theme : undefined,
      mode: mode && mode !== 'all' ? mode : undefined,
      favorites: Boolean(favorites),
      profileId: s.user?.id,
    });
    const decorated = rows.map(decorate);
    const items = reset ? decorated : [...(s.gallery?.items || []), ...decorated];
    set({
      gallery: {
        ...s.gallery,
        items,
        offset: off + rows.length,
        hasMore: rows.length === lim,
        loading: false,
      },
    });
    return items;
  } catch (err) {
    set({ gallery: { ...s.gallery, loading: false, error: err.message } });
    throw err;
  }
}

export async function reloadGallery({ reset = true } = {}) {
  set({ gallery: { ...getState().gallery, items: [], offset: 0, hasMore: true } });
  return fetchStrips({ reset: true });
}

export async function loadMoreStrips() {
  const s = getState().gallery;
  if (s.loading || !s.hasMore) return [];
  return fetchStrips({ reset: false });
}

export async function ensureSignedUrl(strip, { force = false } = {}) {
  if (!strip?.storage_path) return null;
  const existing = strip._signedUrl;
  const createdAt = strip._signedUrlCreatedAt || 0;
  const ageSec = (Date.now() - createdAt) / 1000;
  if (existing && !force && ageSec < SIGNED_URL_TTL - 60) return existing;
  const url = await getStripSignedUrl(strip.storage_path, { expiresIn: SIGNED_URL_TTL });
  if (url) {
    strip._signedUrl = url;
    strip._signedUrlCreatedAt = Date.now();
  }
  return url;
}

let refreshTimer = null;
export function startSignedUrlRefreshLoop({ intervalMs = 30 * 60 * 1000 } = {}) {
  if (refreshTimer) return () => {};
  refreshTimer = setInterval(async () => {
    const items = getState().gallery?.items || [];
    for (const strip of items) {
      try { await ensureSignedUrl(strip, { force: true }); } catch {}
    }
  }, intervalMs);
  return () => {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  };
}

export async function toggleFavoriteForStrip(stripId) {
  try {
    const nowFav = await toggleFavorite(stripId);
    const items = getState().gallery.items.map((s) => s.id === stripId ? { ...s, favorited: nowFav } : s);
    set({ gallery: { ...getState().gallery, items } });
    return nowFav;
  } catch (err) {
    pushToast({ message: err.message, type: 'error' });
    throw err;
  }
}

export async function loadFavoritesSet() {
  try {
    const set1 = await getFavorites();
    const items = getState().gallery.items.map((s) => ({ ...s, favorited: set1.has(s.id) }));
    set({ gallery: { ...getState().gallery, items } });
  } catch (err) {
    console.warn('[gallery] loadFavoritesSet failed', err);
  }
}

export async function checkStripFavorited(stripId) {
  return isFavorited(stripId);
}

export async function removeStrip(stripId) {
  try {
    await deleteStrip(stripId);
    const items = getState().gallery.items.filter((s) => s.id !== stripId);
    set({ gallery: { ...getState().gallery, items } });
    pushToast({ message: 'Strip deleted.', type: 'success' });
  } catch (err) {
    pushToast({ message: err.message, type: 'error' });
    throw err;
  }
}
