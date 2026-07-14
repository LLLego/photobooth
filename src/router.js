import { getState, set, subscribe } from './state.js';
import { getSession } from './auth/auth.js';

const routes = new Map();
let appMount = null;
let currentCleanup = null;
let currentRender = null;

export function defineRoute(name, render) {
  if (typeof render !== 'function') throw new Error('Route render must be a function');
  routes.set(name, render);
}

export function startRouter(mount) {
  appMount = mount;
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handleHashChange);
  subscribe((s) => {
    if (s.route && s.route.name !== currentRouteName()) navigate(s.route.name, s.route.params, { replace: true });
  });
  handleHashChange();
}

export function currentRouteName() {
  return getState().route?.name || 'home';
}

export function navigate(name, params = {}, opts = {}) {
  const hash = params && Object.keys(params).length
    ? `#/${name}?${new URLSearchParams(params).toString()}`
    : `#/${name}`;
  if (opts.replace) {
    if (location.hash !== hash) location.replace(hash);
  } else {
    if (location.hash !== hash) location.hash = hash;
  }
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [pathRaw, queryRaw] = raw.split('?');
  const name = pathRaw || 'home';
  const params = Object.fromEntries(new URLSearchParams(queryRaw || ''));
  return { name, params };
}

async function handleHashChange() {
  const { name, params } = parseHash();
  if (!routes.has(name)) {
    navigate('home', {}, { replace: true });
    return;
  }
  set({ route: { name, params } });

  const session = await getSession();
  if (!session && name !== 'login') {
    navigate('login', {}, { replace: true });
    return;
  }

  const render = routes.get(name);
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (err) { console.error('[router] cleanup failed', err); }
    currentCleanup = null;
  }
  if (!appMount) return;
  appMount.innerHTML = '';
  currentRender = render;
  try {
    const cleanup = await render(appMount, params);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error(`[router] render failed for ${name}`, err);
    appMount.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.className = 'min-h-dvh flex items-center justify-center p-6';
    errEl.innerHTML = `
      <div class="card p-8 max-w-md text-center">
        <h2 class="heading-display text-2xl mb-2">Something went wrong</h2>
        <p class="text-warmth-700">${escapeHtml(err?.message || 'Unknown error')}</p>
        <a href="#/home" class="btn-accent mt-6 inline-flex">Back to home</a>
      </div>`;
    appMount.append(errEl);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function goHome() { navigate('home'); }
export function goGallery() { navigate('gallery'); }
export function goSettings() { navigate('settings'); }
export function goLogin() { navigate('login'); }
