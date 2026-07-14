import { FALLBACK_THEME, NO_FRAME_THEME, DEFAULT_THEME_ID } from './theme-defaults.js';

const cache = new Map();
const inflight = new Map();
const popularIds = ['minimal', 'hundred-acre-gang', 'pucca', 'hello-kitty'];
let preloaded = false;

function resolveUrl(id) {
  return `${import.meta.env.BASE_URL}themes/${id}/manifest.json`;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Manifest request failed: ${res.status}`);
  return res.json();
}

function resolveAssetUrl(manifestUrl, assetUrl) {
  if (!assetUrl) return null;
  if (/^(https?:|data:|blob:)/i.test(assetUrl)) return assetUrl;
  try {
    return new URL(assetUrl, manifestUrl).toString();
  } catch {
    return assetUrl;
  }
}

function normalize(manifest, id, manifestUrl) {
  if (!manifest || typeof manifest !== 'object') return null;
  const frame = manifest.frame ? { ...manifest.frame } : { url: null, width: 1200, height: 1600 };
  if (frame.url) frame.url = resolveAssetUrl(manifestUrl, frame.url);
  return {
    ...manifest,
    id: manifest.id || id,
    photoSlots: manifest.photoSlots || FALLBACK_THEME.photoSlots,
    frame,
    palette: manifest.palette || FALLBACK_THEME.palette,
    branding: manifest.branding || FALLBACK_THEME.branding,
    previewColor: manifest.previewColor || manifest?.palette?.background || '#FFFFFF',
  };
}

export async function loadTheme(id = DEFAULT_THEME_ID) {
  if (!id || id === 'none') return NO_FRAME_THEME;
  
  // Handle variant keys like "hundred-acre-gang/pooh"
  if (id.includes('/')) {
    const [baseId, variantId] = id.split('/');
    if (cache.has(id)) return cache.get(id);
    if (inflight.has(id)) return inflight.get(id);
    const promise = (async () => {
      try {
        const base = await loadTheme(baseId);
        if (!base || base.id === 'none') return FALLBACK_THEME;
        const variant = (base.variants || []).find(v => v.id === variantId);
        if (variant && variant.frame) {
          const themed = { ...base, id, frame: { ...base.frame, url: variant.frame } };
          cache.set(id, themed);
          return themed;
        }
        cache.set(id, base);
        return base;
      } catch (err) {
        cache.set(id, FALLBACK_THEME);
        return FALLBACK_THEME;
      }
    })();
    inflight.set(id, promise);
    return promise;
  }

  if (cache.has(id)) return cache.get(id);
  if (inflight.has(id)) return inflight.get(id);
  const promise = (async () => {
    try {
      const manifestUrl = resolveUrl(id);
      const manifest = await fetchJson(manifestUrl);
      const normalized = normalize(manifest, id, manifestUrl);
      cache.set(id, normalized || FALLBACK_THEME);
      return cache.get(id);
    } catch (err) {
      console.warn(`[themes] failed to load ${id}, using fallback`, err);
      cache.set(id, FALLBACK_THEME);
      return FALLBACK_THEME;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, promise);
  return promise;
}

export async function loadFrameImage(theme) {
  if (!theme || !theme.frame?.url) return null;
  if (theme.id === 'none') return null;
  const cacheKey = `frame:${theme.id}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('frame load failed'));
    i.src = theme.frame.url;
  });
  cache.set(cacheKey, img);
  return img;
}

export async function preloadPopularThemes() {
  if (preloaded) return;
  preloaded = true;
  await Promise.all(popularIds.map((id) => loadTheme(id).catch(() => null)));
}

export function getCachedTheme(id) {
  return cache.get(id) || null;
}

export function listCachedThemes() {
  return Array.from(cache.values());
}

export { FALLBACK_THEME, NO_FRAME_THEME, DEFAULT_THEME_ID };
