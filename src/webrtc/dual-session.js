import {
  openChannel, subscribeChannel, broadcast, onMessage, generateRoomCode, findSessionByRoomCode, attachPartner,
} from './signaling.js';
import {
  createPeerConnection, attachLocalStream, onRemoteStream, onIceCandidate,
  onConnectionStateChange, onIceConnectionStateChange, createOffer, createAnswer,
  applyRemoteDescription, applyRemoteCandidate, closePeer, isWebRTCSupported,
} from './webrtc.js';
import { requireSupabase, isSupabaseConfigured } from '../db/supabase.js';
import { getState, set, pushToast } from '../state.js';
import {
  startCamera, stopCamera, attachStreamToVideo, switchCamera, describeCameraError,
} from '../camera/camera.js';
import { startCountdown } from '../ui/countdown.js';
import { createSession, completeSession } from '../db/sessions.js';
import { uploadPhoto, getPhotoSignedUrl } from '../db/photos.js';
import { uploadStrip } from '../db/strips.js';
import { loadTheme } from '../themes/theme-loader.js';
import { compositeStrip, canvasToBlob } from '../strips/compositor.js';
import { getLayout } from '../strips/layouts.js';
import { takePhoto } from '../camera/capture.js';
import { getFilterCSS } from '../camera/filters.js';

const ROLE = { HOST: 'host', GUEST: 'guest' };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let active = null;

function assertSignedIn() {
  const user = getState().user;
  if (!user?.id) throw new Error('Sign in to start a dual camera session.');
  return user;
}

function abortError() {
  return new DOMException('Operation cancelled.', 'AbortError');
}

function validatePhotoBlob(blob) {
  if (!(blob instanceof Blob)) throw new Error('Photo data is invalid.');
  if (!ALLOWED_PHOTO_TYPES.has(blob.type)) throw new Error('Photo format is not supported.');
  if (blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) throw new Error('Photo is too large to transfer.');
}

function isAllowedGuestPhotoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const url = new URL(rawUrl);
    const storageOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
    return url.protocol === 'https:'
      && url.origin === storageOrigin
      && url.pathname.startsWith('/storage/v1/object/sign/photos/');
  } catch {
    return false;
  }
}

async function responseToBlob(response, signal) {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_PHOTO_BYTES) {
    throw new Error('Guest photo exceeds the size limit.');
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_PHOTO_TYPES.has(contentType)) throw new Error('Guest photo format is not supported.');
  if (!response.body?.getReader) {
    const blob = await response.blob();
    validatePhotoBlob(blob);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw signal.reason || abortError();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PHOTO_BYTES) throw new Error('Guest photo exceeds the size limit.');
      chunks.push(value);
    }
  } finally {
    if (signal.aborted || total > MAX_PHOTO_BYTES) await reader.cancel().catch(() => {});
  }
  const blob = new Blob(chunks, { type: contentType });
  validatePhotoBlob(blob);
  return blob;
}

class DualSession {
  constructor() {
    this.role = null;
    this.sessionId = null;
    this.roomCode = null;
    this.channel = null;
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.partnerId = null;
    this.hostPhotos = [];
    this.guestPhotos = [];
    this.listeners = new Map();
    this.videoEl = null;
    this.countdownHost = null;
    this.pendingCandidates = [];
    this.peerCleanups = [];
    this.messageCleanup = null;
    this.capturePromise = null;
    this.peerStartPromise = null;
    this.finalizePromise = null;
    this.disposed = false;
    this.abortController = new AbortController();
    this.restartTimer = null;
  }

