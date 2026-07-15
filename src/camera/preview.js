import { attachStreamToVideo, startCamera, stopCamera, switchCamera, detachStreamFromVideo, describeCameraError } from './camera.js';
import { loadTheme } from '../themes/theme-loader.js';

export async function startLivePreview({ videoEl, frameEl, themeId, onError, onStatusChange } = {}) {
  if (!videoEl) throw new Error('startLivePreview requires a <video> element.');
  try {
    onStatusChange?.('starting');
    const stream = await startCamera();
    attachStreamToVideo(videoEl, stream);
    onStatusChange?.('ready');
    if (frameEl) {
      await setPreviewFrame(frameEl, themeId || 'minimal');
    }
    return stream;
  } catch (err) {
    console.error('[preview] start failed', err);
    onError?.(describeCameraError(err));
    throw err;
  }
}

export function stopLivePreview(videoEl) {
  detachStreamFromVideo(videoEl);
  stopCamera();
}

export async function flipCamera(videoEl) {
  const stream = await switchCamera();
  attachStreamToVideo(videoEl, stream);
  return stream;
}

export async function setPreviewFrame(frameEl, themeId) {
  if (!frameEl) return;
  if (!themeId || themeId === 'none') {
    frameEl.removeAttribute('src');
    frameEl.onerror = null;
    frameEl.style.display = 'none';
    return;
  }
  try {
    const theme = await loadTheme(themeId);
    if (theme?.frame?.url) {
      // Reset img state before assigning new src
      frameEl.removeAttribute('src');
      frameEl.onerror = null;
      // Set handler first, then src — prevents race
      frameEl.onerror = () => {
        console.warn('[preview] frame image failed to load', themeId, theme.frame.url);
        frameEl.style.display = 'none';
      };
      frameEl.src = theme.frame.url;
      frameEl.style.display = '';
    } else {
      frameEl.removeAttribute('src');
      frameEl.onerror = null;
      frameEl.style.display = 'none';
    }
  } catch (err) {
    console.warn('[preview] setPreviewFrame failed', err);
    frameEl.removeAttribute('src');
    frameEl.onerror = null;
    frameEl.style.display = 'none';
  }
}
