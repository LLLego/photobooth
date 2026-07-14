import { getState, set, pushToast } from '../state.js';
import { Button, Icon, Spinner, Modal } from './components.js';
import { renderThemePicker } from '../themes/theme-picker.js';
import { startDualSession, joinDualSession, getDualSession } from '../webrtc/dual-session.js';
import { attachStreamToVideo, describeCameraError } from '../camera/camera.js';
import { navigate } from '../router.js';

let hostStage = null;
let remoteVideo = null;
let localVideo = null;
let activeSession = null;

export async function renderDualCamera(mount) {
  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-md mx-auto px-4 pt-6 pb-32 fade-in';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => cleanupAndExit(mount) });
  header.append(back, document.createElement('span'));
  wrap.append(header);

  const intro = document.createElement('div');
  intro.className = 'card p-5 mb-4';
  intro.innerHTML = `
    <h1 class="heading-display text-2xl mb-1">Dual camera</h1>
    <p class="text-warmth-600 text-sm">Take photos together. One of you hosts a room, the other joins with a 6-character code.</p>
  `;
  const actions = document.createElement('div');
  actions.className = 'grid grid-cols-2 gap-2 mt-4';
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
  hostStage.className = 'camera-stage w-full mx-auto hidden flex';
  hostStage.style.aspectRatio = '3/2';
  hostStage.style.display = 'none';
  const localWrap = document.createElement('div');
  localWrap.className = 'flex-1 relative';
  const remoteWrap = document.createElement('div');
  remoteWrap.className = 'flex-1 relative';
  localVideo = document.createElement('video');
  localVideo.className = 'camera-video';
  localVideo.style.position = 'relative';
  localVideo.style.width = '100%';
  localVideo.style.height = '100%';
  localVideo.style.objectFit = 'cover';
  localVideo.muted = true;
  localVideo.playsInline = true;
  remoteVideo = document.createElement('video');
  remoteVideo.className = 'camera-video';
  remoteVideo.style.position = 'relative';
  remoteVideo.style.width = '100%';
  remoteVideo.style.height = '100%';
  remoteVideo.style.objectFit = 'cover';
  remoteVideo.muted = true;
  remoteVideo.playsInline = true;
  localWrap.append(localVideo);
  remoteWrap.append(remoteVideo);
  const dualOverlay = document.createElement('div');
  dualOverlay.className = 'camera-overlay-grid';
  dualOverlay.style.position = 'absolute';
  dualOverlay.style.inset = '0';
  dualOverlay.style.zIndex = '3';
  const controls = document.createElement('div');
  controls.className = 'camera-controls';
  const captureBtn = document.createElement('button');
  captureBtn.className = 'capture-button';
  captureBtn.append(Icon({ name: 'camera', size: 28 }));
  captureBtn.addEventListener('click', () => triggerCapture());
  controls.append(captureBtn, document.createElement('span'));
  hostStage.append(localWrap, remoteWrap, dualOverlay, controls);
  wrap.append(hostStage);

  const status = document.createElement('p');
  status.className = 'text-center text-sm text-warmth-500 mt-3';
  status.textContent = 'Ready when you are.';
  wrap.append(status);

  const codeCard = document.createElement('div');
  codeCard.className = 'card p-5 mt-4 hidden text-center';
  const codeLabel = document.createElement('p');
  codeLabel.className = 'text-xs uppercase tracking-widest text-warmth-500 mb-1';
  codeLabel.textContent = 'Room code';
  const codeValue = document.createElement('p');
  codeValue.className = 'heading-display text-4xl tracking-widest font-mono';
  codeCard.append(codeLabel, codeValue);
  const shareBtn = Button({ label: 'Copy code', variant: 'primary' });
  shareBtn.classList.add('mt-4', 'w-full');
  shareBtn.addEventListener('click', () => {
    if (!codeValue.textContent) return;
    navigator.clipboard?.writeText(codeValue.textContent);
    pushToast({ message: 'Code copied.', type: 'success' });
  });
  codeCard.append(shareBtn);
  wrap.append(codeCard);

  mount.append(wrap);

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    status.textContent = 'Creating room…';
    try {
      const prefs = getState().preferences;
      const { roomCode, session } = await startDualSession({ themeId: prefs.themeId, layout: prefs.layout });
      activeSession = session;
      codeValue.textContent = roomCode;
      codeCard.classList.remove('hidden');
      status.textContent = 'Waiting for your partner…';
      session.on('peer-joined', () => {
        hostStage.classList.remove('hidden');
        status.textContent = 'Connected! Tap to capture.';
        session.attachLocalPreview(localVideo);
        session.attachRemotePreview(remoteVideo);
      });
      session.on('connection-state', (state) => {
        status.textContent = `Connection: ${state}`;
      });
      session.on('finished', ({ blob }) => {
        if (blob) {
          pushToast({ message: 'Strip saved to gallery.', type: 'success' });
          navigate('gallery');
        }
      });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
      status.textContent = 'Could not start a room.';
      startBtn.disabled = false;
    }
  });

  joinBtn.addEventListener('click', () => {
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
      await activeSession.startCaptureSequence({ videoEl: localVideo, countdownHost: hostStage });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    } finally {
      captureBtn.disabled = false;
    }
  }
}

function cleanupAndExit(mount) {
  try { activeSession?.dispose(); } catch {}
  activeSession = null;
  navigate('home');
}

export function disposeDualCamera() {
  try { activeSession?.dispose(); } catch {}
  activeSession = null;
}
