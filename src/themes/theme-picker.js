import { loadTheme, NO_FRAME_THEME } from './theme-loader.js';
import { getState, set, pushToast } from '../state.js';
import { Icon } from '../ui/components.js';
import { fetchThemes } from '../db/themes.js';

const PREVIEW_LAYOUTS = [
  { id: 'strip_4', label: 'Strip' },
  { id: 'grid_2x2', label: 'Grid' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'single', label: 'Single' },
];

const DEFAULT_THEME_IDS = ['none', 'minimal', 'hundred-acre-gang', 'pucca', 'hello-kitty'];

export async function renderThemePicker(mount) {
  const prefs = getState().preferences;
  mount.innerHTML = '';

  const wrap = document.createElement('section');
  wrap.className = 'card p-4 mb-4';

  const heading = document.createElement('div');
  heading.className = 'flex items-center justify-between mb-3';
  const h = document.createElement('h2');
  h.className = 'heading-display text-lg';
  h.textContent = 'Theme';
  const sub = document.createElement('span');
  sub.className = 'text-xs text-warmth-500';
  sub.textContent = 'Tap to preview';
  heading.append(h, sub);
  wrap.append(heading);

  const scroller = document.createElement('div');
  scroller.className = 'theme-picker no-scrollbar';
  wrap.append(scroller);

  const themeList = await listThemes();
  for (const id of themeList) {
    const t = id === 'none' ? NO_FRAME_THEME : await loadTheme(id);
    if (!t) continue;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shrink-0 w-24 flex flex-col items-center gap-2 text-center focus:outline-none';
    card.setAttribute('data-theme-id', t.id);

    const previewWrap = document.createElement('span');
    previewWrap.className = 'relative w-16 h-16 rounded-3xl overflow-hidden border-2 border-warmth-200 dark:border-warmth-300 bg-warmth-50 dark:bg-warmth-100';
    previewWrap.style.background = t.previewColor || t.palette?.background || '#FFFFFF';

    if (t.id !== 'none') {
      const img = document.createElement('img');
      img.className = 'absolute inset-0 w-full h-full object-cover';
      img.alt = `${t.name || t.id} preview`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = `${import.meta.env.BASE_URL}themes/${t.id}/preview.png`;
      img.onerror = () => {
        img.onerror = null;
        img.src = `${import.meta.env.BASE_URL}themes/${t.id}/frame.webp`;
      };
      previewWrap.append(img);
    } else {
      const noneIcon = document.createElement('span');
      noneIcon.className = 'absolute inset-0 flex items-center justify-center text-warmth-400 dark:text-warmth-600 text-2xl';
      noneIcon.textContent = '∅';
      previewWrap.append(noneIcon);
    }

    const label = document.createElement('span');
    label.className = 'text-xs text-warmth-700 dark:text-warmth-200 leading-tight';
    label.textContent = t.name || t.id;
    card.append(previewWrap, label);
    card.addEventListener('click', () => onSelectTheme(t.id));
    scroller.append(card);
  }

  const layoutWrap = document.createElement('div');
  layoutWrap.className = 'mt-4';
  layoutWrap.innerHTML = `
    <p class="text-xs uppercase tracking-widest text-warmth-500 mb-2">Layout</p>
    <div class="grid grid-cols-4 gap-2" data-layouts></div>
  `;
  const layoutRow = layoutWrap.querySelector('[data-layouts]');
  for (const layout of PREVIEW_LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-3 py-2 rounded-2xl text-xs border border-warmth-200';
    b.textContent = layout.label;
    b.dataset.layout = layout.id;
    b.addEventListener('click', () => onSelectLayout(layout.id));
    layoutRow.append(b);
  }

  wrap.append(layoutWrap);
  mount.append(wrap);

  applyActiveStates();
}

async function listThemes() {
  const cached = getState().themes?.cache;
  if (cached && cached.length) return cached.map((t) => t.slug || t.id);
  try {
    const remote = await fetchThemes();
    if (remote && remote.length) {
      const slugs = remote.map((t) => t.slug).filter(Boolean);
      if (slugs.length) {
        set({ themes: { ...(getState().themes || {}), cache: remote } });
        return slugs;
      }
    }
  } catch (err) {
    console.warn('[theme-picker] remote themes failed', err);
  }
  return DEFAULT_THEME_IDS;
}

function onSelectTheme(id) {
  set({ preferences: { ...getState().preferences, themeId: id } });
  set({ capture: { ...getState().capture, themeId: id } });
  applyActiveStates();
  // Notify camera to update preview frame
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { themeId: id } }));
}

function onSelectLayout(id) {
  set({ preferences: { ...getState().preferences, layout: id } });
  set({ capture: { ...getState().capture, layout: id } });
  applyActiveStates();
}

function applyActiveStates() {
  const { themeId, layout } = getState().preferences;
  const cards = document.querySelectorAll('[data-theme-id]');
  cards.forEach((c) => {
    const isActive = c.getAttribute('data-theme-id') === themeId;
    const wrap = c.querySelector('span');
    wrap.classList.toggle('ring-4', isActive);
    wrap.classList.toggle('ring-warmth-900', isActive);
    wrap.classList.toggle('dark:ring-warmth-100', isActive);
  });
  document.querySelectorAll('[data-layout]').forEach((b) => {
    const isActive = b.dataset.layout === layout;
    b.classList.toggle('bg-warmth-900', isActive);
    b.classList.toggle('dark:bg-warmth-100', isActive);
    b.classList.toggle('text-warmth-50', isActive);
    b.classList.toggle('dark:text-warmth-900', isActive);
    b.classList.toggle('border-warmth-900', isActive);
    b.classList.toggle('dark:border-warmth-100', isActive);
  });
}
