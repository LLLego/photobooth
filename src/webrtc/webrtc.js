const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DEFAULT_CONFIG = {
  iceServers: STUN_SERVERS,
  iceCandidatePoolSize: 4,
};

export function createPeerConnection(config = DEFAULT_CONFIG) {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not supported in this browser.');
  }
  return new RTCPeerConnection(config);
}

export function attachLocalStream(pc, stream) {
  if (!pc || !stream) return;
  for (const track of stream.getTracks()) {
    try { pc.addTrack(track, stream); } catch (err) { console.warn('[webrtc] addTrack failed', err); }
  }
}

export function onRemoteStream(pc, callback) {
  if (!pc) return;
  pc.ontrack = (event) => {
    const [stream] = event.streams || [];
    if (stream && typeof callback === 'function') callback(stream);
  };
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
  const handler = (event) => {
    if (typeof callback === 'function') callback(pc.connectionState, event);
  };
  pc.onconnectionstatechange = handler;
  return () => { if (pc.onconnectionstatechange === handler) pc.onconnectionstatechange = null; };
}

export async function createOffer(pc) {
  const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(pc) {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function applyRemoteDescription(pc, description) {
  if (!description) return;
  if (description.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(description));
  } else if (description.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(description));
  } else {
    throw new Error('Unsupported description type: ' + description.type);
  }
}

export async function applyRemoteCandidate(pc, candidate) {
  if (!candidate) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn('[webrtc] addIceCandidate failed', err);
  }
}

export function closePeer(pc) {
  if (!pc) return;
  try { pc.getSenders?.().forEach((s) => s.track && s.track.stop && s.track.stop()); } catch {}
  try { pc.close(); } catch (err) { console.warn('[webrtc] close failed', err); }
}

export { STUN_SERVERS, DEFAULT_CONFIG };
