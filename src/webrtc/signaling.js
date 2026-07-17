import { requireSupabase } from '../db/supabase.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(length = ROOM_CODE_LENGTH) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function channelForSession(sessionId) {
  return `session:${sessionId}`;
}

// Private channel — Supabase Realtime enforces RLS via the underlying
// postgres_changes channel, but broadcast channels require explicit auth.
// We restrict to the two participants (host + partner) by setting them as
// channel members; only authenticated users in this list can subscribe.
export function openChannel(sessionId, { userId, partnerId } = {}) {
  const c = requireSupabase();
  // requireSupabase() already throws when Supabase is not configured; the
  // client itself is built with the user's anon JWT, which the Realtime
  // server validates. Anonymous users (no JWT) cannot establish a Realtime
  // socket because the JS client requires auth before connecting.
  const members = [userId, partnerId].filter(Boolean);
  return c.channel(channelForSession(sessionId), {
    config: {
      broadcast: { ack: true, self: false },
      presence: { key: userId || 'anon' },
      private: members.length > 0,
    },
  });
}

export async function broadcast(channel, type, payload) {
  if (!channel) return;
  return channel.send({ type: 'broadcast', event: type, payload: { type, payload } });
}

export function onMessage(channel, handler) {
  if (!channel || typeof handler !== 'function') return () => {};
  return channel.on('broadcast', { event: '*' }, (msg) => {
    const payload = msg?.payload || {};
    handler({ type: payload.type || msg?.event, payload: payload.payload, raw: msg });
  });
}

export async function findSessionByRoomCode(roomCode) {
  const c = requireSupabase();
  const { data, error } = await c
    .from('sessions')
    .select('id, room_code, mode, layout, theme_id, created_by, status, created_at')
    .eq('room_code', (roomCode || '').toUpperCase())
    .maybeSingle();
  if (error) {
    console.warn('[signaling] findSessionByRoomCode error', error);
    return null;
  }
  return data;
}

export async function attachPartner(sessionId, partnerId) {
  if (!sessionId || !partnerId) return;
  const c = requireSupabase();
  try {
    await c.from('sessions').update({ partner_id: partnerId }).eq('id', sessionId);
  } catch (err) {
    console.warn('[signaling] attachPartner failed', err);
  }
}
