import { canvasToBlob } from './compositor.js';

export async function exportStrip(canvas, { format = 'image/webp', quality = 0.9, filename = 'photobooth-strip' } = {}) {
  const blob = await canvasToBlob(canvas, { type: format, quality });
  return { blob, filename, suggestedName: filenameWithExt(filename, format) };
}

export function downloadStrip(blob, filename = 'photobooth-strip') {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameWithExt(filename, blob.type);
  a.rel = 'noopener';
  try {
    document.body.append(a);
    a.click();
  } finally {
    if (a.parentNode) a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 1000);
  }
}

export async function shareStrip(blob, { filename = 'photobooth-strip', title = 'our photobooth', text = 'A photo from our photobooth' } = {}) {
  if (!blob) throw new Error('A blob is required to share.');
  const finalName = filenameWithExt(filename, blob.type);
  const file = new File([blob], finalName, { type: blob.type });
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return { shared: true, method: 'native' };
    } catch (err) {
      if (err?.name === 'AbortError') return { shared: false, cancelled: true };
      throw err;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text });
      return { shared: true, method: 'link' };
    } catch (err) {
      if (err?.name === 'AbortError') return { shared: false, cancelled: true };
    }
  }
  downloadStrip(blob, filename);
  return { shared: false, method: 'download' };
}

export function filenameWithExt(name, mime) {
  const base = (name || 'photobooth-strip').replace(/\.[^./]+$/, '');
  if (!mime) return `${base}.webp`;
  if (mime.includes('png')) return `${base}.png`;
  if (mime.includes('jpeg') || mime.includes('jpg')) return `${base}.jpg`;
  if (mime.includes('webp')) return `${base}.webp`;
  return base;
}
