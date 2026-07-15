import { getState, set, subscribe, pushToast } from '../state.js';
import { fetchStrips, loadMoreStrips, ensureSignedUrl, toggleFavoriteForStrip, loadFavoritesSet, startSignedUrlRefreshLoop } from './gallery.js';
import { openStripViewer } from './viewer.js';
import { Spinner, EmptyState, Button, Icon } from '../ui/components.js';
import { navigate } from '../router.js';

let cleanup = null;
let refreshInFlight = false;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'single', label: 'Single' },
  { id: 'dual', label: 'Dual' },
];

export async function renderGallery(mount) {
  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-5xl mx-auto px-4 pt-6 pb-40 fade-in';
  const h = document.createElement('div');
  h.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => navigate('home'), icon: Icon({ name: 'back' }) });
  const title = document.createElement('h1');
  title.className = 'heading-display text-3xl';
  title.textContent = 'Gallery';
  const refresh = Button({ label: 'Refresh', variant: 'ghost', onClick: () => refreshAll(), ariaLabel: 'Refresh gallery' });
  h.append(back, title, refresh);
  wrap.append(h);

  const filterBar = document.createElement('div');
  filterBar.className = 'flex gap-2 overflow-x-auto no-scrollbar mb-4';
  filterBar.setAttribute('role', 'tablist');
  filterBar.setAttribute('aria-label', 'Filter gallery');
  FILTERS.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-4 py-2 rounded-2xl text-sm border border-warmth-200 dark:border-warmth-300 dark:text-warmth-200 whitespace-nowrap';
    b.textContent = f.label;
    b.dataset.filter = f.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.tabIndex = -1;
    b.addEventListener('click', () => applyFilter(f.id));
    b.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        const tabs = Array.from(filterBar.querySelectorAll('[role="tab"]'));
        const idx = tabs.indexOf(b);
        const next = ev.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        applyFilter(tabs[next].dataset.filter);
      }
    });
    filterBar.append(b);
  });
  wrap.append(filterBar);

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  grid.setAttribute('data-grid', 'true');
  wrap.append(grid);

  const sentinel = document.createElement('div');
  sentinel.className = 'h-12 flex items-center justify-center text-sm text-warmth-500 dark:text-warmth-400';
  sentinel.setAttribute('data-sentinel', 'true');
  wrap.append(sentinel);

  mount.append(wrap);

  await refreshAll();

  const unsubscribe = subscribe((s) => renderGrid(s.gallery, grid));
  renderGrid(getState().gallery, grid);
  applyActiveFilterState();

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        loadMoreStrips().catch(() => {});
      }
    }
  }, { rootMargin: '400px' });
  observer.observe(sentinel);

  const stopRefresh = startSignedUrlRefreshLoop();

  cleanup = () => {
    unsubscribe();
    observer.disconnect();
    stopRefresh();
    cleanup = null;
  };
  return cleanup;
}

function applyFilter(id) {
  const filters = { ...getState().gallery.filters };
  if (id === 'favorites') {
    filters.favorites = !filters.favorites;
    filters.mode = 'all';
    filters.theme = 'all';
  } else {
    filters.favorites = false;
    if (id === 'single' || id === 'dual') filters.mode = id;
    else filters.mode = 'all';
  }
  set({ gallery: { ...getState().gallery, filters } });
  applyActiveFilterState();
  refreshAll();
}

function applyActiveFilterState() {
  const filters = getState().gallery.filters || {};
  const active = filters.favorites ? 'favorites' : (filters.mode === 'all' ? 'all' : filters.mode);
  document.querySelectorAll('[data-filter]').forEach((b) => {
    const isActive = b.dataset.filter === active;
    b.classList.toggle('bg-warmth-900', isActive);
    b.classList.toggle('text-warmth-50', isActive);
    b.classList.toggle('dark:bg-warmth-100', isActive);
    b.classList.toggle('dark:text-warmth-900', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    b.tabIndex = isActive ? 0 : -1;
  });
}

async function refreshAll() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  set({ gallery: { ...getState().gallery, error: null } });
  try {
    const filters = getState().gallery.filters;
    await fetchStrips({ reset: true, ...filters });
    await loadFavoritesSet();
  } catch (err) {
    pushToast({ message: err.message, type: 'error' });
  } finally {
    refreshInFlight = false;
  }
}

