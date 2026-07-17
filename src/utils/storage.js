const memory = new Map();

export const PREF_KEYS = Object.freeze({
  themeId: 'theme-preference',
  layout: 'layout-preference',
  aspectRatio: 'aspect-ratio-preference',
  darkMode: 'dark-mode',
  autoDownload: 'auto-download',
  countdownDuration: 'countdown-duration',
  filterId: 'filter-preference',
  zoom: 'zoom-preference',
  mirror: 'mirror-preference',
  flashEnabled: 'flash-preference',
});

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch { return false; }
}

export function storageGet(key, fallback = null) {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      try {
        const parsed = JSON.parse(raw);
        // Treat parsed `null` or `undefined` as missing so callers can't
        // accidentally keep null values that downstream code treats as truthy.
        if (parsed === null || parsed === undefined) return fallback;
        return parsed;
      } catch {
        // Fall through to the raw string. An empty string is also 'missing'.
        if (raw === '') return fallback;
        return raw;
      }
    } catch (err) {
      console.warn('[storage] read failed', key, err);
      return memory.has(key) ? memory.get(key) : fallback;
    }
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

export function storageSet(key, value) {
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[storage] write failed', key, err);
    }
  }
  memory.set(key, value);
  return false;
}

export function storageRemove(key) {
  if (hasLocalStorage()) {
    try { window.localStorage.removeItem(key); } catch (err) { console.warn('[storage] remove failed', key, err); }
  }
  memory.delete(key);
}

function finiteNumber(key, fallback, { min = -Infinity, max = Infinity } = {}) {
  const value = Number(storageGet(key, fallback));
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function loadStoredPrefs() {
  return {
    themeId: storageGet(PREF_KEYS.themeId, 'minimal'),
    layout: storageGet(PREF_KEYS.layout, 'strip_4'),
    aspectRatio: storageGet(PREF_KEYS.aspectRatio, '3:4'),
    darkMode: storageGet(PREF_KEYS.darkMode, false) === true,
    autoDownload: storageGet(PREF_KEYS.autoDownload, false) === true,
    countdownDuration: finiteNumber(PREF_KEYS.countdownDuration, 3, { min: 0, max: 60 }),
    filterId: storageGet(PREF_KEYS.filterId, 'original'),
    zoom: finiteNumber(PREF_KEYS.zoom, 1, { min: 1, max: 4 }),
    mirror: storageGet(PREF_KEYS.mirror, true) === true,
    flashEnabled: storageGet(PREF_KEYS.flashEnabled, true) !== false,
  };
}
