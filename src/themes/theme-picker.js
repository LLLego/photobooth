import { loadTheme, NO_FRAME_THEME } from './theme-loader.js';
import { getState, set } from '../state.js';
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
  wrap.className = 'card p-4 pb-4 mb-4';

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
  scroller.className = 'theme-picker no-scrollbar theme-picker-scroller';
  wrap.append(scroller);

  const themeList = await listThemes();
  for (const id of themeList) {
    const t = id === 'none' ? NO_FRAME_THEME : await loadTheme(id);
    if (!t) continue;

    // Show variants if available, otherwise single card
    const variants = (t.variants && t.variants.length) ? t.variants : [{ id: t.id, name: t.name || t.id, frame: t.frame?.url, preview: `./preview.png` }];

    for (const v of variants) {
      const variantKey = t.id === 'none' ? 'none' : `${t.id}/${v.id}`;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card shrink-0 w-24 min-w-24 flex flex-col items-center gap-2 text-center focus:outline-none';
      card.setAttribute('data-theme-id', variantKey);
      card.setAttribute('data-frame-url', v.frame || '');
      card.setAttribute('aria-pressed', 'false');

      const previewWrap = document.createElement('span');
      previewWrap.className = 'theme-thumb relative w-16 h-16 rounded-3xl overflow-hidden border-2 border-warmth-200 dark:border-warmth-300 bg-warmth-50 dark:bg-warmth-100 transition-transform duration-150 ease-out';
      previewWrap.style.background = t.previewColor || t.palette?.background || '#FFFFFF';

      if (t.id !== 'none') {
        const img = document.createElement('img');
        img.className = 'absolute inset-0 w-full h-full object-cover';
        img.alt = `${v.name} preview`;
        img.loading = 'lazy';
        img.decoding = 'async';
        const baseUrl = `${import.meta.env.BASE_URL}themes/${t.id}`;
        img.src = `${baseUrl}/${v.preview || 'preview.png'}`;
        img.onerror = () => {
          img.onerror = null;
          // Try base theme preview first (helps when the variant preview is missing).
          if (v.preview && v.preview !== 'preview.png') {
            img.src = `${baseUrl}/preview.png`;
            img.onerror = () => {
              img.onerror = null;
              img.src = `${baseUrl}/frame.webp`;
            };
          } else {
            img.src = `${baseUrl}/frame.webp`;
          }
        };
        previewWrap.append(img);
      } else {
        const noneIcon = document.createElement('span');
        noneIcon.className = 'absolute inset-0 flex items-center justify-center text-warmth-400 dark:text-warmth-600 text-2xl';
        noneIcon.textContent = '∅';
        previewWrap.append(noneIcon);
      }

      const label = document.createElement('span');
      label.className = 'theme-card-label text-xs text-warmth-700 dark:text-warmth-200 leading-tight';
      label.textContent = v.name;

      const badge = document.createElement('span');
      badge.className = 'theme-card-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = '✓';

      card.append(previewWrap, label, badge);
      card.addEventListener('click', () => onSelectTheme(variantKey, v.frame || t.frame?.url));
      scroller.append(card);
    }
  }

  const layoutWrap = document.createElement('div');
  layoutWrap.className = 'mt-2 pt-2 border-t border-warmth-200 dark:border-warmth-300';
  layoutWrap.innerHTML = `
    <p class="text-xs uppercase tracking-widest text-warmth-500 mb-2">Layout</p>
    <div class="grid grid-cols-4 gap-2" data-layouts></div>
  `;
  const layoutRow = layoutWrap.querySelector('[data-layouts]');
  for (const layout of PREVIEW_LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-3 py-2 rounded-2xl text-xs border bg-transparent border-warmth-200 dark:border-warmth-300 text-warmth-900 dark:text-warmth-100 transition-colors duration-150';
    b.textContent = layout.label;
    b.dataset.layout = layout.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => onSelectLayout(layout.id));
    layoutRow.append(b);
  }

  wrap.append(layoutWrap);

  // Aspect ratio selector
  const ratioWrap = document.createElement('div');
  ratioWrap.className = 'mt-2 pt-2 border-t border-warmth-200 dark:border-warmth-300';
  ratioWrap.innerHTML = `
    <p class="text-xs uppercase tracking-widest text-warmth-500 mb-2">Aspect ratio</p>
    <div class="grid grid-cols-4 gap-2" data-ratios></div>
  `;
  const ratioRow = ratioWrap.querySelector('[data-ratios]');
  const RATIOS = [
    { id: '1:1', label: '1:1' },
    { id: '3:4', label: '3:4' },
    { id: '4:3', label: '4:3' },
    { id: '16:9', label: '16:9' },
  ];
  for (const r of RATIOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-3 py-2 rounded-2xl text-xs border bg-transparent border-warmth-200 dark:border-warmth-300 text-warmth-900 dark:text-warmth-100 transition-colors duration-150';
    b.textContent = r.label;
    b.dataset.ratio = r.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => onSelectRatio(r.id));
    ratioRow.append(b);
  }
  wrap.append(ratioWrap);

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