function renderGrid(gallery, mount) {
  mount.innerHTML = '';
  if (gallery.loading && gallery.items.length === 0) {
    const center = document.createElement('div');
    center.className = 'col-span-full flex justify-center py-12';
    center.append(Spinner({ size: 28, label: 'Loading strips…' }));
    mount.append(center);
    return;
  }
  if (gallery.error && gallery.items.length === 0) {
    const retry = Button({ label: 'Try again', variant: 'primary', onClick: () => refreshAll() });
    const empty = EmptyState({ title: 'Could not load gallery', message: gallery.error, action: retry });
    empty.classList.add('col-span-full');
    mount.append(empty);
    return;
  }
  if (!gallery.items.length) {
    const take = Button({ label: 'Take a photo', variant: 'primary' });
    take.addEventListener('click', () => navigate('home'));
    const empty = EmptyState({ title: 'No photos yet ✨ Take your first one!', message: 'Your gallery is empty — capture a strip and it will appear here.', action: take });
    empty.classList.add('col-span-full');
    mount.append(empty);
    return;
  }

  for (let idx = 0; idx < gallery.items.length; idx++) {
    const strip = gallery.items[idx];
    const card = document.createElement('article');
    card.className = 'card overflow-hidden flex flex-col fade-up cursor-pointer';
    card.style.animationDelay = `${Math.min(idx, 12) * 60}ms`;
    const media = document.createElement('div');
    media.className = 'gallery-card-media bg-warmth-100 dark:bg-warmth-800 relative';
    media.style.background = strip.previewColor || '#F5F5F5';
    const img = document.createElement('img');
    let signedUrlRefreshAttempted = false;
    img.alt = strip.themeName || 'Strip';
    img.loading = 'lazy';
    img.className = 'absolute inset-0 w-full h-full object-cover';
    img.style.opacity = '0';
    img.style.transition = 'opacity 200ms ease-out';
    img.addEventListener('load', () => { img.style.opacity = '1'; });
    img.addEventListener('error', () => {
      img.style.opacity = '0.3';
      img.alt = 'Image unavailable';
      if (signedUrlRefreshAttempted) return;
      signedUrlRefreshAttempted = true;
      ensureSignedUrl(strip, { force: true }).then((url) => {
        if (url) {
          img.alt = strip.themeName || 'Strip';
          img.src = url;
        }
      }).catch(() => {});
    });
    media.append(img);
    card.append(media);
    ensureSignedUrl(strip).then((url) => { if (url) img.src = url; }).catch(() => {});

    const body = document.createElement('div');
    body.className = 'p-3 flex items-center justify-between gap-2';
    const meta = document.createElement('div');
    meta.className = 'min-w-0';
    const themeName = document.createElement('p');
    themeName.className = 'text-sm font-medium truncate text-warmth-900 dark:text-warmth-100';
    themeName.textContent = strip.themeName || 'Strip';
    const sub = document.createElement('p');
    sub.className = 'text-xs text-warmth-500 dark:text-warmth-400';
    sub.textContent = `${strip.mode === 'dual' ? 'Dual' : 'Single'} · ${formatDate(strip.createdAt)}`;
    meta.append(themeName, sub);
    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-warmth-100 dark:hover:bg-warmth-200 transition';
    fav.setAttribute('aria-label', strip.favorited ? 'Remove from favorites' : 'Add to favorites');
    fav.append(Icon({ name: strip.favorited ? 'heartFilled' : 'heart' }));
    fav.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      fav.disabled = true;
      try {
        const nowFav = await toggleFavoriteForStrip(strip.id);
        strip.favorited = nowFav;
        fav.setAttribute('aria-label', nowFav ? 'Remove from favorites' : 'Add to favorites');
        fav.innerHTML = '';
        fav.append(Icon({ name: nowFav ? 'heartFilled' : 'heart' }));
      } catch (err) {
        pushToast({ message: err.message || 'Could not update favorite.', type: 'error' });
      } finally { fav.disabled = false; }
    });
    body.append(meta, fav);
    card.append(body);
    const onKey = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openStripViewer(strip); } };
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View strip ${strip.themeName || 'untitled'}`);
    card.addEventListener('click', () => openStripViewer(strip));
    card.addEventListener('keydown', onKey);
    mount.append(card);
  }

  if (gallery.loading && gallery.items.length > 0) {
    const loading = document.createElement('div');
    loading.className = 'col-span-full flex justify-center py-6';
    loading.append(Spinner({ size: 24, label: 'Loading more…' }));
    mount.append(loading);
  }
  if (!gallery.hasMore && gallery.items.length) {
    const done = document.createElement('p');
    done.className = 'col-span-full text-center text-xs text-warmth-500 dark:text-warmth-400 py-4';
    done.textContent = 'You have reached the end of your gallery.';
    mount.append(done);
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

export function disposeGallery() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
}
