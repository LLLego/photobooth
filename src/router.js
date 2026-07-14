import { getState, set } from './state.js';
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
  handleHashChange();
}

export function currentRouteName() {
  return getState().route?.name || 'home';
}

export function navigate(name, params = {}, opts = {}) {
  const qs = params && Object.keys(params).length
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  const hash = `#/${name}${qs}`;
  if (opts.force) {
    // Update route state and re-render directly. Avoids hash-flash + race where
    // a stale `__force__` sentinel leaks into the route name.
    set({ route: { name, params } });
    if (location.hash !== hash) {
      if (opts.replace) location.replace(hash);
      else location.hash = hash;
    } else {
      // Same hash — render directly since handleHashChange would early-return.
      renderRoute(name, params);
    }
    return;
  }
  if (location.hash === hash) return;
  if (opts.replace) {
    location.replace(hash);
  } else {
    location.hash = hash;
  }
}

let isRendering = false;

async function renderRoute(name, params) {
  if (!routes.has(name)) {
    navigate('home', {}, { replace: true });
    return;
  }
  const session = await getSession();
  if (!session && name !== 'login') {
    navigate('login', {}, { replace: true });
    return;
  }
  if (isRendering) return;
  isRendering = true;
  try {
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
      const card = document.createElement('div');
      card.className = 'card p-8 max-w-md text-center';
      const h = document.createElement('h2');
      h.className = 'heading-display text-2xl mb-2';
      h.textContent = 'Something went wrong';
      const p = document.createElement('p');
      p.className = 'text-warmth-700 dark:text-warmth-400';
      p.textContent = err?.message || 'Unknown error';
      const back = document.createElement('a');
      back.className = 'btn-accent mt-6 inline-flex';
      back.href = '#/home';
      back.textContent = 'Back to home';
      card.append(h, p, back);
      errEl.append(card);
      appMount.append(errEl);
    }
  } finally {
    isRendering = false;
  }
}



function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [pathRaw, queryRaw] = raw.split('?');
  const name = pathRaw || 'home';
  let params = {};
  try {
    params = Object.fromEntries(new URLSearchParams(queryRaw || ''));
  } catch {
    params = {};
  }
  return { name, params };
}

async function handleHashChange() {
  if (isRendering) return;
  const { name, params } = parseHash();

  const currentRoute = getState().route;
  if (currentRoute?.name === name && shallowEqualParams(currentRoute?.params, params)) {
    return;
  }
  set({ route: { name, params } });
  await renderRoute(name, params);
}

function shallowEqualParams(a, b) {
  if (a === b) return true;
  const ak = Object.keys(a || {});
  const bk = Object.keys(b || {});
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

export function goHome() { navigate('home'); }
export function goGallery() { navigate('gallery'); }
export function goSettings() { navigate('settings'); }
export function goLogin() { navigate('login'); }
