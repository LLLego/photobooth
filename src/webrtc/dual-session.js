import { openChannel, broadcast, onMessage, generateRoomCode, findSessionByRoomCode, attachPartner } from './signaling.js';
import {
  createPeerConnection,
  attachLocalStream,
  onRemoteStream,
  onIceCandidate,
  onConnectionStateChange,
  createOffer,
  createAnswer,
  applyRemoteDescription,
  applyRemoteCandidate,
  closePeer,
} from './webrtc.js';
import { getState, set, pushToast } from '../state.js';
import { startCamera, stopCamera, attachStreamToVideo, switchCamera, describeCameraError } from '../camera/camera.js';
import { startCountdown } from '../ui/countdown.js';
import { createSession, completeSession } from '../db/sessions.js';
import { uploadPhoto } from '../db/photos.js';
import { uploadStrip } from '../db/strips.js';
import { loadTheme } from '../themes/theme-loader.js';
import { compositeStrip } from '../strips/compositor.js';
import { downloadStrip, shareStrip } from '../strips/export.js';
import { getLayout } from '../strips/layouts.js';
import { blobToObjectURL } from '../camera/capture.js';

const ROLE = { HOST: 'host', GUEST: 'guest' };
const STORAGE_BUCKET_PHOTOS = 'photos';

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
  }

  on(event, fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(event, data) { for (const fn of this.listeners) { try { fn(data); } catch (err) { console.warn(err); } } }

  async startHost({ themeId, layout }) {
    this.role = ROLE.HOST;
    const session = await createSession({ mode: 'dual', themeId, layout, roomCode: generateRoomCode() });
    this.sessionId = session.id;
    this.roomCode = session.room_code;
    set({ capture: { ...getState().capture, mode: 'dual', roomCode: this.roomCode, sessionId: this.sessionId, status: 'waiting', themeId, layout } });
    await this.openChannelAndSubscribe();
    return { roomCode: this.roomCode, sessionId: this.sessionId };
  }

  async joinGuest({ roomCode }) {
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
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') resolve();
      });
    });
  }

  async handleMessage({ type, payload }) {
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
        await this.startCaptureSequence({ fromBroadcast: true });
        break;
      }
      case 'photo-ready': {
        if (this.role !== ROLE.HOST) return;
        await this.handleGuestPhoto(payload);
        break;
      }
      case 'result': {
        this.emit('result', payload);
        break;
      }
      case 'cancel': {
        this.emit('cancelled', payload);
        break;
      }
      default:
        break;
    }
  }

  async startHostConnection() {
    const local = await startCamera().catch((err) => { throw new Error(describeCameraError(err)); });
    this.localStream = local;
    this.emit('local-stream', local);
    const pc = createPeerConnection();
    this.pc = pc;
    attachLocalStream(pc, local);
    onRemoteStream(pc, (stream) => { this.remoteStream = stream; this.emit('remote-stream', stream); });
    onIceCandidate(pc, (candidate) => broadcast(this.channel, 'ice-candidate', candidate));
    onConnectionStateChange(pc, (state) => this.emit('connection-state', state));
    const offer = await createOffer(pc);
    await broadcast(this.channel, 'offer', offer);
  }

  async handleOffer(offer) {
    const local = await startCamera().catch((err) => { throw new Error(describeCameraError(err)); });
    this.localStream = local;
    this.emit('local-stream', local);
    const pc = createPeerConnection();
    this.pc = pc;
    attachLocalStream(pc, local);
    onRemoteStream(pc, (stream) => { this.remoteStream = stream; this.emit('remote-stream', stream); });
    onIceCandidate(pc, (candidate) => broadcast(this.channel, 'ice-candidate', candidate));
    onConnectionStateChange(pc, (state) => this.emit('connection-state', state));
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

  async captureLocalPhoto(videoEl) {
    if (!videoEl) throw new Error('Video element required.');
    const themeId = getState().preferences?.themeId || getState().capture?.themeId || 'minimal';
    const theme = await loadTheme(themeId);
    const { blob } = await import('../camera/capture.js').then((m) => m.takePhoto(videoEl, theme?.frame?.url || null, { background: theme?.palette?.stripBg }));
    return blob;
  }

  async startCaptureSequence({ fromBroadcast = false, videoEl, onProgress, countdownHost = null } = {}) {
    if (this.role === ROLE.HOST) {
      await broadcast(this.channel, 'countdown', { startedAt: Date.now() });
    }
    const count = await startCountdown(countdownHost || videoEl?.parentElement, { duration: getState().preferences?.countdownDuration ?? 3 });
    if (count === undefined) { /* counted */ }
    const blob = await this.captureLocalPhoto(videoEl);
    const position = (this.role === ROLE.HOST ? this.hostPhotos : this.guestPhotos).length + 1;
    if (this.role === ROLE.HOST) this.hostPhotos.push(blob);
    else this.guestPhotos.push(blob);
    if (this.sessionId) {
      try {
        await uploadPhoto(this.sessionId, blob, position);
      } catch (err) {
        console.warn('[dual] upload local photo failed', err);
      }
    }
    onProgress?.({ role: this.role, blob, position });
    if (this.role === ROLE.GUEST) {
      const path = `${this.sessionId}/guest_${position}_${Date.now()}.webp`;
      const signed = await this.uploadForHost(blob, path);
      await broadcast(this.channel, 'photo-ready', { position, path: signed.path, url: signed.url, blob: await blobToBase64(blob) });
    }
    if (this.role === ROLE.HOST) {
      const layout = getState().capture?.layout || getState().preferences?.layout || 'strip_4';
      const required = (getLayout(layout)).requires;
      if (this.hostPhotos.length >= required) {
        await this.finalizeHost(layout);
      }
    }
  }

  async uploadForHost(blob, path) {
    const { requireSupabase } = await import('../db/supabase.js');
    const c = requireSupabase();
    const { data, error } = await c.storage.from(STORAGE_BUCKET_PHOTOS).upload(path, blob, { contentType: blob.type, upsert: true });
    if (error) throw error;
    const { data: signed } = await c.storage.from(STORAGE_BUCKET_PHOTOS).createSignedUrl(data.path, 300);
    return { path: data.path, url: signed?.signedUrl };
  }

  async handleGuestPhoto(payload) {
    if (!payload?.url) return;
    const res = await fetch(payload.url);
    const blob = await res.blob();
    this.guestPhotos.push(blob);
    const layout = getState().capture?.layout || 'strip_4';
    const required = (getLayout(layout)).requires;
    if (this.hostPhotos.length >= required && this.guestPhotos.length >= required) {
      await this.finalizeHost(layout);
    }
  }

  async finalizeHost(layout) {
    const themeId = getState().preferences?.themeId || getState().capture?.themeId || 'minimal';
    const theme = await loadTheme(themeId);
    const photos = [];
    const required = (getLayout(layout)).requires;
    const half = Math.ceil(required / 2);
    for (let i = 0; i < half; i++) photos.push(this.hostPhotos[i]);
    for (let i = 0; i < required - half; i++) photos.push(this.guestPhotos[i]);
    const canvas = await compositeStrip(photos, theme, layout, { mirror: true });
    const { canvasToBlob } = await import('../strips/compositor.js');
    const blob = await canvasToBlob(canvas, { type: 'image/webp', quality: 0.9 });
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
    this.listeners.clear();
    if (this.channel) {
      try { this.channel.unsubscribe(); } catch {}
    }
    this.channel = null;
  }
}

let active = null;
export function getDualSession() { return active; }

export async function startDualSession({ themeId, layout }) {
  if (active) active.dispose();
  active = new DualSession();
  const handle = await active.startHost({ themeId, layout });
  return { session: active, ...handle };
}

export async function joinDualSession({ roomCode }) {
  if (active) active.dispose();
  active = new DualSession();
  await active.joinGuest({ roomCode });
  return active;
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('blob read failed'));
    reader.readAsDataURL(blob);
  });
}
