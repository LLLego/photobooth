import './styles/main.css';
import { isSupabaseConfigured, renderSupabaseMissing, supabase } from './db/supabase.js';
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

  if (!isSupabaseConfigured) {
    renderSupabaseMissing(mount);
    return;
  }

  // Initialize state from storage and remote
  const stored = loadStoredPrefs();
  set({ preferences: { ...getState().preferences, ...stored } });
  applyDarkMode(stored.darkMode);
  set({ themes: { ...getState().themes, cache: getState().themes?.cache || [] } });

  mountLoading(mount);
  await Promise.allSettled([
    preloadPopularThemes(),
    fetchThemes().then((themes) => {
      if (themes.length) set({ themes: { ...getState().themes, cache: themes } });
    }),
    registerSW(),
  ]);

  defineRoute('login', renderLoginRoute);
  defineRoute('home', renderHome);
  defineRoute('single', renderSingleCamera);
  defineRoute('dual', renderDualCamera);
  defineRoute('gallery', renderGallery);
  defineRoute('settings', renderSettings);

  // Auth bootstrap
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
      navigate('login', {}, { replace: true });
    }
  });

  const initial = await getSession();
  set({ user: initial?.user || null, initialized: true });
  if (initial?.user) {
    try { set({ profile: await fetchProfile(initial.user.id) }); } catch {}
  }
  startRouter(mount);
  mountToaster(mount);
  mountNavigationHost();

  if (!initial) {
    navigate('login', {}, { replace: true });
  }
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

let toasterRoot = null;
let toastUnsubscribe = null;
function mountToaster(root) {
  if (toasterRoot) return;
  toasterRoot = document.createElement('div');
  toasterRoot.className = 'toast-root';
  document.body.append(toasterRoot);
  if (typeof toastUnsubscribe === 'function') toastUnsubscribe();
  toastUnsubscribe = subscribe(renderToasts);
  renderToasts();
}
function renderToasts() {
  if (!toasterRoot) return;
  const toasts = getState().toasts || [];
  toasterRoot.innerHTML = '';
  for (const t of toasts) {
    toasterRoot.appendChild(Toast({ message: t.message, type: t.type }));
  }
}

let navHost = null;
function mountNavigationHost() {
  if (navHost) return;
  navHost = document.createElement('div');
  navHost.id = 'nav-host';
  document.body.append(navHost);
  // re-render when route changes
  const update = () => {
    const route = getState().route?.name;
    const show = ['home', 'gallery', 'settings'].includes(route);
    navHost.innerHTML = '';
    if (show && getState().user) {
      mountNavigation(navHost);
    }
  };
  window.addEventListener('hashchange', update);
  setInterval(update, 250);
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
