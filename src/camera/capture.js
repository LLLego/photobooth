const DEFAULTS = {
  width: 1200,
  height: 1600,
  quality: 0.85,
  type: 'image/png',
};

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(width, height); } catch {}
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function canvasToBlob(canvas, type, quality) {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas could not be encoded.'));
      }, type, quality);
    });
  }
  if (canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  return Promise.reject(new Error('Canvas type is not supported for export.'));
}

function ctxOf(canvas) {
  if (!canvas) return null;
  if (typeof canvas.getContext === 'function') return canvas.getContext('2d');
  return null;
}

function drawCover(ctx, source, dx, dy, dw, dh, { zoom = 1, mirror = false } = {}) {
  if (!source || !ctx) return;
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) {
    try { ctx.drawImage(source, dx, dy, dw, dh); } catch (err) { console.warn('[capture] drawImage fallback failed', err); }
    return;
  }
  const sRatio = sw / sh;
  const dRatio = dw / dh;
  let cropW = sw;
  let cropH = sh;
  if (sRatio > dRatio) {
    cropW = sh * dRatio;
  } else {
    cropH = sw / dRatio;
  }
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  cropW /= scale;
  cropH /= scale;
  const cropX = (sw - cropW) / 2;
  const cropY = (sh - cropH) / 2;
  ctx.save();
  if (mirror) {
    ctx.translate(dx + dw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, dy, dw, dh);
  } else {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
  }
  ctx.restore();
}

function drawFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image blob.'));
    };
    img.src = url;
  });
}

async function loadImage(src) {
  if (!src) return null;
  if (src instanceof HTMLImageElement && src.complete && src.naturalWidth) return src;
  if (src instanceof HTMLCanvasElement && src.width > 0) return src;
  if (typeof createImageBitmap === 'function' && (src instanceof Blob || src instanceof ImageBitmap)) {
    try { return await createImageBitmap(src); } catch {}
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    if (src instanceof HTMLImageElement) {
      if (src.complete && src.naturalWidth) resolve(src);
      else src.addEventListener('load', () => resolve(src), { once: true });
      src.addEventListener('error', () => resolve(null), { once: true });
    } else {
      img.src = src;
    }
  });
}

export async function takePhoto(videoEl, frameSource, themeConfig = {}, opts = {}) {
  if (!videoEl) throw new Error('Video element required for capture.');
  const {
    width = DEFAULTS.width,
    height = DEFAULTS.height,
    quality = DEFAULTS.quality,
    type = DEFAULTS.type,
    slots,
    filter,
    zoom = 1,
    mirror = false,
  } = opts;

  const canvas = createCanvas(width, height);
  const ctx = ctxOf(canvas);
  if (!ctx) throw new Error('2D canvas context is not available.');

  if (themeConfig.background) {
    ctx.fillStyle = themeConfig.background;
    ctx.fillRect(0, 0, width, height);
  }

  const targetSlots = (slots && slots.length)
    ? slots
    : [{ x: 0, y: 0, w: 1, h: 1 }];

  const previousFilter = ctx.filter;
  if (filter && filter !== 'none' && filter !== 'original') {
    ctx.filter = filter;
  }

  try {
    for (const slot of targetSlots) {
      const dx = slot.x * width;
      const dy = slot.y * height;
      const dw = slot.w * width;
      const dh = slot.h * height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, dw, dh);
      ctx.clip();
      try { drawCover(ctx, videoEl, dx, dy, dw, dh, { zoom, mirror }); }
      catch (err) { console.warn('[capture] drawCover failed', err); }
      ctx.restore();
    }

    ctx.filter = previousFilter || 'none';
    if (frameSource) {
      const frameImg = await loadImage(frameSource).catch((err) => {
        console.warn('[capture] frame load failed', err);
        return null;
      });
      if (frameImg) {
        try { ctx.drawImage(frameImg, 0, 0, width, height); }
        catch (err) { console.warn('[capture] frame draw failed', err); }
      } else {
        console.warn('[capture] frame overlay skipped (image unavailable)');
      }
    }
  } finally {
    ctx.filter = previousFilter || 'none';
  }

  const blob = await canvasToBlob(canvas, type, quality);
  return { blob, width, height, type };
}

export async function stripExif(blob, { type = 'image/png' } = {}) {
  if (!blob) return blob;
  let img = null;
  try {
    img = await drawFromBlob(blob);
  } catch {
    return blob;
  }
  if (!img) return blob;
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const canvas = createCanvas(w, h);
  const ctx = ctxOf(canvas);
  if (!ctx) return blob;
  try { ctx.drawImage(img, 0, 0); }
  catch (err) { console.warn('[capture] stripExif draw failed', err); return blob; }
  return canvasToBlob(canvas, type, quality);
}

export async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return reject(new Error('No blob provided'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read blob.'));
    reader.readAsDataURL(blob);
  });
}

export async function blobToObjectURL(blob) {
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function revokeObjectURL(url) {
  if (url && typeof URL.revokeObjectURL === 'function') {
    try { URL.revokeObjectURL(url); } catch {}
  }
}

export const CAPTURE_DEFAULTS = DEFAULTS;
