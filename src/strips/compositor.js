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
  if (!canvas) return null;
  return typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
}

function fitInto(ctx, source, dx, dy, dw, dh, { mirror = false } = {}) {
  if (!source || !ctx) return;
  const sw = source.naturalWidth || source.width || source.videoWidth;
  const sh = source.naturalHeight || source.height || source.videoHeight;
  if (!sw || !sh || !dw || !dh) {
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
  try {
    if (mirror) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, dw, dh);
    } else {
      ctx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
    }
  } catch (err) {
    console.warn('[compositor] drawImage failed', err);
  } finally {
    ctx.restore();
  }
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

async function readPhoto(photo) {
  if (!photo) return null;
  if (photo instanceof HTMLImageElement || photo instanceof HTMLCanvasElement || photo instanceof ImageBitmap) {
    return photo;
  }
  if (photo instanceof Blob) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(photo); } catch {}
    }
    const url = URL.createObjectURL(photo);
    try {
      return await loadImage(url);
    } finally {
      try { URL.revokeObjectURL(url); } catch {}
    }
  }
  if (typeof photo === 'string') return loadImage(photo);
  return null;
}

function drawBackground(ctx, theme, width, height) {
  const bg = theme?.palette?.stripBg || theme?.palette?.background || '#FFFFFF';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawBranding(ctx, theme, width, height) {
  const branding = theme?.branding || {};
  const textColor = branding.color || theme?.palette?.text || '#2D1B11';
  const fontSize = Number.isFinite(branding.fontSize) && branding.fontSize > 0 ? branding.fontSize : 28;
  const font = theme?.fonts?.branding || "'Georgia', serif";
  const footerText = 'our photobooth';
  const emoji = '📷';
  const footerY = height - Math.max(20, fontSize);

  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Measure combined glyphs so emoji + text sit naturally together.
  ctx.font = `${fontSize}px ${font}`;
  const textWidth = ctx.measureText(footerText).width;
  ctx.font = `${Math.round(fontSize * 0.95)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
  const emojiWidth = ctx.measureText(emoji).width;
  const gap = Math.round(fontSize * 0.4);
  const total = emojiWidth + gap + textWidth;
  const startX = (width - total) / 2;

  ctx.font = `${Math.round(fontSize * 0.95)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(emoji, startX + emojiWidth / 2, footerY);

  ctx.font = `${fontSize}px ${font}`;
  ctx.fillText(footerText, startX + emojiWidth + gap + textWidth / 2, footerY);

  // Optional theme-supplied branding still drawn (smaller, above the footer).
  if (branding.showOnStrip && branding.text && Number.isFinite(fontSize) && fontSize > 0) {
    ctx.font = `${Math.max(14, Math.round(fontSize * 0.55))}px ${font}`;
    ctx.fillStyle = textColor;
    ctx.fillText(branding.text, width / 2, footerY - Math.round(fontSize * 1.1));
  }

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

  const slots = layout.slots || [];
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
    const frame = await loadImage(theme.frame.url).catch((err) => {
      console.warn('[compositor] frame load failed', err);
      return null;
    });
    if (frame) {
      try { ctx.drawImage(frame, 0, 0, width, height); }
      catch (err) { console.warn('[compositor] frame draw failed', err); }
    } else {
      console.warn('[compositor] frame overlay skipped (image unavailable)');
    }
  }
  drawBranding(ctx, theme, width, height);

  return canvas;
}

export async function canvasToBlob(canvas, { type = 'image/png' } = {}) {
  const opts = type.includes('png') ? { type } : { type, quality };
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas could not be encoded.'));
      }, opts.type, opts.quality);
    });
  }
  if (canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob(opts);
  }
  throw new Error('Unsupported canvas for export.');
}
