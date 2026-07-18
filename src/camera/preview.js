import { attachStreamToVideo, startCamera, stopCamera, switchCamera, detachStreamFromVideo, describeCameraError } from './camera.js';
import { loadTheme } from '../themes/theme-loader.js';

function drawCover(ctx, source, width, height, { zoom = 1, mirror = false } = {}) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceRatio > targetRatio) cropWidth = sourceHeight * targetRatio;
  else cropHeight = sourceWidth / targetRatio;

  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  cropWidth /= scale;
  cropHeight /= scale;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;

  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
  ctx.restore();
}

export function startCanvasPreview({ videoEl, canvasEl, frameEl, getOptions } = {}) {
  if (!videoEl || !canvasEl) throw new Error('Canvas preview requires video and canvas elements.');
  const ctx = canvasEl.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is not available.');

  let animationFrame = 0;
  let stopped = false;

  function render() {
    if (stopped) return;
    const rect = canvasEl.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    if (videoEl.readyState >= 2) {
      const options = getOptions?.() || {};
      ctx.filter = options.filter && options.filter !== 'none' ? options.filter : 'none';
      drawCover(ctx, videoEl, width, height, options);
      ctx.filter = 'none';
    }
    if (frameEl?.complete && frameEl.naturalWidth) {
      drawCover(ctx, frameEl, width, height);
    }

    animationFrame = requestAnimationFrame(render);
  }

  animationFrame = requestAnimationFrame(render);
  return () => {
    stopped = true;
    cancelAnimationFrame(animationFrame);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  };
}

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
    frameEl.style.opacity = '0';
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
        frameEl.style.opacity = '0';
      };
      frameEl.src = new URL(theme.frame.url, `${import.meta.env.BASE_URL}themes/${themeId}/`).href;
      frameEl.style.display = '';
      frameEl.style.opacity = '1';
    } else {
      frameEl.removeAttribute('src');
      frameEl.onerror = null;
      frameEl.style.display = 'none';
      frameEl.style.opacity = '0';
    }
  } catch (err) {
    console.warn('[preview] setPreviewFrame failed', err);
    frameEl.removeAttribute('src');
    frameEl.onerror = null;
    frameEl.style.display = 'none';
    frameEl.style.opacity = '0';
  }
}
