import { attachStreamToVideo, startCamera, stopCamera, switchCamera, describeCameraError } from './camera.js';
import { loadTheme } from '../themes/theme-loader.js';

export async function startLivePreview({ videoEl, frameEl, themeId, onError, onStatusChange } = {}) {
  if (!videoEl) throw new Error('startLivePreview requires a <video> element.');
  try {
    onStatusChange?.('starting');
    const stream = await startCamera();
    attachStreamToVideo(videoEl, stream);
    onStatusChange?.('ready');
    if (frameEl) {
      const theme = await loadTheme(themeId || 'minimal');
      const url = theme?.frame?.url ? absoluteUrl(theme.frame.url) : null;
      if (url) {
        frameEl.src = url;
        frameEl.style.display = '';
      } else {
        frameEl.removeAttribute('src');
        frameEl.style.display = 'none';
      }
    }
    return stream;
  } catch (err) {
    console.error('[preview] start failed', err);
    onError?.(describeCameraError(err));
    throw err;
  }
}

export function stopLivePreview(videoEl) {
  if (videoEl) {
    try { videoEl.pause(); } catch {}
    try { videoEl.removeAttribute('src'); videoEl.load?.(); } catch {}
  }
  stopCamera();
}

export async function flipCamera(videoEl) {
  const stream = await switchCamera();
  attachStreamToVideo(videoEl, stream);
  return stream;
}

export async function setPreviewFrame(frameEl, themeId) {
  if (!frameEl) return;
  const theme = await loadTheme(themeId);
  if (theme?.frame?.url) {
    frameEl.src = absoluteUrl(theme.frame.url);
    frameEl.style.display = '';
  } else {
    frameEl.removeAttribute('src');
    frameEl.style.display = 'none';
  }
}

function absoluteUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return url;
  return `/${url}`;
}
