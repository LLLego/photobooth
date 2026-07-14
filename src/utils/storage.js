const memory = new Map();

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
      try { return JSON.parse(raw); } catch { return raw; }
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

export function loadStoredPrefs() {
  return {
    theme: storageGet('theme-preference', 'minimal'),
    layout: storageGet('layout-preference', 'strip_4'),
    darkMode: Boolean(storageGet('dark-mode', false)),
    autoDownload: Boolean(storageGet('auto-download', false)),
    countdownDuration: Number(storageGet('countdown-duration', 3)) || 3,
  };
}