  on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) || []) {
      try { fn(data); } catch (err) { console.warn('[dual] listener error', err); }
    }
  }

  assertActive() {
    if (this.disposed || this.abortController.signal.aborted) throw abortError();
  }

  async startHost({ themeId, layout }) {
    if (!isWebRTCSupported()) throw new Error('WebRTC is not supported in this browser. Dual camera requires WebRTC.');
    if (!isSupabaseConfigured) throw new Error('Dual camera requires Supabase. Configure VITE_SUPABASE_URL.');
    const user = assertSignedIn();
    this.role = ROLE.HOST;
    const session = await createSession({ mode: 'dual', themeId, layout, roomCode: generateRoomCode() });
    this.assertActive();
    this.sessionId = session.id;
    this.roomCode = session.room_code;
    set({ capture: { ...getState().capture, mode: 'dual', roomCode: this.roomCode, sessionId: this.sessionId, status: 'waiting', themeId, layout } });
    await this.openChannelAndSubscribe({ userId: user.id });
    return { roomCode: this.roomCode, sessionId: this.sessionId };
  }

  async joinGuest({ roomCode }) {
    if (!isWebRTCSupported()) throw new Error('WebRTC is not supported in this browser. Dual camera requires WebRTC.');
    if (!isSupabaseConfigured) throw new Error('Dual camera requires Supabase. Configure VITE_SUPABASE_URL.');
    const user = assertSignedIn();
    this.role = ROLE.GUEST;
    const session = await findSessionByRoomCode(roomCode);
    if (!session) throw new Error('Room not found. Check the code with your partner.');
    this.assertActive();
    this.sessionId = session.id;
    this.roomCode = session.room_code;
    this.partnerId = session.created_by || null;
    set({ capture: { ...getState().capture, mode: 'dual', roomCode: this.roomCode, sessionId: this.sessionId, status: 'connecting', layout: session.layout } });
    await this.openChannelAndSubscribe({ userId: user.id });
    await broadcast(this.channel, 'join', { code: this.roomCode, guestId: user.id });
  }

  async openChannelAndSubscribe({ userId } = {}) {
    this.assertActive();
    const channel = openChannel(this.sessionId, { userId });
    this.channel = channel;
    this.messageCleanup = onMessage(channel, (msg) => this.handleMessage(msg));
    try {
      await subscribeChannel(channel, { signal: this.abortController.signal });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        // Surface channel-subscribe failures to the user instead of
        // silently throwing — silent failures leave the UI stuck on
        // "Connecting…" with no way to diagnose.
        const message = err?.message
          ? `Realtime connection failed: ${err.message}`
          : 'Real-time connection failed. Check your network and try again.';
        pushToast({ message, type: 'error' });
        this.emit('error', err);
      }
      this.messageCleanup?.();
      this.messageCleanup = null;
      await channel.unsubscribe().catch(() => {});
      if (this.channel === channel) this.channel = null;
      throw err;
    }
  }

  async handleMessage({ type, payload }) {
    if (this.disposed) return;
    try {
      switch (type) {
        case 'join': {
          if (this.role !== ROLE.HOST || !payload?.guestId) return;
          if (this.partnerId && this.partnerId !== payload.guestId) throw new Error('This room already has a partner.');
          if (!this.partnerId) {
            await attachPartner(this.sessionId, payload.guestId);
            this.partnerId = payload.guestId;
          }
          await this.startHostConnection();
          this.emit('peer-joined', { partnerId: this.partnerId });
          break;
        }
        case 'offer':
          if (this.role === ROLE.GUEST) await this.handleOffer(payload);
          break;
        case 'answer':
          if (this.role === ROLE.HOST && this.pc) {
            await applyRemoteDescription(this.pc, payload);
            await this.flushPendingCandidates();
          }
          break;
        case 'ice-candidate':
          if (payload) await this.acceptRemoteCandidate(payload);
          break;
        case 'countdown':
          if (this.role === ROLE.GUEST) {
            await this.startCaptureSequence({ fromBroadcast: true, videoEl: this.videoEl, countdownHost: this.countdownHost });
          }
          break;
        case 'photo-ready':
          if (this.role === ROLE.HOST) await this.handleGuestPhoto(payload);
          break;
        case 'result':
          if (this.role === ROLE.GUEST) this.emit('finished', payload);
          break;
        case 'cancel':
          this.emit('cancelled', payload);
          this.dispose();
          break;
        default:
          break;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.warn('[dual] handleMessage error', type, err);
      this.emit('error', err);
    }
  }

  async acceptRemoteCandidate(candidate) {
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await applyRemoteCandidate(this.pc, candidate);
  }

  async flushPendingCandidates() {
    if (!this.pc?.remoteDescription || !this.pendingCandidates.length) return;
    const pending = this.pendingCandidates.splice(0);
    for (const candidate of pending) await applyRemoteCandidate(this.pc, candidate);
  }

  clearPeerHandlers() {
    for (const cleanup of this.peerCleanups.splice(0)) cleanup();
  }

  async setupCommonPeerHandlers(pc) {
    await attachLocalStream(pc, this.localStream);
    this.peerCleanups.push(
      onRemoteStream(pc, (stream) => {
        if (this.disposed || pc !== this.pc) return;
        this.remoteStream = stream;
        this.emit('remote-stream', stream);
      }),
      onIceCandidate(pc, (candidate) => {
        broadcast(this.channel, 'ice-candidate', candidate).catch((err) => {
          if (!this.disposed) this.emit('error', err);
        });
      }),
      onConnectionStateChange(pc, (state) => {
        if (this.disposed || pc !== this.pc) return;
        this.emit('connection-state', state);
        if (state === 'connected') this.clearRestartTimer();
        if (state === 'failed') this.scheduleIceRestart();
        if (state === 'disconnected') {
          this.emit('disconnected', state);
          this.scheduleIceRestart(3000);
        }
      }),
      onIceConnectionStateChange(pc, (state) => {
        if (this.disposed || pc !== this.pc) return;
        this.emit('ice-connection-state', state);
        if (state === 'connected' || state === 'completed') this.clearRestartTimer();
        if (state === 'failed') this.scheduleIceRestart();
      }),
    );
  }

  clearRestartTimer() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  scheduleIceRestart(delay = 0) {
    if (this.role !== ROLE.HOST || this.disposed || this.restartTimer) return;
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      if (this.disposed || !this.pc || ['connected', 'closed'].includes(this.pc.connectionState)) return;
      try {
        this.pc.restartIce();
        const offer = await createOffer(this.pc, { iceRestart: true });
        await broadcast(this.channel, 'offer', offer);
        this.emit('reconnecting');
      } catch (err) {
        if (!this.disposed) this.emit('error', err);
      }
    }, delay);
  }

  async startLocalCamera() {
    if (this.localStream?.active) return this.localStream;
    try {
      const local = await startCamera();
      if (this.disposed) {
        for (const track of local.getTracks()) track.stop();
        throw abortError();
      }
      this.localStream = local;
      this.emit('local-stream', local);
      return local;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new Error(describeCameraError(err));
    }
  }

  startHostConnection() {
    if (this.peerStartPromise) return this.peerStartPromise;
    this.peerStartPromise = (async () => {
      await this.startLocalCamera();
      this.assertActive();
      this.replacePeer(createPeerConnection());
      await this.setupCommonPeerHandlers(this.pc);
      const offer = await createOffer(this.pc);
      await broadcast(this.channel, 'offer', offer);
    })().catch((err) => {
      this.peerStartPromise = null;
      throw err;
    });
    return this.peerStartPromise;
  }

  async handleOffer(offer) {
    await this.startLocalCamera();
    this.assertActive();
    if (!this.pc || this.pc.signalingState === 'closed') {
      this.replacePeer(createPeerConnection());
      await this.setupCommonPeerHandlers(this.pc);
    }
    await applyRemoteDescription(this.pc, offer);
    await this.flushPendingCandidates();
    const answer = await createAnswer(this.pc);
    await broadcast(this.channel, 'answer', answer);
  }

  replacePeer(pc) {
    this.clearPeerHandlers();
    closePeer(this.pc);
    this.pc = pc;
  }

  async switchLocalCamera(videoEl) {
    this.assertActive();
    const stream = await switchCamera();
    this.assertActive();
    this.localStream = stream;
    attachStreamToVideo(videoEl, stream);
    if (this.pc) await attachLocalStream(this.pc, stream);
    return stream;
  }

  attachLocalPreview(videoEl) {
    this.videoEl = videoEl || this.videoEl;
    if (this.localStream && this.videoEl) attachStreamToVideo(this.videoEl, this.localStream);
  }

  attachRemotePreview(videoEl) {
    if (this.remoteStream && videoEl) attachStreamToVideo(videoEl, this.remoteStream);
  }

  async captureLocalPhoto(videoEl, options) {
    if (!videoEl) throw new Error('Video element required.');
    this.assertActive();
    const { blob } = await takePhoto(videoEl, null, {}, options);
    validatePhotoBlob(blob);
    this.assertActive();
    return blob;
  }

  startCaptureSequence({ fromBroadcast = false, videoEl, onProgress, countdownHost = null } = {}) {
    if (this.capturePromise) return this.capturePromise;
    this.capturePromise = this.runCaptureSequence({ fromBroadcast, videoEl, onProgress, countdownHost })
      .finally(() => { this.capturePromise = null; });
    return this.capturePromise;
  }

  async runCaptureSequence({ videoEl, onProgress, countdownHost }) {
    this.assertActive();
    if (videoEl) this.videoEl = videoEl;
    if (countdownHost) this.countdownHost = countdownHost;
    if (!this.videoEl) throw new Error('Camera preview is not ready.');
    const preferences = getState().preferences || {};
    const captureOptions = {
      filter: getFilterCSS(preferences.filterId || 'original'),
      zoom: preferences.zoom || 1,
      mirror: preferences.mirror !== false,
    };
    if (this.role === ROLE.HOST) await broadcast(this.channel, 'countdown', { startedAt: Date.now() });
    const host = this.countdownHost || this.videoEl.parentElement;
    await startCountdown(host, {
      duration: preferences.countdownDuration ?? 3,
      flashEnabled: preferences.flashEnabled !== false,
      signal: this.abortController.signal,
    });
    const blob = await this.captureLocalPhoto(this.videoEl, captureOptions);
    const isHost = this.role === ROLE.HOST;
    const bucket = isHost ? this.hostPhotos : this.guestPhotos;
    const position = bucket.length + 1;
    const row = await uploadPhoto(this.sessionId, blob, position);
    this.assertActive();
    bucket.push(blob);
    onProgress?.({ role: this.role, position });

    if (!isHost) {
      const url = await getPhotoSignedUrl(row.storage_path, { expiresIn: 300 });
      if (!url) throw new Error('Could not create a secure guest photo URL.');
      await broadcast(this.channel, 'photo-ready', { position, path: row.storage_path, url });
    }

    if (isHost) await this.finalizeWhenReady();
    return blob;
  }

  async handleGuestPhoto(payload) {
    if (!payload?.url || !isAllowedGuestPhotoUrl(payload.url)) throw new Error('Guest photo came from an untrusted source.');
    const response = await fetch(payload.url, { signal: this.abortController.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`Guest photo fetch failed: ${response.status}`);
    const blob = await responseToBlob(response, this.abortController.signal);
    this.assertActive();
    this.guestPhotos.push(blob);
    this.emit('guest-photo', { position: payload.position, count: this.guestPhotos.length });
    await this.finalizeWhenReady();
  }

  finalizeWhenReady() {
    const layout = getState().capture?.layout || getState().preferences?.layout || 'strip_4';
    const required = getLayout(layout).requires;
    const hostRequired = Math.ceil(required / 2);
    const guestRequired = required - hostRequired;
    if (this.hostPhotos.length < hostRequired || this.guestPhotos.length < guestRequired) return Promise.resolve(null);
    return this.finalizeHost(layout);
  }

  finalizeHost(layout) {
    if (this.finalizePromise) return this.finalizePromise;
    this.finalizePromise = this.runFinalizeHost(layout).catch((err) => {
      this.finalizePromise = null;
      throw err;
    });
    return this.finalizePromise;
  }

  async runFinalizeHost(layout) {
    this.assertActive();
    const themeId = getState().preferences?.themeId || getState().capture?.themeId || 'minimal';
    const theme = await loadTheme(themeId);
    const required = getLayout(layout).requires;
    const photos = [];
    const max = Math.max(this.hostPhotos.length, this.guestPhotos.length);
    for (let i = 0; i < max && photos.length < required; i++) {
      if (this.hostPhotos[i]) photos.push(this.hostPhotos[i]);
      if (this.guestPhotos[i] && photos.length < required) photos.push(this.guestPhotos[i]);
    }
    if (photos.length < required) throw new Error('Not enough photos yet to compose.');
    const canvas = await compositeStrip(photos, theme, layout, { frame: true });
    const blob = await canvasToBlob(canvas, { type: 'image/png' });
    this.assertActive();
    await uploadStrip({ sessionId: this.sessionId, blob, layout, themeId, isPrivate: false });
    await completeSession(this.sessionId);
    await broadcast(this.channel, 'result', { layout, themeId });
    this.emit('finished', { blob });
    return blob;
  }

  async cancel() {
    const send = this.channel
      ? broadcast(this.channel, 'cancel', { reason: 'host-cancelled' }).catch(() => {})
      : Promise.resolve();
    this.dispose();
    await send;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort(abortError());
    this.clearRestartTimer();
    this.messageCleanup?.();
    this.messageCleanup = null;
    this.clearPeerHandlers();
    closePeer(this.pc);
    this.pc = null;
    try { stopCamera(); } catch {}
    this.localStream = null;
    this.remoteStream = null;
    this.hostPhotos = [];
    this.guestPhotos = [];
    this.pendingCandidates = [];
    this.videoEl = null;
    this.countdownHost = null;
    if (this.channel) this.channel.unsubscribe().catch(() => {});
    this.channel = null;
    this.listeners.clear();
    set({ capture: { ...getState().capture, remoteStream: null, status: 'idle' } });
    if (active === this) active = null;
  }
}

export function getDualSession() {
  return active;
}

export async function startDualSession({ themeId, layout } = {}) {
  active?.dispose();
  const session = new DualSession();
  active = session;
  try {
    const handle = await session.startHost({ themeId, layout });
    return { session, ...handle };
  } catch (err) {
    session.dispose();
    throw err;
  }
}

export async function joinDualSession({ roomCode } = {}) {
  active?.dispose();
  const session = new DualSession();
  active = session;
  try {
    await session.joinGuest({ roomCode });
    return session;
  } catch (err) {
    session.dispose();
    throw err;
  }
}
