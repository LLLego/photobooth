import './styles/main.css';
import { isSupabaseConfigured, renderSupabaseMissing } from './db/supabase.js';
import { defineRoute, startRouter, navigate } from './router.js';
import { renderAuthUI } from './auth/auth-ui.js';
import { renderHome } from './ui/home.js';
import { renderSingleCamera } from './ui/single-camera.js';
import { renderDualCamera } from './ui/dual-camera.js';
import { renderGallery } from './gallery/gallery-ui.js';
import { renderSettings } from './ui/settings.js';
import { onAuthStateChange, getSession, fetchProfile } from './auth/auth.js';
import { set, getState, pushToast, subscribe } from './state.js';
import { loadStoredPrefs } from './utils/storage.js';
import { registerSW } from './utils/sw.js';
import { preloadPopularThemes } from './themes/theme-loader.js';
import { fetchThemes } from './db/themes.js';
import { mountNavigation } from './ui/navigation.js';
import { Toast, Spinner } from './ui/components.js';

const app = {
  name: 'our photobooth',
  startedAt: new Date().toISOString(),
  state: getState(),
};

async function boot() {
  const mount = document.getElementById('app');
  if (!mount) {
    console.error('Missing #app mount point.');
    return;
  }

  // Supabase optional — app works offline
  if (!isSupabaseConfigured) {
    console.warn('[boot] Supabase not configured — running in offline mode');
  }

  const stored = loadStoredPrefs();
  const basePrefs = getState().preferences;
  set({ preferences: { ...basePrefs, ...stored } });
  applyDarkMode(stored.darkMode);

  const themeCache = getState().themes?.cache || [];
  set({ themes: { ...getState().themes, cache: Array.isArray(themeCache) ? themeCache : [] } });

  mountLoading(mount);
  // Don't block boot on theme loading — render UI immediately
  Promise.allSettled([
    preloadPopularThemes(),
    fetchThemes().then((themes) => {
      if (themes.length) set({ themes: { ...getState().themes, cache: themes } });
    }),
    registerSW(),
  ]);

  // Remove loading spinner and show routes immediately
  mount.innerHTML = '';

  defineRoute('login', renderLoginRoute);
  defineRoute('home', renderHome);
  defineRoute('single', renderSingleCamera);
  defineRoute('dual', renderDualCamera);
  defineRoute('gallery', renderGallery);
  defineRoute('settings', renderSettings);

  let initial = null;
  if (isSupabaseConfigured) {
    onAuthStateChange(async (event, session) => {
      set({ user: session?.user || null, initialized: true });
      if (session?.user) {
        try {
          const profile = await fetchProfile(session.user.id);
          set({ profile });
        } catch (err) {
          console.warn('[auth] profile fetch failed', err);
        }
      } else {
        set({ profile: null });
      }
      if (event === 'SIGNED_IN') {
        navigate('home', {}, { replace: true });
      } else if (event === 'SIGNED_OUT') {
        navigate('home', {}, { replace: true });
      }
    });

    initial = await getSession();
    set({ user: initial?.user || null, session: initial?.session || null });
    if (initial?.user) {
      try {
        set({ profile: await fetchProfile(initial.user.id) });
      } catch (err) {
        console.warn('[auth] profile fetch failed', err);
      }
    }
  } else {
    set({ user: null, initialized: true });
  }
  startRouter(mount);
  mountToaster();

  // Render home directly before nav host (which triggers state subscriptions)
  if (!isSupabaseConfigured || !initial?.session) {
    await renderHome(mount);
  }

  mountNavigationHost();
}

function mountLoading(mount) {
  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'min-h-dvh flex items-center justify-center';
  wrap.append(Spinner({ size: 28, label: 'Loading…' }));
  mount.append(wrap);
}

function applyDarkMode(enabled) {
  document.documentElement.classList.toggle('dark', Boolean(enabled));
}
// Keep dark mode in sync with state changes
subscribe((s) => {
  const dm = s?.preferences?.darkMode;
  if (dm !== undefined) {
    document.documentElement.classList.toggle('dark', Boolean(dm));
  }
});

let toasterRoot = null;
let toastUnsubscribe = null;
function mountToaster() {
  if (toasterRoot) return;
  toasterRoot = document.createElement('div');
  toasterRoot.className = 'toast-root';
  toasterRoot.setAttribute('role', 'status');
  toasterRoot.setAttribute('aria-live', 'polite');
  document.body.append(toasterRoot);
  if (typeof toastUnsubscribe === 'function') toastUnsubscribe();
  toastUnsubscribe = subscribe(renderToasts);
  renderToasts();
}
function renderToasts() {
  if (!toasterRoot) return;
  const existing = new Map();
  for (const c of toasterRoot.children) existing.set(c.dataset.toastId, c);
  const toasts = getState().toasts || [];
  const seenIds = new Set();
  for (const t of toasts) {
    seenIds.add(t.id);
    let node = existing.get(t.id);
    if (!node) {
      node = Toast({ message: t.message, type: t.type });
      node.dataset.toastId = t.id;
      toasterRoot.appendChild(node);
    } else {
      if (node.textContent !== t.message) node.textContent = t.message;
    }
  }
  for (const [id, node] of existing) {
    if (!seenIds.has(id)) node.remove();
  }
}

let navHost = null;
let navUpdateHash = null;
function mountNavigationHost() {
  if (navHost) return;
  navHost = document.createElement('div');
  navHost.id = 'nav-host';
  document.body.append(navHost);
  const update = () => {
    const route = getState().route?.name;
    const show = ['home', 'gallery', 'single', 'dual'].includes(route);
    const nextHash = show && getState().user ? `nav:${route}` : 'nav:none';
    if (navUpdateHash === nextHash) return;
    navUpdateHash = nextHash;
    navHost.innerHTML = '';
    if (nextHash !== 'nav:none') mountNavigation(navHost);
  };
  window.addEventListener('hashchange', update);
  subscribe((s) => update());
  update();
}

async function renderLoginRoute(mount) {
  const navHost = document.getElementById('nav-host');
  if (navHost) navHost.innerHTML = '';
  await renderAuthUI(mount);
}

boot().catch((err) => {
  console.error('[boot] failed', err);
  pushToast({ message: err.message || 'Failed to start app.', type: 'error' });
});

export default app;
export { app };
