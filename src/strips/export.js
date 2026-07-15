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

const PRINT_STYLE_ID = 'photobooth-print-styles';

function ensurePrintStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #photobooth-print-frame, #photobooth-print-frame * { visibility: visible !important; }
      #photobooth-print-frame {
        position: absolute !important;
        left: 0; top: 0;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        box-shadow: none !important;
      }
      #photobooth-print-frame img,
      #photobooth-print-frame canvas {
        display: block !important;
        max-width: 100% !important;
        height: auto !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      @page { margin: 12mm; }
    }
  `;
  document.head.appendChild(style);
}

export async function printStrip(blob, { filename = 'photobooth-strip', title = 'our photobooth' } = {}) {
  if (!blob) throw new Error('A blob is required to print.');
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Printing is only available in a browser.');
  }
  ensurePrintStyles();

  let existing = document.getElementById('photobooth-print-frame');
  if (existing) existing.remove();
  existing = null;

  const isImage = blob.type.startsWith('image/');
  const objectUrl = URL.createObjectURL(blob);

  const frame = document.createElement('div');
  frame.id = 'photobooth-print-frame';
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.padding = '24px';
  frame.style.background = '#fff';

  if (isImage) {
    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = title;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    frame.append(img);
  } else {
    const note = document.createElement('p');
    note.textContent = 'Print preview unavailable for this format.';
    frame.append(note);
  }

  document.body.append(frame);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const node = document.getElementById('photobooth-print-frame');
    if (node) node.remove();
    try { URL.revokeObjectURL(objectUrl); } catch {}
  };

  try {
    if (document.title && title) document.title = `${title} – print`;
    window.print();
    return { printed: true, filename: filenameWithExt(filename, blob.type) };
  } catch (err) {
    cleanup();
    throw err;
  } finally {
    setTimeout(cleanup, 1000);
  }
}
