import { getLayout } from './layouts.js';

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(width, height); } catch {}
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function ctxOf(canvas) {
  return canvas.getContext ? canvas.getContext('2d') : null;
}

function fitInto(ctx, source, dx, dy, dw, dh, { mirror = false } = {}) {
  if (!source) return;
  const sw = source.naturalWidth || source.width || source.videoWidth;
  const sh = source.naturalHeight || source.height || source.videoHeight;
  if (!sw || !sh) {
    try { ctx.drawImage(source, dx, dy, dw, dh); } catch (err) { console.warn('[compositor] drawImage fallback failed', err); }
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
  ctx.save();
  if (mirror) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, dw, dh);
  } else {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
  }
  ctx.restore();
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (src instanceof HTMLImageElement && src.complete && src.naturalWidth) return Promise.resolve(src);
  if (typeof createImageBitmap === 'function' && (src instanceof Blob || src instanceof ImageBitmap)) {
    return createImageBitmap(src).catch(() => null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    if (src instanceof HTMLImageElement) {
      if (src.complete) resolve(src);
      else src.addEventListener('load', () => resolve(src), { once: true });
    } else {
      img.src = src;
    }
  });
}

function readPhoto(photo) {
  if (photo instanceof HTMLImageElement || photo instanceof HTMLCanvasElement || photo instanceof ImageBitmap) {
    return Promise.resolve(photo);
  }
  if (photo instanceof Blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(photo).catch(() => loadImage(URL.createObjectURL(photo)));
    }
    return loadImage(URL.createObjectURL(photo));
  }
  if (typeof photo === 'string') return loadImage(photo);
  return Promise.resolve(null);
}

function drawBackground(ctx, theme, width, height) {
  const bg = theme?.palette?.stripBg || theme?.palette?.background || '#FFFFFF';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawBranding(ctx, theme, width, height) {
  if (!theme?.branding?.showOnStrip) return;
  const { text, fontSize = 24, color = '#2D1B11', position = 'bottom' } = theme.branding;
  if (!text) return;
  const font = theme.fonts?.branding || "'Georgia', serif";
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = position === 'top' ? height - fontSize - 12 : height - fontSize - 12;
  ctx.fillText(text, width / 2, y);
  ctx.restore();
}

export async function compositeStrip(photos = [], theme, layoutId, opts = {}) {
  const layout = getLayout(layoutId);
  const width = layout.width;
  const height = layout.height;
  const canvas = createCanvas(width, height);
  const ctx = ctxOf(canvas);
  if (!ctx) throw new Error('2D canvas context is not available.');

  drawBackground(ctx, theme || {}, width, height);

  const slots = layout.slots;
  const limited = Math.min(photos.length, slots.length);
  for (let i = 0; i < limited; i++) {
    const slot = slots[i];
    const dx = Math.round(slot.x * width);
    const dy = Math.round(slot.y * height);
    const dw = Math.round(slot.w * width);
    const dh = Math.round(slot.h * height);
    const photo = await readPhoto(photos[i]);
    if (!photo) continue;
    fitInto(ctx, photo, dx, dy, dw, dh, { mirror: Boolean(opts.mirror && i % 2 === 1) });
  }

  if (theme?.frame?.url && theme.id !== 'none') {
    const frame = await loadImage(theme.frame.url);
    if (frame) {
      ctx.drawImage(frame, 0, 0, width, height);
    }
  }
  drawBranding(ctx, theme, width, height);

  return canvas;
}

export async function canvasToBlob(canvas, { type = 'image/webp', quality = 0.9 } = {}) {
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
  throw new Error('Unsupported canvas for export.');
}
