let activeStream = null;
let facingMode = 'user';

export function isCameraSupported() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

export async function getAvailableCameras() {
  if (!isCameraSupported() || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch (err) {
    console.warn('[camera] enumerateDevices failed', err);
    return [];
  }
}

export function getCurrentFacingMode() {
  return facingMode;
}

export async function startCamera({ facing = facingMode, width = 1080, height = 1440, deviceId } = {}) {
  if (!isCameraSupported()) {
    throw new Error('Camera APIs are not available in this browser.');
  }
  await stopCamera();
  const constraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: width }, height: { ideal: height } }
      : {
          facingMode: { ideal: facing },
          width: { ideal: width },
          height: { ideal: height },
        },
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    activeStream = stream;
    const track = stream.getVideoTracks?.()[0];
    if (track) {
      const settings = track.getSettings?.() || {};
      if (settings.facingMode) facingMode = settings.facingMode;
      else facingMode = facing;
    }
    return stream;
  } catch (err) {
    if (err && err.name === 'OverconstrainedError' && !deviceId) {
      // Retry with relaxed constraints
      const fallback = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing } },
      });
      activeStream = fallback;
      return fallback;
    }
    throw err;
  }
}

export function stopCamera() {
  if (!activeStream) return;
  for (const track of activeStream.getTracks()) {
    try { track.stop(); } catch (err) { console.warn('[camera] track stop failed', err); }
  }
  activeStream = null;
}

export function attachStreamToVideo(videoEl, stream) {
  if (!videoEl) return;
  try {
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    if (typeof videoEl.play === 'function') {
      videoEl.play().catch((err) => console.warn('[camera] video.play failed', err));
    }
  } catch (err) {
    console.warn('[camera] attachStreamToVideo failed', err);
  }
}

export async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  return startCamera({ facing: facingMode });
}

export function describeCameraError(err) {
  if (!err) return 'Unknown camera error.';
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found that matches the requested settings.';
    case 'NotReadableError':
      return 'The camera is in use by another application. Close other apps and try again.';
    case 'AbortError':
      return 'Camera start was interrupted. Please try again.';
    default:
      return err.message || 'Could not start the camera.';
  }
}
