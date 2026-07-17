const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DEFAULT_CONFIG = {
  iceServers: STUN_SERVERS,
  iceCandidatePoolSize: 4,
};

export function isWebRTCSupported() {
  return typeof RTCPeerConnection !== 'undefined';
}

export function createPeerConnection(config = DEFAULT_CONFIG) {
  if (!isWebRTCSupported()) throw new Error('WebRTC is not supported in this browser.');
  return new RTCPeerConnection(config);
}

export async function attachLocalStream(pc, stream) {
  if (!pc || !stream) return;
  const senders = pc.getSenders?.() || [];
  for (const track of stream.getTracks()) {
    const sender = senders.find((item) => item.track?.kind === track.kind);
    if (sender) await sender.replaceTrack(track);
    else pc.addTrack(track, stream);
  }
}

export function onRemoteStream(pc, callback) {
  if (!pc) return () => {};
  const handler = (event) => {
    const [stream] = event.streams || [];
    if (stream && typeof callback === 'function') callback(stream);
  };
  pc.ontrack = handler;
  return () => { if (pc.ontrack === handler) pc.ontrack = null; };
}

export function onIceCandidate(pc, callback) {
  if (!pc) return () => {};
  const handler = (event) => {
    if (event.candidate && typeof callback === 'function') callback(event.candidate);
  };
  pc.onicecandidate = handler;
  return () => { if (pc.onicecandidate === handler) pc.onicecandidate = null; };
}

export function onConnectionStateChange(pc, callback) {
  if (!pc) return () => {};
  const handler = (event) => callback?.(pc.connectionState, event);
  pc.onconnectionstatechange = handler;
  return () => { if (pc.onconnectionstatechange === handler) pc.onconnectionstatechange = null; };
}

export function onIceConnectionStateChange(pc, callback) {
  if (!pc) return () => {};
  const handler = (event) => callback?.(pc.iceConnectionState, event);
  pc.oniceconnectionstatechange = handler;
  return () => { if (pc.oniceconnectionstatechange === handler) pc.oniceconnectionstatechange = null; };
}

export async function createOffer(pc, options = {}) {
  const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true, ...options });
  await pc.setLocalDescription(offer);
  return pc.localDescription || offer;
}

export async function createAnswer(pc) {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return pc.localDescription || answer;
}

export async function applyRemoteDescription(pc, description) {
  if (!description || !pc) throw new Error('Peer connection and remote description are required.');
  if (!['offer', 'answer'].includes(description.type) || typeof description.sdp !== 'string') {
    throw new Error('Invalid remote session description.');
  }
  await pc.setRemoteDescription(new RTCSessionDescription(description));
}

export async function applyRemoteCandidate(pc, candidate) {
  if (!pc || !candidate) throw new Error('Peer connection and ICE candidate are required.');
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

export function closePeer(pc) {
  if (!pc) return;
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onconnectionstatechange = null;
  pc.oniceconnectionstatechange = null;
  pc.onnegotiationneeded = null;
  pc.ondatachannel = null;
  try { pc.close(); } catch (err) { console.warn('[webrtc] close failed', err); }
}

export { STUN_SERVERS, DEFAULT_CONFIG };
