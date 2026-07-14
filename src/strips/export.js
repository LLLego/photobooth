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
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function shareStrip(blob, { filename = 'photobooth-strip', title = 'our photobooth', text = 'A photo from our photobooth' } = {}) {
  if (!blob) throw new Error('A blob is required to share.');
  const file = new File([blob], filenameWithExt(filename, blob.type), { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return { shared: true, method: 'native' };
    } catch (err) {
      if (err?.name === 'AbortError') return { shared: false, cancelled: true };
      throw err;
    }
  }
  if (navigator.share) {
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

function filenameWithExt(name, mime) {
  const base = (name || 'photobooth-strip').replace(/\.[^./]+$/, '');
  if (!mime) return `${base}.webp`;
  if (mime.includes('png')) return `${base}.png`;
  if (mime.includes('jpeg')) return `${base}.jpg`;
  if (mime.includes('webp')) return `${base}.webp`;
  return base;
}
