import { getState, set, pushToast } from '../state.js';
import { startLivePreview, stopLivePreview, flipCamera, setPreviewFrame, startCanvasPreview } from '../camera/preview.js';
import { describeCameraError } from '../camera/camera.js';
import { takePhoto } from '../camera/capture.js';
import { startCountdown } from './countdown.js';
import { Button, Icon } from './components.js';
import { FILTER_PRESETS, getFilterCSS } from '../camera/filters.js';
import { renderThemePicker } from '../themes/theme-picker.js';
import { loadTheme } from '../themes/theme-loader.js';
import { compositeStrip } from '../strips/compositor.js';
import { exportStrip, downloadStrip, shareStrip } from '../strips/export.js';
import { requiredPhotoCount } from '../strips/layouts.js';
import { createSession, completeSession } from '../db/sessions.js';
import { uploadStrip } from '../db/strips.js';
import { navigate } from '../router.js';

const RATIO_MAP = { '1:1': '1 / 1', '3:4': '3 / 4', '4:3': '4 / 3', '16:9': '16 / 9' };

export async function renderSingleCamera(mount) {
  const prefs = getState().preferences;
  const layout = prefs.layout || 'strip_4';
  const themeId = prefs.themeId || 'minimal';
  const initialZoom = typeof prefs.zoom === 'number' && prefs.zoom >= 1 && prefs.zoom <= 4 ? prefs.zoom : 1;
  const initialMirror = typeof prefs.mirror === 'boolean' ? prefs.mirror : true;
  const flashEnabled = typeof prefs.flashEnabled === 'boolean' ? prefs.flashEnabled : true;
  set({ capture: { ...getState().capture, mode: 'single', layout, themeId, photos: [], status: 'idle' } });

  mount.innerHTML = '';

  // All DOM refs and listeners live in this closure — released by the
  // returned teardown function when the router unmounts this route.
  let videoEl = null;
  let previewCanvas = null;
  let frameEl = null;
  let stage = null;
  let activeStream = null;
  let stopCanvasPreview = null;
  let handleThemeChanged = null;
  let handleRatioChanged = null;
  let cameraReady = false;
  let captureSequenceActive = false;
  let localPhotos = [];
  let thumbnailUrls = [];
  let resultUrl = null;

  const wrap = document.createElement('div');
  wrap.className = 'max-w-md md:max-w-lg mx-auto px-4 pt-6 pb-40 fade-in';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => cleanupAndExit() });
  const captureCount = document.createElement('span');
  captureCount.className = 'text-sm text-warmth-500';
  header.append(back, captureCount);
  wrap.append(header);

  const aspectRatio = getState().preferences.aspectRatio || '3:4';
  stage = document.createElement('div');
  stage.className = 'camera-stage w-full mx-auto';
  stage.style.aspectRatio = RATIO_MAP[aspectRatio] || '3 / 4';
  stage.setAttribute('data-ratio', aspectRatio);

  videoEl = document.createElement('video');
  videoEl.className = 'camera-source-video';
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;

  previewCanvas = document.createElement('canvas');
  previewCanvas.className = 'camera-live-canvas';
  previewCanvas.setAttribute('aria-label', 'Camera preview');

  frameEl = document.createElement('img');
  frameEl.className = 'camera-frame-source';
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
      pushToast({ message: describeCameraError(err), type: 'error' });
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
  // Wire the click handler BEFORE camera init so any enabled state later
  // (initial success or post-retry) responds to taps.
  captureBtn.addEventListener('click', onCapture);

  stage.append(videoEl, previewCanvas, frameEl, overlay, controls);
  wrap.append(stage);

  const status = document.createElement('p');
  status.className = 'text-center text-sm text-warmth-500 mt-3';
  status.textContent = 'Starting camera…';
  wrap.append(status);

  const themeCard = document.createElement('div');
  themeCard.className = 'mt-6';
  wrap.append(themeCard);
  await renderThemePicker(themeCard);

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'mt-4';
  filterBar.innerHTML = '<p class="text-xs uppercase tracking-widest text-warmth-500 mb-2">Filter</p>';
  const filterScroller = document.createElement('div');
  filterScroller.className = 'flex gap-2 overflow-x-auto no-scrollbar pb-1';
  const filterButtons = new Map();
  for (const f of FILTER_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shrink-0 px-3 py-1.5 rounded-2xl text-xs font-medium border border-warmth-200 text-warmth-700 whitespace-nowrap transition';
    btn.textContent = f.name;
    btn.dataset.filter = f.id;
    btn.addEventListener('click', () => applyFilter(f.id));
    filterScroller.append(btn);
    filterButtons.set(f.id, btn);
  }
  const savedFilterId = prefs.filterId || 'original';
  if (filterButtons.has(savedFilterId)) {
    const btn = filterButtons.get(savedFilterId);
    btn.classList.add('bg-warmth-900', 'text-warmth-50');
  }
  filterBar.append(filterScroller);
  wrap.append(filterBar);

  // Camera controls: zoom + mirror + flash
  const cameraBar = document.createElement('div');
  cameraBar.className = 'mt-4 flex items-center gap-3 text-xs text-warmth-600';

  const zoomLabel = document.createElement('span');
  zoomLabel.textContent = '🔍';
  zoomLabel.className = 'shrink-0';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.min = '1';
  zoomSlider.max = '4';
  zoomSlider.step = '0.1';
  zoomSlider.value = String(initialZoom);
  zoomSlider.className = 'flex-1 accent-warmth-800 h-1';
  const zoomValue = document.createElement('span');
  zoomValue.className = 'w-10 text-right font-mono shrink-0';
  zoomValue.textContent = `${initialZoom.toFixed(1)}x`;

  zoomSlider.addEventListener('input', () => {
    const z = parseFloat(zoomSlider.value);
    zoomValue.textContent = `${z.toFixed(1)}x`;
    set({ preferences: { ...getState().preferences, zoom: z } });
  });

  const mirrorBtn = document.createElement('button');
  mirrorBtn.className = 'shrink-0 px-2 py-1 rounded-lg border border-warmth-200 text-xs';
  mirrorBtn.textContent = initialMirror ? '🪞' : '📷';
  mirrorBtn.title = 'Toggle mirror';
  mirrorBtn.addEventListener('click', () => {
    const m = !getState().preferences.mirror;
    mirrorBtn.textContent = m ? '🪞' : '📷';
    set({ preferences: { ...getState().preferences, mirror: m } });
  });

  const flashBtn = document.createElement('button');
  flashBtn.className = 'shrink-0 px-2 py-1 rounded-lg border border-warmth-200 text-xs';
  flashBtn.textContent = flashEnabled ? '⚡' : '🌑';
  flashBtn.title = 'Toggle flash';
  flashBtn.addEventListener('click', () => {
    const next = !getState().preferences.flashEnabled;
    flashBtn.textContent = next ? '⚡' : '🌑';
    set({ preferences: { ...getState().preferences, flashEnabled: next } });
  });

  cameraBar.append(zoomLabel, zoomSlider, zoomValue, mirrorBtn, flashBtn);
  wrap.append(cameraBar);

  stage.addEventListener('dblclick', () => {
    zoomSlider.value = '1';
    zoomValue.textContent = '1.0x';
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

  // ============ Lifecycle management ============

  function applyFilter(id) {
    for (const [fid, btn] of filterButtons.entries()) {
      const active = fid === id;
      btn.classList.toggle('bg-warmth-900', active);
      btn.classList.toggle('text-warmth-50', active);
    }
    set({ preferences: { ...getState().preferences, filterId: id } });
  }

  function updateCount() {
    const req = requiredPhotoCount(getState().capture.layout || layout);
    const next = Math.min(localPhotos.length + 1, req);
    captureCount.textContent = localPhotos.length >= req
      ? `${req} of ${req} photos`
      : `Photo ${next} of ${req}`;
  }

  function updateCaptureState(statusValue) {
    set({
      capture: {
        ...getState().capture,
        photos: [...localPhotos],
        status: statusValue,
      },
    });
  }

  function clearThumbnailUrls() {
    for (const url of thumbnailUrls) URL.revokeObjectURL(url);
    thumbnailUrls = [];
  }

  function clearResultUrl() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }
  updateCount();
  renderReview();

  function getOptions() {
    const p = getState().preferences || {};
    return {
      zoom: p.zoom || 1,
      mirror: p.mirror !== false,
      filter: getFilterCSS(p.filterId || 'original'),
    };
  }

  // Load frame overlay immediately — independent of camera permission
  try {
    await setPreviewFrame(frameEl, themeId);
    status.textContent = 'Camera starting…';
  } catch (e) {
    console.warn('[single] frame load failed', e);
  }

  try {
    activeStream = await startLivePreview({
      videoEl,
      frameEl,
      themeId,
      onError: (msg) => pushToast({ message: msg, type: 'error' }),
    });
    cameraReady = true;
    status.textContent = 'Ready';
    captureBtn.disabled = false;
    flipBtn.disabled = false;
  } catch (err) {
    const isBlocked = err.name === 'NotAllowedError' || err.message?.includes('Permission');
    status.textContent = '';
    status.innerHTML = isBlocked
      ? '<span class="text-amber-600">🔒 Camera access needed — tap the lock/camera icon in your browser address bar, then try again.</span>'
      : '<span class="text-rose-600">⚠️ Camera unavailable — check your device connection.</span>';

    const retryBtn = Button({
      label: 'Try again',
      variant: 'primary',
      icon: Icon({ name: 'camera' }),
      onClick: async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Connecting…';
        try {
          activeStream = await startLivePreview({
            videoEl,
            frameEl,
            themeId,
            onError: (msg) => pushToast({ message: msg, type: 'error' }),
          });
          cameraReady = true;
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
      },
    });
    status.append(document.createElement('br'), retryBtn);

    captureBtn.disabled = true;
    flipBtn.disabled = true;
  }

  // Spin up the canvas-based preview loop after the camera is ready.
  if (previewCanvas && videoEl) {
    stopCanvasPreview = startCanvasPreview({
      videoEl,
      canvasEl: previewCanvas,
      frameEl,
      getOptions,
    });
  }

  handleThemeChanged = async (ev) => {
    const newThemeId = ev.detail?.themeId;
    if (newThemeId && frameEl) {
      try {
        await setPreviewFrame(frameEl, newThemeId);
        status.textContent = 'Ready';
      } catch (err) {
        console.warn('[single] frame swap failed', err);
      }
    }
  };
  window.addEventListener('theme-changed', handleThemeChanged);

  handleRatioChanged = (ev) => {
    const newRatio = ev.detail?.aspectRatio;
    if (newRatio && stage) {
      stage.style.aspectRatio = RATIO_MAP[newRatio] || '3 / 4';
      stage.setAttribute('data-ratio', newRatio);
    }
  };
  window.addEventListener('ratio-changed', handleRatioChanged);

  async function onCapture() {
    if (captureSequenceActive) return;
    if (!videoEl || videoEl.readyState < 2) {
      pushToast({ message: 'Camera not ready yet.', type: 'warn' });
      return;
    }

    captureSequenceActive = true;
    captureBtn.disabled = true;
    flipBtn.disabled = true;
    const req = requiredPhotoCount(getState().capture.layout || layout);
    try {
      while (localPhotos.length < req) {
        const position = localPhotos.length + 1;
        status.textContent = `Photo ${position} of ${req} — get ready…`;
        updateCaptureState('countdown');
        const theme = await loadTheme(getState().preferences.themeId || 'minimal');
        const { blob } = await startCountdown(stage, {
          duration: getState().preferences.countdownDuration,
          flashEnabled: getState().preferences.flashEnabled !== false,
          onSnap: () => takePhoto(videoEl, frameEl, theme, {
            filter: getFilterCSS(getState().preferences.filterId || 'original'),
            zoom: getState().preferences.zoom || 1,
            mirror: getState().preferences.mirror !== false,
          }),
        });
        localPhotos.push(blob);
        updateCaptureState('captured');
        renderReview();
        updateCount();
        if (localPhotos.length < req) {
          status.textContent = `Photo ${localPhotos.length} captured — next up: ${localPhotos.length + 1} of ${req}`;
        }
      }
      await finalize();
    } catch (err) {
      updateCaptureState('error');
      pushToast({ message: err.message || 'Capture failed.', type: 'error' });
      status.textContent = `Capture paused at photo ${localPhotos.length + 1} of ${req}`;
    } finally {
      captureSequenceActive = false;
      if (localPhotos.length < req) {
        captureBtn.disabled = !cameraReady;
        flipBtn.disabled = !cameraReady;
      }
    }
  }

  function renderReview() {
    clearThumbnailUrls();
    review.innerHTML = '';
    const layoutId = getState().capture.layout || layout;
    const req = requiredPhotoCount(layoutId);
    const label = document.createElement('p');
    label.className = 'capture-thumbnails-label';
    label.textContent = localPhotos.length
      ? `${localPhotos.length} of ${req} captured`
      : `Your ${req === 1 ? 'photo' : 'photos'} will appear here`;

    const grid = document.createElement('div');
    grid.className = 'capture-thumbnails';
    grid.style.gridTemplateColumns = `repeat(${req}, minmax(0, 1fr))`;
    for (let i = 0; i < req; i++) {
      const card = document.createElement('div');
      card.className = 'capture-thumbnail';
      if (localPhotos[i]) {
        const img = document.createElement('img');
        const url = URL.createObjectURL(localPhotos[i]);
        thumbnailUrls.push(url);
        img.src = url;
        img.alt = `Photo ${i + 1}`;
        card.append(img);
        card.classList.add('is-filled');
        if (i === localPhotos.length - 1) card.classList.add('is-new');
      } else {
        const slot = document.createElement('span');
        slot.textContent = String(i + 1);
        slot.setAttribute('aria-label', `Empty photo slot ${i + 1}`);
        card.append(slot);
      }
      grid.append(card);
    }
    review.append(label, grid);
  }

  async function finalize() {
    status.textContent = 'Composing strip…';
    const themeIdFinal = getState().preferences.themeId || 'minimal';
    const layoutId = getState().capture.layout || layout;
    const theme = await loadTheme(themeIdFinal);
    try {
      const canvas = await compositeStrip(localPhotos, theme, layoutId, { frame: false });
      const { blob, suggestedName } = await exportStrip(canvas, { format: 'image/png' });
      const preview = document.createElement('div');
      preview.className = 'strip-preview mt-4';
      const img = document.createElement('img');
      clearResultUrl();
      resultUrl = URL.createObjectURL(blob);
      img.src = resultUrl;
      img.alt = 'Composed strip';
      preview.append(img);
      review.append(preview);

      finalBar.classList.remove('hidden');
      finalBar.classList.add('flex');
      captureBtn.disabled = true;
      flipBtn.disabled = true;
      status.textContent = 'Ready to save or share';

      const prefsNow = getState().preferences;
      if (prefsNow.autoDownload) downloadStrip(blob, suggestedName);

      downloadBtn.onclick = () => downloadStrip(blob, suggestedName);
      shareBtn.onclick = async () => {
        try {
          const r = await shareStrip(blob, { filename: suggestedName });
          if (!r.shared && !r.cancelled) pushToast({ message: 'Saved a copy locally.', type: 'info' });
        } catch (err) {
          pushToast({ message: err.message, type: 'error' });
        }
      };
      retakeBtn.onclick = () => {
        localPhotos = [];
        clearResultUrl();
        finalBar.classList.add('hidden');
        finalBar.classList.remove('flex');
        captureBtn.disabled = !cameraReady;
        flipBtn.disabled = !cameraReady;
        status.textContent = 'Ready';
        updateCaptureState('idle');
        renderReview();
        updateCount();
      };
      saveBtn.onclick = async () => {
        try {
          saveBtn.disabled = true;
          status.textContent = 'Saving…';
          const user = getState().user;
          if (user) {
            const baseThemeId = themeIdFinal.includes('/') ? themeIdFinal.split('/')[0] : themeIdFinal;
            const session = await createSession({ mode: 'single', themeId: baseThemeId, layout: layoutId });
            await uploadStrip({ sessionId: session.id, blob, layout: layoutId, themeId: baseThemeId, isPrivate: false });
            await completeSession(session.id);
            pushToast({ message: 'Saved to gallery.', type: 'success' });
            navigate('gallery');
          } else {
            downloadStrip(blob, suggestedName);
            pushToast({ message: 'Downloaded! Sign in to save to gallery.', type: 'success' });
            status.textContent = 'Ready';
            saveBtn.disabled = false;
          }
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

  // ============ Cleanup — release everything on unmount ============

  function teardown() {
    if (handleThemeChanged) window.removeEventListener('theme-changed', handleThemeChanged);
    if (handleRatioChanged) window.removeEventListener('ratio-changed', handleRatioChanged);
    if (typeof stopCanvasPreview === 'function') {
      try { stopCanvasPreview(); } catch {}
      stopCanvasPreview = null;
    }
    if (videoEl) {
      try { stopLivePreview(videoEl); } catch {}
    }
    clearThumbnailUrls();
    clearResultUrl();
    activeStream = null;
    videoEl = null;
    frameEl = null;
    previewCanvas = null;
    stage = null;
  }

  function cleanupAndExit() {
    teardown();
    navigate('home');
  }

  return teardown;
}
