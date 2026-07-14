import { getState, set, subscribe, pushToast } from '../state.js';
import { fetchStrips, loadMoreStrips, ensureSignedUrl, toggleFavoriteForStrip, loadFavoritesSet } from './gallery.js';
import { openStripViewer } from './viewer.js';
import { Spinner, EmptyState, Button, Icon } from '../ui/components.js';
import { navigate } from '../router.js';

let cleanup = null;
let observer = null;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'single', label: 'Single' },
  { id: 'dual', label: 'Dual' },
];

export async function renderGallery(mount) {
  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-5xl mx-auto px-4 pt-6 pb-32 fade-in';
  const h = document.createElement('div');
  h.className = 'flex items-center justify-between mb-4';
  const title = document.createElement('h1');
  title.className = 'heading-display text-3xl';
  title.textContent = 'Gallery';
  const refresh = Button({ label: 'Refresh', variant: 'ghost', onClick: () => refreshAll() });
  h.append(title, refresh);
  wrap.append(h);

  const filterBar = document.createElement('div');
  filterBar.className = 'flex gap-2 overflow-x-auto no-scrollbar mb-4';
  FILTERS.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-4 py-2 rounded-2xl text-sm border border-warmth-200 whitespace-nowrap';
    b.textContent = f.label;
    b.dataset.filter = f.id;
    b.addEventListener('click', () => applyFilter(f.id));
    filterBar.append(b);
  });
  wrap.append(filterBar);

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  grid.setAttribute('data-grid', 'true');
  wrap.append(grid);

  const sentinel = document.createElement('div');
  sentinel.className = 'h-12 flex items-center justify-center text-sm text-warmth-500';
  sentinel.setAttribute('data-sentinel', 'true');
  wrap.append(sentinel);

  mount.append(wrap);

  await refreshAll();

  const unsubscribe = subscribe((s) => renderGrid(s.gallery, grid));
  renderGrid(getState().gallery, grid);

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        loadMoreStrips().catch(() => {});
      }
    }
  }, { rootMargin: '400px' });
  observer.observe(sentinel);

  cleanup = () => {
    unsubscribe();
    observer?.disconnect();
    observer = null;
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
  refreshAll();
}

async function refreshAll() {
  try {
    const filters = getState().gallery.filters;
    await fetchStrips({ reset: true, ...filters });
    await loadFavoritesSet();
  } catch (err) {
    pushToast({ message: err.message, type: 'error' });
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
    const empty = EmptyState({ title: 'Could not load gallery', message: gallery.error });
    mount.append(empty);
    return;
  }
  if (!gallery.items.length) {
    const take = Button({ label: 'Take a photo', variant: 'primary' });
    take.addEventListener('click', () => navigate('home'));
    const empty = EmptyState({ title: 'No photos yet', message: 'Take your first one to fill this space.' , action: take });
    empty.classList.add('col-span-full');
    mount.append(empty);
    return;
  }

  const filters = gallery.filters || {};
  for (const strip of gallery.items) {
    const card = document.createElement('article');
    card.className = 'card overflow-hidden flex flex-col fade-up cursor-pointer';
    card.style.animationDelay = `${Math.min(gallery.items.indexOf(strip), 12) * 60}ms`;
    const media = document.createElement('div');
    media.className = 'aspect-[3/4] bg-warmth-100 relative';
    media.style.background = strip.previewColor || '#F5F5F5';
    const img = document.createElement('img');
    img.alt = strip.themeName || 'Strip';
    img.loading = 'lazy';
    img.className = 'absolute inset-0 w-full h-full object-cover';
    img.style.opacity = '0';
    img.addEventListener('load', () => { img.style.opacity = '1'; });
    media.append(img);
    card.append(media);
    ensureSignedUrl(strip).then((url) => { if (url) img.src = url; }).catch(() => {});

    const body = document.createElement('div');
    body.className = 'p-3 flex items-center justify-between';
    const meta = document.createElement('div');
    meta.className = 'min-w-0';
    const themeName = document.createElement('p');
    themeName.className = 'text-sm font-medium truncate';
    themeName.textContent = strip.themeName || 'Strip';
    const sub = document.createElement('p');
    sub.className = 'text-xs text-warmth-500';
    sub.textContent = `${strip.mode === 'dual' ? 'Dual' : 'Single'} · ${formatDate(strip.createdAt)}`;
    meta.append(themeName, sub);
    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg';
    fav.setAttribute('aria-label', 'Toggle favorite');
    fav.append(Icon({ name: strip.favorited ? 'heartFilled' : 'heart' }));
    fav.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      fav.disabled = true;
      try {
        await toggleFavoriteForStrip(strip.id);
      } catch {} finally { fav.disabled = false; }
    });
    body.append(meta, fav);
    card.append(body);
    card.addEventListener('click', () => openStripViewer(strip));
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
    done.className = 'col-span-full text-center text-xs text-warmth-500 py-4';
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
