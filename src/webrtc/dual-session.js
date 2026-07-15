import {
  openChannel, broadcast, onMessage, generateRoomCode, findSessionByRoomCode, attachPartner,
} from './signaling.js';
import {
  createPeerConnection, attachLocalStream, onRemoteStream, onIceCandidate,
  onConnectionStateChange, createOffer, createAnswer,
  applyRemoteDescription, applyRemoteCandidate, closePeer, isWebRTCSupported,
} from './webrtc.js';
import { requireSupabase } from '../db/supabase.js';
import { getState, set, pushToast } from '../state.js';
import {
  startCamera, stopCamera, attachStreamToVideo, switchCamera, describeCameraError,
} from '../camera/camera.js';
import { startCountdown } from '../ui/countdown.js';
import { createSession, completeSession } from '../db/sessions.js';
import { uploadPhoto } from '../db/photos.js';
import { uploadStrip } from '../db/strips.js';
import { loadTheme } from '../themes/theme-loader.js';
import { compositeStrip, canvasToBlob } from '../strips/compositor.js';
import { downloadStrip, shareStrip } from '../strips/export.js';
import { getLayout } from '../strips/layouts.js';
import { takePhoto } from '../camera/capture.js';

const ROLE = { HOST: 'host', GUEST: 'guest' };
const STORAGE_BUCKET_PHOTOS = 'photos';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read blob.'));
    reader.readAsDataURL(blob);
  });
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
    this.listeners = new Set();
    this.videoEl = null;
    this.countdownHost = null;
    this.capturing = false;
  }

  on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(event, data) {
    for (const fn of this.listeners) {
      try { fn(data); } catch (err) { console.warn('[dual] listener error', err); }
    }
  }

  async startHost({ themeId, layout }) {
    if (!isWebRTCSupported()) {
      throw new Error('WebRTC is not supported in this browser. Dual camera requires WebRTC.');
    }
    this.role = ROLE.HOST;
    const session = await createSession({ mode: 'dual', themeId, layout, roomCode: generateRoomCode() });
    this.sessionId = session.id;
    this.roomCode = session.room_code;
    set({ capture: { ...getState().capture, mode: 'dual', roomCode: this.roomCode, sessionId: this.sessionId, status: 'waiting', themeId, layout } });
    await this.openChannelAndSubscribe();
    return { roomCode: this.roomCode, sessionId: this.sessionId };
  }

  async joinGuest({ roomCode }) {
    if (!isWebRTCSupported()) {
      throw new Error('WebRTC is not supported in this browser. Dual camera requires WebRTC.');
    }
    this.role = ROLE.GUEST;
    const session = await findSessionByRoomCode((roomCode || '').toUpperCase());
    if (!session) throw new Error('Room not found. Check the code with your partner.');
    this.sessionId = session.id;
    this.roomCode = session.room_code;
    set({ capture: { ...getState().capture, mode: 'dual', roomCode: this.roomCode, sessionId: this.sessionId, status: 'connecting' } });
    await this.openChannelAndSubscribe();
    await broadcast(this.channel, 'join', { code: this.roomCode, guestId: getState().user?.id });
  }

  async openChannelAndSubscribe() {
    const channel = openChannel(this.sessionId);
    this.channel = channel;
    onMessage(channel, async (msg) => this.handleMessage(msg));
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          finish();
        }
      });
      setTimeout(finish, 5000);
    });
  }

  async handleMessage({ type, payload }) {
    try {
      switch (type) {
        case 'join': {
          if (this.role !== ROLE.HOST) return;
          this.partnerId = payload?.guestId || null;
          await attachPartner(this.sessionId, this.partnerId);
          await this.startHostConnection();
          this.emit('peer-joined', { partnerId: this.partnerId });
          break;
        }
        case 'offer': {
          if (this.role !== ROLE.GUEST) return;
          await this.handleOffer(payload);
          break;
        }
        case 'answer': {
          if (this.role !== ROLE.HOST) return;
          await applyRemoteDescription(this.pc, payload);
          break;
        }
        case 'ice-candidate': {
          if (this.pc && payload) await applyRemoteCandidate(this.pc, payload);
          break;
        }
        case 'countdown': {
          if (this.role !== ROLE.GUEST) return;
          await this.startCaptureSequence({
            fromBroadcast: true,
            videoEl: this.videoEl,
            countdownHost: this.countdownHost,
          });
          break;
        }
        case 'photo-ready': {
          if (this.role !== ROLE.HOST) return;
          await this.handleGuestPhoto(payload);
          break;
        }
        case 'cancel': {
          this.emit('cancelled', payload);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.warn('[dual] handleMessage error', type, err);
    }
  }

  _setupCommonPeerHandlers(pc) {
    attachLocalStream(pc, this.localStream);
    onRemoteStream(pc, (stream) => { this.remoteStream = stream; this.emit('remote-stream', stream); });
    onIceCandidate(pc, (candidate) => broadcast(this.channel, 'ice-candidate', candidate));
    onConnectionStateChange(pc, (state) => {
      this.emit('connection-state', state);
      if (state === 'failed' || state === 'disconnected') {
        this.emit('disconnected', state);
      }
    });
  }

  async _startLocalCamera() {
    try {
      const local = await startCamera();
      this.localStream = local;
      this.emit('local-stream', local);
      return local;
    } catch (err) {
      throw new Error(describeCameraError(err));
    }
  }

  async startHostConnection() {
    await this._startLocalCamera();
    const pc = createPeerConnection();
    this.pc = pc;
    this._setupCommonPeerHandlers(pc);
    const offer = await createOffer(pc);
    await broadcast(this.channel, 'offer', offer);
  }

  async handleOffer(offer) {
    await this._startLocalCamera();
    const pc = createPeerConnection();
    this.pc = pc;
    this._setupCommonPeerHandlers(pc);
    await applyRemoteDescription(pc, offer);
    const answer = await createAnswer(pc);
    await broadcast(this.channel, 'answer', answer);
  }

  async switchLocalCamera(videoEl) {
    const stream = await switchCamera();
    this.localStream = stream;
    attachStreamToVideo(videoEl, stream);
    return stream;
  }

  attachLocalPreview(videoEl) {
    if (this.localStream) attachStreamToVideo(videoEl, this.localStream);
  }

  attachRemotePreview(videoEl) {
    if (this.remoteStream) attachStreamToVideo(videoEl, this.remoteStream);
  }

  async captureLocalPhoto(videoEl, filter) {
    if (!videoEl) throw new Error('Video element required.');
    const themeId = getState().preferences?.themeId || getState().capture?.themeId || 'minimal';
    const theme = await loadTheme(themeId);
    const layoutId = getState().capture?.layout || getState().preferences?.layout || 'strip_4';
    const filterId = getState().preferences?.filterId || 'original';
    const { blob } = await takePhoto(videoEl, null, theme, { filter: filterId });
    return blob;
  }

  async startCaptureSequence({ fromBroadcast = false, videoEl, onProgress, countdownHost = null } = {}) {
    if (this.capturing) return;
    if (videoEl) this.videoEl = videoEl;
    if (countdownHost) this.countdownHost = countdownHost;
    this.capturing = true;
    try {
      if (this.role === ROLE.HOST) {
        await broadcast(this.channel, 'countdown', { startedAt: Date.now() });
      }
      const duration = getState().preferences?.countdownDuration ?? 3;
      const host = countdownHost || videoEl?.parentElement;
      await startCountdown(host, { duration });

      const filterId = getState().preferences?.filterId || 'original';
      const blob = await this.captureLocalPhoto(videoEl, filterId);
      if (!blob) throw new Error('Capture returned no image.');

      const isHost = this.role === ROLE.HOST;
      const bucket = isHost ? this.hostPhotos : this.guestPhotos;
      const position = bucket.length + 1;
      bucket.push(blob);

      if (this.sessionId) {
        try {
          await uploadPhoto(this.sessionId, blob, position);
        } catch (err) {
          console.warn('[dual] upload local photo failed', err);
        }
      }
      onProgress?.({ role: this.role, position });

      if (!isHost) {
        const path = `${this.sessionId}/guest_${position}_${Date.now()}.webp`;
        try {
          const signed = await this.uploadForHost(blob, path);
          const b64 = await blobToBase64(blob);
          await broadcast(this.channel, 'photo-ready', { position, path: signed.path, url: signed.url, blob: b64 });
        } catch (err) {
          console.warn('[dual] uploadForHost failed', err);
          pushToast({ message: 'Could not transfer photo to host.', type: 'error' });
        }
      }

      if (isHost) {
        const layout = getState().capture?.layout || getState().preferences?.layout || 'strip_4';
        const required = getLayout(layout).requires;
        if (this.hostPhotos.length >= required && this.guestPhotos.length >= required) {
          await this.finalizeHost(layout);
        }
      }
    } finally {
      this.capturing = false;
    }
  }

  async uploadForHost(blob, path) {
    const c = requireSupabase();
    const { data, error } = await c.storage.from(STORAGE_BUCKET_PHOTOS).upload(path, blob, {
      contentType: blob.type || 'image/webp',
      upsert: true,
      cacheControl: '300',
    });
    if (error) throw error;
    const { data: signed } = await c.storage.from(STORAGE_BUCKET_PHOTOS).createSignedUrl(data.path, 300);
    return { path: data.path, url: signed?.signedUrl };
  }

  async handleGuestPhoto(payload) {
    if (!payload?.url) return;
    let blob;
    try {
      const res = await fetch(payload.url);
      if (!res.ok) throw new Error(`Guest photo fetch failed: ${res.status}`);
      blob = await res.blob();
    } catch (err) {
      console.warn('[dual] handleGuestPhoto fetch failed', err);
      return;
    }
    this.guestPhotos.push(blob);
    const layout = getState().capture?.layout || 'strip_4';
    const required = getLayout(layout).requires;
    if (this.hostPhotos.length >= required && this.guestPhotos.length >= required) {
      try { await this.finalizeHost(layout); }
      catch (err) { console.warn('[dual] finalize after guest photo failed', err); }
    }
  }

  async finalizeHost(layout) {
    const themeId = getState().preferences?.themeId || getState().capture?.themeId || 'minimal';
    const theme = await loadTheme(themeId);
    const required = getLayout(layout).requires;
    const half = Math.ceil(required / 2);
    const photos = [];
    for (let i = 0; i < half && i < this.hostPhotos.length; i++) photos.push(this.hostPhotos[i]);
    for (let i = 0; i < required - half && i < this.guestPhotos.length; i++) photos.push(this.guestPhotos[i]);
    if (photos.length < required) {
      throw new Error('Not enough photos yet to compose.');
    }
    const canvas = await compositeStrip(photos, theme, layout, { mirror: true });
    const blob = await canvasToBlob(canvas, { type: 'image/png' });
    if (this.sessionId) {
      try {
        await uploadStrip({ sessionId: this.sessionId, blob, layout, themeId, isPrivate: false });
        await completeSession(this.sessionId);
      } catch (err) {
        console.warn('[dual] upload strip failed', err);
      }
    }
    await broadcast(this.channel, 'result', { layout, themeId, filename: `${this.sessionId}.webp` });
    this.emit('finished', { blob });
    return blob;
  }

  async cancel() {
    try { if (this.channel) await broadcast(this.channel, 'cancel', { reason: 'host-cancelled' }); } catch {}
    this.dispose();
  }

  dispose() {
    try { closePeer(this.pc); } catch {}
    this.pc = null;
    try { stopCamera(); } catch {}
    this.localStream = null;
    this.remoteStream = null;
    this.hostPhotos = [];
    this.guestPhotos = [];
    this.videoEl = null;
    this.countdownHost = null;
    this.listeners.clear();
    if (this.channel) {
      try { this.channel.unsubscribe(); } catch {}
      try { this.channel = null; } catch {}
    }
    this.channel = null;
  }
}

let active = null;

export function getDualSession() {
  return active;
}

export async function startDualSession({ themeId, layout } = {}) {
  if (active) active.dispose();
  active = new DualSession();
  const handle = await active.startHost({ themeId, layout });
  return { session: active, ...handle };
}

export async function joinDualSession({ roomCode } = {}) {
  if (active) active.dispose();
  active = new DualSession();
  await active.joinGuest({ roomCode });
  return active;
}

export async function downloadFinalStrip(blob, filename) {
  downloadStrip(blob, filename);
}

export async function shareFinalStrip(blob, filename) {
  return shareStrip(blob, { filename });
}
