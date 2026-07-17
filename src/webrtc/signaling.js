import { requireSupabase } from '../db/supabase.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const TERMINAL_CHANNEL_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function generateRoomCode(length = ROOM_CODE_LENGTH) {
  let out = '';
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  for (let i = 0; i < length; i++) out += ALPHABET[random[i] % ALPHABET.length];
  return out;
}

function channelForSession(sessionId) {
  return `session:${sessionId}`;
}

export function openChannel(sessionId, { userId } = {}) {
  const c = requireSupabase();
  return c.channel(channelForSession(sessionId), {
    config: {
      broadcast: { ack: true, self: false },
      presence: { key: userId },
      private: true,
    },
  });
}

export async function subscribeChannel(channel, { timeoutMs = 10000, signal } = {}) {
  if (!channel) throw new Error('Realtime channel is required.');
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Realtime channel subscription timed out.')), timeoutMs);
    signal?.addEventListener('abort', aborted, { once: true });
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
    }
    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(channel);
    }
    function aborted() {
      finish(signal.reason || new DOMException('Operation cancelled.', 'AbortError'));
    }
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') finish();
      else if (TERMINAL_CHANNEL_STATUSES.has(status)) {
        finish(error || new Error(`Realtime channel failed: ${status.toLowerCase().replaceAll('_', ' ')}`));
      }
    });
  });
}

export async function broadcast(channel, type, payload) {
  if (!channel) throw new Error('Realtime channel is not available.');
  const status = await channel.send({ type: 'broadcast', event: type, payload: { type, payload } });
  if (status !== 'ok') throw new Error(`Realtime broadcast failed: ${status || 'unknown status'}`);
  return status;
}

export function onMessage(channel, handler) {
  if (!channel || typeof handler !== 'function') return () => {};
  let active = true;
  channel.on('broadcast', { event: '*' }, (msg) => {
    if (!active) return;
    const payload = msg?.payload || {};
    Promise.resolve(handler({ type: payload.type || msg?.event, payload: payload.payload, raw: msg }))
      .catch((err) => console.warn('[signaling] message handler failed', err));
  });
  return () => { active = false; };
}

export async function findSessionByRoomCode(roomCode) {
  const code = (roomCode || '').toUpperCase().trim();
  if (!new RegExp(`^[${ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code)) return null;
  const c = requireSupabase();
  const { data, error } = await c
    .from('sessions')
    .select('id, room_code, mode, layout, theme_id, created_by, status, created_at')
    .eq('room_code', code)
    .eq('mode', 'dual')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function attachPartner(sessionId, partnerId) {
  if (!sessionId || !partnerId) throw new Error('Session and partner are required.');
  const c = requireSupabase();
  const { data: userData, error: userError } = await c.auth.getUser();
  if (userError) throw userError;
  const hostId = userData?.user?.id;
  if (!hostId) throw new Error('Sign in to attach a partner.');
  const { data, error } = await c
    .from('sessions')
    .update({ partner_id: partnerId })
    .eq('id', sessionId)
    .eq('created_by', hostId)
    .eq('status', 'active')
    .is('partner_id', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This room already has a partner or is no longer active.');
  return data;
}
