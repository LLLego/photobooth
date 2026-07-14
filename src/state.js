const listeners = new Set();

const initial = {
  user: null,
  profile: null,
  initialized: false,
  route: { name: 'home', params: {} },
  capture: {
    active: false,
    mode: 'single',
    themeId: 'minimal',
    layout: 'strip_4',
    photos: [],
    roomCode: null,
    sessionId: null,
    partnerId: null,
    remoteStream: null,
    status: 'idle',
  },
  gallery: {
    items: [],
    loading: false,
    error: null,
    filters: { theme: 'all', mode: 'all', favorites: false },
    hasMore: true,
    offset: 0,
    limit: 24,
  },
  preferences: {
    themeId: 'minimal',
    layout: 'strip_4',
    darkMode: false,
    autoDownload: false,
    countdownDuration: 3,
    displayName: '',
    filterId: 'original',
  },
  themes: {
    cache: [],
    active: null,
  },
  toasts: [],
};

const state = structuredClone(initial);

export function getState() {
  return state;
}

export function get(path) {
  if (!path) return state;
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), state);
}

export function set(patch) {
  if (!patch || typeof patch !== 'object') return;
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (applyPath(state, key, value)) changed = true;
  }
  if (changed) emit();
}

function applyPath(root, key, value) {
  if (key.includes('.')) {
    const keys = key.split('.');
    let cursor = root;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (cursor[k] == null || typeof cursor[k] !== 'object') cursor[k] = {};
      cursor = cursor[k];
    }
    const last = keys[keys.length - 1];
    if (cursor[last] === value) return false;
    cursor[last] = value;
    return true;
  }
  if (root[key] === value) return false;
  if (value && typeof value === 'object' && !Array.isArray(value) && root[key] && typeof root[key] === 'object' && !Array.isArray(root[key])) {
    root[key] = { ...root[key], ...value };
  } else {
    root[key] = value;
  }
  return true;
}

export function update(name, updater) {
  const section = state[name];
  if (!section || typeof section !== 'object') return;
  const next = updater({ ...section });
  state[name] = { ...section, ...next };
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('[state] listener failed', err); }
  }
}

export function resetCaptureSession() {
  state.capture = { ...initial.capture };
  emit();
}

export function pushToast(toast) {
  const id = toast.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const t = { id, type: 'info', duration: 3200, ...toast };
  state.toasts = [...state.toasts, t];
  emit();
  if (t.duration > 0) {
    setTimeout(() => dismissToast(id), t.duration);
  }
  return id;
}

export function dismissToast(id) {
  const before = state.toasts.length;
  state.toasts = state.toasts.filter((t) => t.id !== id);
  if (state.toasts.length !== before) emit();
}
