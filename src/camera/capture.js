const DEFAULTS = {
  width: 1200,
  height: 1600,
  quality: 0.85,
  type: 'image/webp',
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
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  return Promise.reject(new Error('Canvas type is not supported for export.'));
}

function ctxOf(canvas) {
  if (canvas.getContext) return canvas.getContext('2d');
  return null;
}

function drawCover(ctx, source, dx, dy, dw, dh) {
  if (!source) return;
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
  const cropX = (sw - cropW) / 2;
  const cropY = (sh - cropH) / 2;
  ctx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
}

function drawFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image blob.'));
    };
    img.src = url;
  });
}

async function loadImage(src) {
  if (!src) return null;
  if (src instanceof HTMLImageElement && src.complete && src.naturalWidth) return src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load frame: ${typeof src === 'string' ? src : '<image>'}`));
    if (src instanceof HTMLImageElement) {
      if (src.complete) resolve(src);
      else src.addEventListener('load', () => resolve(src), { once: true });
    } else {
      img.src = src;
    }
  });
}

export async function takePhoto(videoEl, frameSource, themeConfig = {}, opts = {}) {
  if (!videoEl) throw new Error('Video element required for capture.');
  const { width = DEFAULTS.width, height = DEFAULTS.height, quality = DEFAULTS.quality, type = DEFAULTS.type, slots } = opts;

  const canvas = createCanvas(width, height);
  const ctx = ctxOf(canvas);
  if (!ctx) throw new Error('2D canvas context is not available.');

  const videoW = videoEl.videoWidth || width;
  const videoH = videoEl.videoHeight || height;
  const targetSlots = (slots && slots.length)
    ? slots
    : [{ x: 0, y: 0, w: 1, h: 1 }];

  if (themeConfig.background) {
    ctx.fillStyle = themeConfig.background;
    ctx.fillRect(0, 0, width, height);
  }

  for (const slot of targetSlots) {
    const dx = slot.x * width;
    const dy = slot.y * height;
    const dw = slot.w * width;
    const dh = slot.h * height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    drawCover(ctx, videoEl, dx, dy, dw, dh);
    ctx.restore();
  }

  if (frameSource) {
    const frameImg = await loadImage(frameSource).catch((err) => {
      console.warn('[capture] frame load failed, continuing without frame', err);
      return null;
    });
    if (frameImg) {
      ctx.drawImage(frameImg, 0, 0, width, height);
    }
  }

  const blob = await canvasToBlob(canvas, type, quality);
  return { blob, width, height, type };
}

export async function stripExif(blob, { type = 'image/webp', quality = 0.9 } = {}) {
  const img = await drawFromBlob(blob).catch(() => null);
  if (!img) return blob;
  const canvas = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const ctx = ctxOf(canvas);
  if (!ctx) return blob;
  ctx.drawImage(img, 0, 0);
  return canvasToBlob(canvas, type, quality);
}

export async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read blob.'));
    reader.readAsDataURL(blob);
  });
}

export async function blobToObjectURL(blob) {
  return URL.createObjectURL(blob);
}

export const CAPTURE_DEFAULTS = DEFAULTS;
