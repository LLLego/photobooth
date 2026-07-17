import { getState, set, pushToast } from '../state.js';
import { Button, Icon, Modal } from './components.js';
import { renderThemePicker } from '../themes/theme-picker.js';
import { startDualSession, joinDualSession } from '../webrtc/dual-session.js';
import { setPreviewFrame } from '../camera/preview.js';
import { navigate } from '../router.js';
import { downloadStrip, shareStrip } from '../strips/export.js';

export async function renderDualCamera(mount) {
  mount.innerHTML = '';

  // Local state — released by the returned teardown.
  let activeSession = null;
  let frameEl = null;
  let hostStage = null;
  let localVideo = null;
  let remoteVideo = null;
  let handleThemeChanged = null;
  let resultUrlRefs = [];

  const wrap = document.createElement('div');
  wrap.className = 'max-w-md mx-auto px-4 pt-6 pb-40 fade-in';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => cleanupAndExit() });
  header.append(back, document.createElement('span'));
  wrap.append(header);

  const intro = document.createElement('div');
  intro.className = 'card p-5 mb-4';
  const title = document.createElement('h1');
  title.className = 'heading-display text-2xl mb-1';
  title.textContent = 'Dual camera';
  const desc = document.createElement('p');
  desc.className = 'text-warmth-600 text-sm';
  desc.textContent = 'Take photos together. One of you hosts a room, the other joins with a 6-character code.';
  intro.append(title, desc);
  const actions = document.createElement('div');
  actions.className = 'grid gap-2 mt-4';
  actions.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  const startBtn = Button({ label: 'Start a room', variant: 'primary' });
  const joinBtn = Button({ label: 'Join a room', variant: 'accent' });
  actions.append(startBtn, joinBtn);
  intro.append(actions);
  wrap.append(intro);

  const themeCard = document.createElement('div');
  themeCard.className = 'mb-4';
  wrap.append(themeCard);
  await renderThemePicker(themeCard);

  hostStage = document.createElement('div');
  hostStage.className = 'dual-stage camera-stage w-full mx-auto hidden';
  hostStage.style.aspectRatio = '3/2';
  const localWrap = document.createElement('div');
  localWrap.className = 'dual-pane';
  const remoteWrap = document.createElement('div');
  remoteWrap.className = 'dual-pane';
  localVideo = document.createElement('video');
  localVideo.className = 'dual-video';
  localVideo.muted = true;
  localVideo.playsInline = true;
  localVideo.autoplay = true;
  remoteVideo = document.createElement('video');
  remoteVideo.className = 'dual-video';
  remoteVideo.muted = true;
  remoteVideo.playsInline = true;
  remoteVideo.autoplay = true;

  const localLabel = document.createElement('span');
  localLabel.className = 'dual-pane-label';
  localLabel.textContent = 'You';
  const remoteLabel = document.createElement('span');
  remoteLabel.className = 'dual-pane-label';
  remoteLabel.textContent = 'Partner';

  localWrap.append(localVideo, localLabel);
  remoteWrap.append(remoteVideo, remoteLabel);

  const dualOverlay = document.createElement('div');
  dualOverlay.className = 'camera-overlay-grid';
  dualOverlay.style.position = 'absolute';
  dualOverlay.style.inset = '0';
  dualOverlay.style.zIndex = '2';
  frameEl = document.createElement('img');
  frameEl.className = 'camera-frame';
  frameEl.alt = '';
  frameEl.style.display = 'none';
  const controls = document.createElement('div');
  controls.className = 'camera-controls dual-controls';
  const captureBtn = document.createElement('button');
  captureBtn.className = 'capture-button';
  captureBtn.disabled = true;
  captureBtn.append(Icon({ name: 'camera', size: 28 }));
  captureBtn.addEventListener('click', () => triggerCapture());
  controls.append(document.createElement('span'), captureBtn, document.createElement('span'));
  hostStage.append(localWrap, remoteWrap, dualOverlay, frameEl, controls);
  wrap.append(hostStage);

  const status = document.createElement('p');
  status.className = 'text-center text-sm text-warmth-500 mt-3';
  status.textContent = 'Ready when you are.';
  wrap.append(status);

  const progress = document.createElement('p');
  progress.className = 'text-center text-xs text-warmth-500 mt-1';
  progress.textContent = '';
  wrap.append(progress);

  const resultWrap = document.createElement('div');
  resultWrap.className = 'mt-6 space-y-3 hidden';
  resultWrap.setAttribute('data-result', 'true');
  wrap.append(resultWrap);

  const codeCard = document.createElement('div');
  codeCard.className = 'card p-5 mt-4 hidden text-center';
  const codeLabel = document.createElement('p');
  codeLabel.className = 'text-xs uppercase tracking-widest text-warmth-500 mb-1';
  codeLabel.textContent = 'Room code';
  const codeValue = document.createElement('p');
  codeValue.className = 'heading-display text-4xl tracking-widest font-mono text-warmth-900';
  codeCard.append(codeLabel, codeValue);
  const copyBtn = Button({ label: 'Copy code', variant: 'primary' });
  copyBtn.classList.add('mt-4', 'w-full');
  copyBtn.addEventListener('click', () => {
    if (!codeValue.textContent) return;
    navigator.clipboard?.writeText(codeValue.textContent);
    pushToast({ message: 'Code copied.', type: 'success' });
  });
  codeCard.append(copyBtn);
  wrap.append(codeCard);

  mount.append(wrap);

  handleThemeChanged = async (ev) => {
    const newThemeId = ev.detail?.themeId;
    if (newThemeId && frameEl) {
      try {
        await setPreviewFrame(frameEl, newThemeId);
      } catch (err) {
        console.warn('[dual] frame swap failed', err);
      }
    }
  };
  window.addEventListener('theme-changed', handleThemeChanged);

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    status.textContent = 'Creating room…';
    try {
      // If a previous session is still alive (rapid double-click, or a
      // failed teardown), dispose it before starting a new one — otherwise
      // startDualSession leaves the old peer/channel live and the user
      // sees stale state.
      if (activeSession) {
        try { activeSession.dispose(); } catch {}
        activeSession = null;
      }
      const prefs = getState().preferences;
      const { roomCode, session } = await startDualSession({ themeId: prefs.themeId, layout: prefs.layout });
      activeSession = session;
      codeValue.textContent = roomCode;
      codeCard.classList.remove('hidden');
      status.textContent = 'Waiting for your partner…';
      session.on('peer-joined', () => {
        hostStage.classList.remove('hidden');
        status.textContent = 'Connected! Tap to capture.';
        if (localVideo) session.attachLocalPreview(localVideo);
        if (remoteVideo) session.attachRemotePreview(remoteVideo);
        captureBtn.disabled = false;
      });
      session.on('connection-state', (state) => {
        status.textContent = `Connection: ${state}`;
      });
      session.on('finished', ({ blob }) => {
        if (blob) {
          renderResult(blob);
          pushToast({ message: 'Strip saved to gallery.', type: 'success' });
        }
      });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
      status.textContent = 'Could not start a room.';
      startBtn.disabled = false;
    }
  });

  joinBtn.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 6;
    input.className = 'input uppercase tracking-widest text-center font-mono text-xl';
    input.placeholder = 'ABC123';
    const label = document.createElement('p');
    label.className = 'text-sm text-warmth-600 mb-2';
    label.textContent = 'Enter the 6-character code shared by your partner.';
    const content = document.createElement('div');
    content.append(label, input);
    const submit = Button({ label: 'Join', variant: 'primary' });
    submit.addEventListener('click', async () => {
      const code = (input.value || '').toUpperCase().trim();
      if (code.length !== 6) {
        pushToast({ message: 'Codes are 6 characters.', type: 'warn' });
        return;
      }
      modal.close();
      try {
        const session = await joinDualSession({ roomCode: code });
        activeSession = session;
        hostStage.classList.remove('hidden');
        status.textContent = 'Connecting…';
        session.on('local-stream', () => session.attachLocalPreview(localVideo));
        session.on('remote-stream', () => session.attachRemotePreview(remoteVideo));
        session.on('connection-state', (state) => { status.textContent = `Connection: ${state}`; });
        session.on('finished', () => navigate('gallery'));
      } catch (err) {
        pushToast({ message: err.message || 'Could not join room.', type: 'error' });
        status.textContent = 'Could not join.';
      }
    });
    const cancel = Button({ label: 'Cancel', variant: 'ghost' });
    const modal = Modal({ title: 'Join a room', content, actions: [cancel, submit] });
    cancel.addEventListener('click', () => modal.close());
    document.body.append(modal.element);
  });

  async function triggerCapture() {
    if (!activeSession) return;
    try {
      captureBtn.disabled = true;
      await activeSession.startCaptureSequence({
        videoEl: localVideo,
        countdownHost: hostStage,
        onProgress: updateProgress,
      });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
      status.textContent = 'Capture failed. Try again.';
    } finally {
      captureBtn.disabled = false;
    }
  }

  function updateProgress({ role, position }) {
    progress.textContent = `You: ${position} photo${position === 1 ? '' : 's'}`;
  }

  function renderResult(blob) {
    resultWrap.innerHTML = '';
    const suggestedName = `photobooth-${Date.now()}.webp`;
    const preview = document.createElement('div');
    preview.className = 'strip-preview';
    const img = document.createElement('img');
    const resultUrl = URL.createObjectURL(blob);
    img.src = resultUrl;
    img.alt = 'Composed strip';
    preview.append(img);
    resultWrap.append(preview);
    resultUrlRefs.push(resultUrl);

    const bar = document.createElement('div');
    bar.className = 'flex flex-wrap gap-2';
    const dl = Button({ label: 'Download', variant: 'primary', icon: Icon({ name: 'download' }) });
    const share = Button({ label: 'Share', variant: 'ghost', icon: Icon({ name: 'share' }) });
    const again = Button({ label: 'New strip', variant: 'honey', icon: Icon({ name: 'camera' }) });
    const gallery = Button({ label: 'View gallery', variant: 'ghost', icon: Icon({ name: 'gallery' }) });
    bar.append(dl, share, again, gallery);
    resultWrap.append(bar);

    resultWrap.classList.remove('hidden');
    resultWrap.classList.add('block');
    captureBtn.disabled = true;
    status.textContent = 'Strip ready!';

    dl.onclick = () => downloadStrip(blob, suggestedName);
    share.onclick = async () => {
      try {
        const r = await shareStrip(blob, { filename: suggestedName });
        if (!r.shared && !r.cancelled) pushToast({ message: 'Saved a copy locally.', type: 'info' });
      } catch (err) {
        pushToast({ message: err.message, type: 'error' });
      }
    };
    again.onclick = () => {
      resultWrap.innerHTML = '';
      resultWrap.classList.add('hidden');
      resultWrap.classList.remove('block');
      captureBtn.disabled = false;
      status.textContent = 'Ready when you are.';
      try { activeSession?.dispose(); } catch {}
      activeSession = null;
    };
    gallery.onclick = () => navigate('gallery', {}, { replace: true, force: true });
  }

  function cleanupAndExit() {
    try { activeSession?.dispose(); } catch {}
    activeSession = null;
    navigate('home');
  }

  function teardown() {
    if (handleThemeChanged) window.removeEventListener('theme-changed', handleThemeChanged);
    try { activeSession?.dispose(); } catch {}
    activeSession = null;
    for (const url of resultUrlRefs.splice(0)) {
      try { URL.revokeObjectURL(url); } catch {}
    }
  }

  return teardown;
}