function onSelectTheme(id, frameUrl) {
  set({ preferences: { ...getState().preferences, themeId: id } });
  set({ capture: { ...getState().capture, themeId: id } });
  applyActiveStates();
  // Notify camera to update preview frame
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { themeId: id, frameUrl } }));
}

function onSelectLayout(id) {
  set({ preferences: { ...getState().preferences, layout: id } });
  set({ capture: { ...getState().capture, layout: id } });
  applyActiveStates();
}

function onSelectRatio(id) {
  set({ preferences: { ...getState().preferences, aspectRatio: id } });
  set({ capture: { ...getState().capture, aspectRatio: id } });
  applyActiveStates();
  // Update camera stage aspect ratio
  window.dispatchEvent(new CustomEvent('ratio-changed', { detail: { aspectRatio: id } }));
}

function applyActiveStates() {
  const { themeId, layout } = getState().preferences;
  const cards = document.querySelectorAll('[data-theme-id]');
  cards.forEach((c) => {
    const isActive = c.getAttribute('data-theme-id') === themeId;
    c.classList.toggle('is-active', isActive);
    c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    const badge = c.querySelector('.theme-card-badge');
    if (badge) badge.classList.toggle('is-visible', isActive);
  });
  document.querySelectorAll('[data-layout]').forEach((b) => {
    const isActive = b.dataset.layout === layout;
    b.classList.remove(
      'bg-warmth-900', 'dark:bg-warmth-100',
      'text-warmth-50', 'dark:text-warmth-900',
      'border-warmth-900', 'dark:border-warmth-100',
      'bg-transparent', 'text-warmth-900', 'dark:text-warmth-100',
      'border-warmth-200', 'dark:border-warmth-300'
    );
    if (isActive) {
      b.classList.add(
        'bg-warmth-900', 'dark:bg-warmth-100',
        'text-warmth-50', 'dark:text-warmth-900',
        'border-warmth-900', 'dark:border-warmth-100'
      );
    } else {
      b.classList.add(
        'bg-transparent', 'text-warmth-900', 'dark:text-warmth-100',
        'border-warmth-200', 'dark:border-warmth-300'
      );
    }
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  // Aspect ratio buttons
  document.querySelectorAll('[data-ratio]').forEach((b) => {
    const ratioId = getState().preferences.aspectRatio || '3:4';
    const isActive = b.dataset.ratio === ratioId;
    b.classList.remove(
      'bg-warmth-900', 'dark:bg-warmth-100',
      'text-warmth-50', 'dark:text-warmth-900',
      'border-warmth-900', 'dark:border-warmth-100',
      'bg-transparent', 'text-warmth-900', 'dark:text-warmth-100',
      'border-warmth-200', 'dark:border-warmth-300'
    );
    if (isActive) {
      b.classList.add(
        'bg-warmth-900', 'dark:bg-warmth-100',
        'text-warmth-50', 'dark:text-warmth-900',
        'border-warmth-900', 'dark:border-warmth-100'
      );
    } else {
      b.classList.add(
        'bg-transparent', 'text-warmth-900', 'dark:text-warmth-100',
        'border-warmth-200', 'dark:border-warmth-300'
      );
    }
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}
