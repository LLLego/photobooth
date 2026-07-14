import { getState, set, pushToast } from '../state.js';
import { startLivePreview, stopLivePreview, flipCamera, setPreviewFrame } from '../camera/preview.js';
import { describeCameraError } from '../camera/camera.js';
import { takePhoto } from '../camera/capture.js';
import { startCountdown } from './countdown.js';
import { Button, Icon, Spinner } from './components.js';
import { FILTER_PRESETS, getFilterCSS } from '../camera/filters.js';
import { renderThemePicker } from '../themes/theme-picker.js';
import { loadTheme } from '../themes/theme-loader.js';
import { compositeStrip } from '../strips/compositor.js';
import { exportStrip, downloadStrip, shareStrip } from '../strips/export.js';
import { requiredPhotoCount, getLayout } from '../strips/layouts.js';
import { createSession, completeSession } from '../db/sessions.js';
import { uploadStrip } from '../db/strips.js';
import { navigate } from '../router.js';
import { storageSet } from '../utils/storage.js';

let activeStream = null;
let stage = null;
let videoEl = null;
let frameEl = null;
let currentSessionId = null;

export async function renderSingleCamera(mount) {
  const prefs = getState().preferences;
  const layout = prefs.layout || 'strip_4';
  const themeId = prefs.themeId || 'minimal';
  set({ capture: { ...getState().capture, mode: 'single', layout, themeId, photos: [], status: 'idle' } });

  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-md mx-auto px-4 pt-6 pb-32 fade-in';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => cleanupAndExit(mount) });
  const captureCount = document.createElement('span');
  captureCount.className = 'text-sm text-warmth-500 dark:text-warmth-400';
  header.append(back, captureCount);
  wrap.append(header);

  stage = document.createElement('div');
  stage.className = 'camera-stage aspect-[3/4] w-full mx-auto';
  videoEl = document.createElement('video');
  videoEl.className = 'camera-video';
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  frameEl = document.createElement('img');
  frameEl.className = 'camera-frame';
  frameEl.alt = '';
  frameEl.style.display = 'none';
  const overlay = document.createElement('div');
  overlay.className = 'camera-overlay-grid';
  const controls = document.createElement('div');
  controls.className = 'camera-controls';
  const flipBtn = document.createElement('button');
  flipBtn.className = 'btn-ghost w-12 h-12 rounded-full p-0';
  flipBtn.append(Icon({ name: 'switch', size: 22 }));
  flipBtn.addEventListener('click', async () => {
    flipBtn.disabled = true;
    try { activeStream = await flipCamera(videoEl); }
    catch (err) { pushToast({ message: err.message, type: 'error' }); }
    finally { flipBtn.disabled = false; }
  });
  const captureBtn = document.createElement('button');
  captureBtn.className = 'capture-button';
  captureBtn.append(Icon({ name: 'camera', size: 28 }));
  captureBtn.setAttribute('aria-label', 'Capture photo');
  captureBtn.addEventListener('click', () => onCapture());
  controls.append(flipBtn, captureBtn, document.createElement('span'));
  stage.append(videoEl, frameEl, overlay, controls);
  wrap.append(stage);

  const status = document.createElement('p');
  status.className = 'text-center text-sm text-warmth-500 dark:text-warmth-400 mt-3';
  status.textContent = 'Starting camera…';
  wrap.append(status);

  const themeCard = document.createElement('div');
  themeCard.className = 'mt-6';
  wrap.append(themeCard);
  await renderThemePicker(themeCard);

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'mt-4';
  filterBar.innerHTML = '<p class="text-xs uppercase tracking-widest text-warmth-500 dark:text-warmth-400 mb-2">Filter</p>';
  const filterScroller = document.createElement('div');
  filterScroller.className = 'flex gap-2 overflow-x-auto no-scrollbar pb-1';
  for (const f of FILTER_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shrink-0 px-3 py-1.5 rounded-2xl text-xs font-medium border border-warmth-200 dark:border-warmth-300 text-warmth-700 dark:text-warmth-200 whitespace-nowrap transition';
    btn.textContent = f.name;
    btn.dataset.filter = f.id;
    btn.addEventListener('click', () => {
      applyFilter(f.id);
    });
    if (f.id === (prefs.filterId || 'original')) {
      btn.classList.add('bg-warmth-900', 'text-warmth-50', 'dark:bg-warmth-100', 'dark:text-warmth-900');
    }
    filterScroller.append(btn);
  }
  // Apply saved filter to the video element up front
  const savedFilterId = prefs.filterId || 'original';
  const savedFilterCss = getFilterCSS(savedFilterId);
  if (videoEl) {
    videoEl.style.filter = savedFilterCss === 'none' ? '' : savedFilterCss;
  }
  filterBar.append(filterScroller);
  wrap.append(filterBar);

  const review = document.createElement('div');
  review.className = 'mt-6 space-y-3';
  review.setAttribute('data-review', 'true');
  wrap.append(review);

  const finalBar = document.createElement('div');
  finalBar.className = 'mt-6 hidden flex gap-2';
  finalBar.setAttribute('data-final', 'true');
  const downloadBtn = Button({ label: 'Download', variant: 'primary', icon: Icon({ name: 'download' }) });
  const saveBtn = Button({ label: 'Save to gallery', variant: 'honey', icon: Icon({ name: 'check' }) });
  const shareBtn = Button({ label: 'Share', variant: 'ghost', icon: Icon({ name: 'share' }) });
  const retakeBtn = Button({ label: 'Start over', variant: 'ghost', icon: Icon({ name: 'back' }) });
  finalBar.append(retakeBtn, downloadBtn, shareBtn, saveBtn);
  wrap.append(finalBar);

  mount.append(wrap);
  const reviewList = review;
  let localPhotos = [];

  try {
    activeStream = await startLivePreview({ videoEl, frameEl, themeId, onError: (msg) => pushToast({ message: msg, type: 'error' }) });
    status.textContent = 'Ready';
  } catch (err) {
    status.textContent = describeCameraError(err);
    pushToast({ message: describeCameraError(err), type: 'error' });
  }

  captureBtn.addEventListener('click', onCapture);

  // Live theme switching — update frame overlay when user picks a new theme
  function applyFilter(id) {
    filterScroller.querySelectorAll('button').forEach(b => {
      const active = b.dataset.filter === id;
      b.classList.toggle('bg-warmth-900', active);
      b.classList.toggle('text-warmth-50', active);
      b.classList.toggle('dark:bg-warmth-100', active);
      b.classList.toggle('dark:text-warmth-900', active);
    });
    const css = getFilterCSS(id);
    if (videoEl) {
      videoEl.style.filter = css === 'none' ? '' : css;
    }
    set({ preferences: { ...getState().preferences, filterId: id } });
  }

  const handleThemeChanged = async (ev) => {
    const newThemeId = ev.detail?.themeId;
    const frameUrl = ev.detail?.frameUrl;
    if (newThemeId && frameEl) {
      if (frameUrl) {
        frameEl.src = frameUrl;
        frameEl.style.display = '';
      } else {
        await setPreviewFrame(frameEl, newThemeId);
      }
      status.textContent = 'Ready';
    }
  };
  window.addEventListener('theme-changed', handleThemeChanged);

  function updateCount() {
    const req = requiredPhotoCount(getState().capture.layout || layout);
    captureCount.textContent = `${localPhotos.length} / ${req}`;
  }
  updateCount();

  async function onCapture() {
    if (!videoEl || videoEl.readyState < 2) {
      pushToast({ message: 'Camera not ready yet.', type: 'warn' });
      return;
    }
    captureBtn.disabled = true;
    status.textContent = 'Get ready…';
    try {
      await startCountdown(stage, { duration: getState().preferences.countdownDuration });
      const theme = await loadTheme(getState().preferences.themeId || 'minimal');
      const slots = (theme.photoSlots || {})[getState().capture.layout || layout] || [{ x: 0, y: 0, w: 1, h: 1 }];
      const { blob } = await takePhoto(videoEl, theme?.frame?.url || null, theme, { slots, filter: getFilterCSS(getState().preferences.filterId || 'original') });
      localPhotos.push(blob);
      renderReview();
      updateCount();
      const req = requiredPhotoCount(getState().capture.layout || layout);
      if (localPhotos.length >= req) {
        await finalize();
      }
    } catch (err) {
      pushToast({ message: err.message || 'Capture failed.', type: 'error' });
    } finally {
      captureBtn.disabled = false;
    }
  }

  function renderReview() {
    reviewList.innerHTML = '';
    const layoutId = getState().capture.layout || layout;
    const req = requiredPhotoCount(layoutId);
    if (!localPhotos.length) {
      const tip = document.createElement('p');
      tip.className = 'text-sm text-warmth-500 dark:text-warmth-400 text-center';
      tip.textContent = `Take ${req} ${req === 1 ? 'photo' : 'photos'} to compose your strip.`;
      reviewList.append(tip);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-4 gap-2';
    for (const blob of localPhotos) {
      const card = document.createElement('div');
      card.className = 'aspect-[3/4] rounded-2xl overflow-hidden bg-warmth-100 dark:bg-warmth-200';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.className = 'w-full h-full object-cover';
      img.alt = 'Captured';
      card.append(img);
      grid.append(card);
    }
    reviewList.append(grid);
  }

  async function finalize() {
    status.textContent = 'Composing strip…';
    const themeId = getState().preferences.themeId || 'minimal';
    const layoutId = getState().capture.layout || layout;
    const theme = await loadTheme(themeId);
    try {
      const canvas = await compositeStrip(localPhotos, theme, layoutId);
      const { blob, suggestedName } = await exportStrip(canvas, { format: 'image/webp', quality: 0.9 });
      const preview = document.createElement('div');
      preview.className = 'strip-preview mt-4';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.alt = 'Composed strip';
      preview.append(img);
      reviewList.append(preview);

      finalBar.classList.remove('hidden');
      finalBar.classList.add('flex');
      captureBtn.disabled = true;
      flipBtn.disabled = true;
      status.textContent = 'Ready to save or share';

      const prefs = getState().preferences;
      if (prefs.autoDownload) downloadStrip(blob, suggestedName);

      downloadBtn.onclick = () => downloadStrip(blob, suggestedName);
      shareBtn.onclick = async () => {
        try {
          const r = await shareStrip(blob, { filename: suggestedName });
          if (!r.shared && !r.cancelled) pushToast({ message: 'Saved a copy locally.', type: 'info' });
        } catch (err) { pushToast({ message: err.message, type: 'error' }); }
      };
      retakeBtn.onclick = () => {
        localPhotos = [];
        finalBar.classList.add('hidden');
        finalBar.classList.remove('flex');
        captureBtn.disabled = false;
        flipBtn.disabled = false;
        status.textContent = 'Ready';
        renderReview();
        updateCount();
      };
      saveBtn.onclick = async () => {
        try {
          saveBtn.disabled = true;
          status.textContent = 'Saving…';
          // Extract base theme from variant keys like "hundred-acre-gang/pooh"
          const baseThemeId = themeId.includes('/') ? themeId.split('/')[0] : themeId;
          const session = await createSession({ mode: 'single', themeId: baseThemeId, layout: layoutId });
          currentSessionId = session.id;
          await uploadStrip({ sessionId: session.id, blob, layout: layoutId, themeId: baseThemeId, isPrivate: false });
          await completeSession(session.id);
          pushToast({ message: 'Saved to gallery.', type: 'success' });
          navigate('gallery', {}, { replace: true, force: true });
        } catch (err) {
          pushToast({ message: err.message, type: 'error' });
          saveBtn.disabled = false;
          status.textContent = 'Could not save';
        }
      };
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
      status.textContent = 'Compose failed';
    }
  }

  return () => {
    window.removeEventListener('theme-changed', handleThemeChanged);
    try { stopLivePreview(videoEl); } catch {}
    activeStream = null;
  };
}

function cleanupAndExit(mount) {
  try { stopLivePreview(videoEl); } catch {}
  activeStream = null;
  navigate('home');
}

export function disposeSingleCamera() {
  try { stopLivePreview(videoEl); } catch {}
  activeStream = null;
}
