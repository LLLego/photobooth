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
let handleThemeChanged = null;
let cameraReady = false;
let activeFlashEnabled = true;

function computeTransform({ zoom, mirror }) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const m = mirror ? ' scaleX(-1)' : '';
  return `scale(${z})${m}`;
}

function applyTransform(el, { zoom, mirror }) {
  if (!el) return;
  el.style.transform = computeTransform({ zoom, mirror });
}

function defaultMirrorForFacing(facing) {
  return facing === 'user' || facing == null;
}

function showFlash(host) {
  if (!activeFlashEnabled) return Promise.resolve();
  return new Promise((resolve) => {
    const f = document.createElement('div');
    f.className = 'flash-overlay';
    host.append(f);
    requestAnimationFrame(() => f.classList.add('active'));
    setTimeout(() => {
      try { f.remove(); } catch {}
      resolve();
    }, 200);
  });
}

export async function renderSingleCamera(mount) {
  const prefs = getState().preferences;
  const layout = prefs.layout || 'strip_4';
  const themeId = prefs.themeId || 'minimal';
  const initialZoom = typeof prefs.zoom === 'number' && prefs.zoom >= 1 && prefs.zoom <= 4 ? prefs.zoom : 1;
  const initialMirror = typeof prefs.mirror === 'boolean' ? prefs.mirror : true;
  activeFlashEnabled = typeof prefs.flashEnabled === 'boolean' ? prefs.flashEnabled : true;
  set({ capture: { ...getState().capture, mode: 'single', layout, themeId, photos: [], status: 'idle' } });

  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-md md:max-w-lg mx-auto px-4 pt-6 pb-40 fade-in';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => cleanupAndExit(mount) });
  const captureCount = document.createElement('span');
  captureCount.className = 'text-sm text-warmth-500 dark:text-warmth-400';
  header.append(back, captureCount);
  wrap.append(header);

  const aspectRatio = getState().preferences.aspectRatio || '3:4';
  const ratioClass = `aspect-[${aspectRatio.replace(':', '/')}]`;
  stage = document.createElement('div');
  stage.className = `camera-stage ${ratioClass} w-full mx-auto`;
  stage.setAttribute('data-ratio', aspectRatio);
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
  flipBtn.disabled = true;
  flipBtn.append(Icon({ name: 'switch', size: 22 }));
  flipBtn.addEventListener('click', async () => {
    flipBtn.disabled = true;
    try {
      activeStream = await flipCamera(videoEl);
    } catch (err) {
      showCameraFallback(err);
    } finally {
      if (cameraReady) flipBtn.disabled = false;
    }
  });
  const captureBtn = document.createElement('button');
  captureBtn.className = 'capture-button';
  captureBtn.disabled = true;
  captureBtn.append(Icon({ name: 'camera', size: 28 }));
  captureBtn.setAttribute('aria-label', 'Capture photo');
  controls.append(flipBtn, captureBtn, document.createElement('span'));

  const cameraFallback = document.createElement('div');
  cameraFallback.className = 'camera-fallback hidden';
  cameraFallback.setAttribute('role', 'alert');
  const fallbackTitle = document.createElement('h2');
  fallbackTitle.className = 'heading-display text-2xl';
  const fallbackMessage = document.createElement('p');
  fallbackMessage.className = 'mt-2 max-w-xs text-sm leading-relaxed text-warmth-200';
  const retryCameraBtn = Button({
    label: 'Try camera again',
    variant: 'honey',
    icon: Icon({ name: 'refresh' }),
    className: 'mt-5',
  });
  cameraFallback.append(fallbackTitle, fallbackMessage, retryCameraBtn);
  stage.append(videoEl, frameEl, overlay, cameraFallback, controls);
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

  // Camera controls: zoom + mirror + flash
  const cameraBar = document.createElement('div');
  cameraBar.className = 'mt-4 flex items-center gap-3 text-xs text-warmth-600 dark:text-warmth-400';
  
  // Zoom slider
  const zoomLabel = document.createElement('span');
  zoomLabel.textContent = '🔍';
  zoomLabel.className = 'shrink-0';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.min = '1';
  zoomSlider.max = '4';
  zoomSlider.step = '0.1';
  zoomSlider.value = String(initialZoom);
  zoomSlider.className = 'flex-1 accent-warmth-800 dark:accent-warmth-200 h-1';
  const zoomValue = document.createElement('span');
  zoomValue.className = 'w-10 text-right font-mono shrink-0';
  zoomValue.textContent = `${initialZoom.toFixed(1)}x`;
  
  zoomSlider.addEventListener('input', () => {
    const z = parseFloat(zoomSlider.value);
    zoomValue.textContent = `${z.toFixed(1)}x`;
    applyTransform(videoEl, { zoom: z, mirror: getState().preferences.mirror });
    set({ preferences: { ...getState().preferences, zoom: z } });
  });
  
  // Mirror toggle
  const mirrorBtn = document.createElement('button');
  mirrorBtn.className = 'shrink-0 px-2 py-1 rounded-lg border border-warmth-200 dark:border-warmth-300 text-xs';
  mirrorBtn.textContent = initialMirror ? '🪞' : '📷';
  mirrorBtn.title = 'Toggle mirror';
  mirrorBtn.addEventListener('click', () => {
    const m = !getState().preferences.mirror;
    mirrorBtn.textContent = m ? '🪞' : '📷';
    applyTransform(videoEl, { zoom: getState().preferences.zoom || 1, mirror: m });
    set({ preferences: { ...getState().preferences, mirror: m } });
  });
  
  // Flash toggle
  const flashBtn = document.createElement('button');
  flashBtn.className = 'shrink-0 px-2 py-1 rounded-lg border border-warmth-200 dark:border-warmth-300 text-xs';
  flashBtn.textContent = activeFlashEnabled ? '⚡' : '🌑';
  flashBtn.title = 'Toggle flash';
  flashBtn.addEventListener('click', () => {
    activeFlashEnabled = !activeFlashEnabled;
    flashBtn.textContent = activeFlashEnabled ? '⚡' : '🌑';
    set({ preferences: { ...getState().preferences, flashEnabled: activeFlashEnabled } });
  });
  
  cameraBar.append(zoomLabel, zoomSlider, zoomValue, mirrorBtn, flashBtn);
  wrap.append(cameraBar);

  // Show flash on capture
  const originalOnCapture = null; // Will be set below
  // Double-tap to reset zoom
  stage.addEventListener('dblclick', () => {
    zoomSlider.value = '1';
    zoomValue.textContent = '1.0x';
    applyTransform(videoEl, { zoom: 1, mirror: getState().preferences.mirror });
    set({ preferences: { ...getState().preferences, zoom: 1 } });
  });

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

  // Load frame overlay immediately — independent of camera permission
  try {
    await setPreviewFrame(frameEl, themeId);
    status.textContent = 'Camera starting…';
  } catch (e) {
    console.warn('[single] frame load failed', e);
  }

  try {
    activeStream = await startLivePreview({ videoEl, frameEl, themeId, onError: (msg) => pushToast({ message: msg, type: 'error' }) });
    status.textContent = 'Ready';
  } catch (err) {
    const isBlocked = err.name === 'NotAllowedError' || err.message?.includes('Permission');
    status.textContent = '';
    status.innerHTML = isBlocked
      ? '<span class="text-amber-600 dark:text-amber-400">🔒 Camera access needed — tap the lock/camera icon in your browser address bar, then try again.</span>'
      : '<span class="text-rose-600 dark:text-rose-400">⚠️ Camera unavailable — check your device connection.</span>';
    
    // Add retry button
    const retryBtn = Button({ 
      label: 'Try again', 
      variant: 'primary', 
      icon: Icon({ name: 'camera' }),
      onClick: async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Connecting…';
        try {
          activeStream = await startLivePreview({ videoEl, frameEl, themeId, onError: (msg) => pushToast({ message: msg, type: 'error' }) });
          status.textContent = 'Ready';
          status.innerHTML = '';
          captureBtn.disabled = false;
          flipBtn.disabled = false;
          retryBtn.remove();
        } catch (e2) {
          retryBtn.textContent = 'Try again';
          retryBtn.disabled = false;
          status.textContent = 'Still unavailable — check browser settings.';
        }
      }
    });
    status.append(document.createElement('br'), retryBtn);
    
    // Disable capture but keep theme picker + filter bar working
    captureBtn.disabled = true;
    flipBtn.disabled = true;
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

  handleThemeChanged = async (ev) => {
    const newThemeId = ev.detail?.themeId;
    if (newThemeId && frameEl) {
      await setPreviewFrame(frameEl, newThemeId);
      status.textContent = 'Ready';
    }
  };
  window.addEventListener('theme-changed', handleThemeChanged);

  // Live aspect ratio switching
  window.addEventListener('ratio-changed', (ev) => {
    const newRatio = ev.detail?.aspectRatio;
    if (newRatio && stage) {
      const rc = `aspect-[${newRatio.replace(':', '/')}]`;
      stage.className = `camera-stage ${rc} w-full mx-auto`;
      stage.setAttribute('data-ratio', newRatio);
    }
  });

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
      await showFlash(stage);
      const theme = await loadTheme(getState().preferences.themeId || 'minimal');
      const { blob } = await takePhoto(videoEl, null, theme, { filter: getFilterCSS(getState().preferences.filterId || 'original') });
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
  if (handleThemeChanged) {
    window.removeEventListener('theme-changed', handleThemeChanged);
    handleThemeChanged = null;
  }
  navigate('home');
}

export function disposeSingleCamera() {
  try { stopLivePreview(videoEl); } catch {}
  activeStream = null;
}
