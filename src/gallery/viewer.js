import { ensureSignedUrl, removeStrip, toggleFavoriteForStrip } from './gallery.js';
import { Modal, Button, Icon } from '../ui/components.js';
import { downloadStrip, shareStrip } from '../strips/export.js';
import { pushToast } from '../state.js';

let activeModal = null;
let activeState = null;

export function openStripViewer(strip) {
  if (activeModal) activeModal.close();
  const state = { strip, scale: 1, tx: 0, ty: 0, url: null };
  activeState = state;

  const img = document.createElement('img');
  img.alt = strip.themeName || 'Strip';
  img.className = 'max-h-[80vh] w-auto mx-auto rounded-2xl shadow-md select-none transition-transform duration-200 ease-out';
  img.draggable = false;
  img.style.transformOrigin = 'center center';
  img.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    state.scale = Math.min(4, Math.max(1, state.scale + (ev.deltaY < 0 ? 0.1 : -0.1)));
    img.style.transform = `scale(${state.scale})`;
  }, { passive: false });

  let pinchStart = null;
  img.addEventListener('touchstart', (ev) => {
    if (ev.touches.length === 2) {
      pinchStart = Math.hypot(
        ev.touches[0].clientX - ev.touches[1].clientX,
        ev.touches[0].clientY - ev.touches[1].clientY
      );
    }
  }, { passive: true });
  img.addEventListener('touchmove', (ev) => {
    if (pinchStart && ev.touches.length === 2) {
      const d = Math.hypot(
        ev.touches[0].clientX - ev.touches[1].clientX,
        ev.touches[0].clientY - ev.touches[1].clientY
      );
      const ratio = d / pinchStart;
      state.scale = Math.min(4, Math.max(1, state.scale * (ratio / (state.scale || 1))));
      pinchStart = d;
      img.style.transform = `scale(${state.scale})`;
    }
  }, { passive: true });
  img.addEventListener('touchend', () => { pinchStart = null; });

  img.addEventListener('click', () => {
    state.scale = state.scale > 1 ? 1 : 2;
    img.style.transform = `scale(${state.scale})`;
  });

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center';
  wrap.append(img);

  const meta = document.createElement('div');
  meta.className = 'text-sm text-warmth-500 text-center mt-3';
  meta.textContent = `${strip.mode === 'dual' ? 'Dual camera' : 'Single camera'} · ${strip.layout} · ${formatDate(strip.createdAt)}`;
  wrap.append(meta);

  ensureSignedUrl(strip).then((url) => { if (url) img.src = url; });

  const favBtn = Button({ variant: 'ghost', icon: Icon({ name: strip.favorited ? 'heartFilled' : 'heart' }), label: strip.favorited ? 'Unfavorite' : 'Favorite' });
  const downloadBtn = Button({ variant: 'primary', icon: Icon({ name: 'download' }), label: 'Download' });
  const shareBtn = Button({ variant: 'ghost', icon: Icon({ name: 'share' }), label: 'Share' });
  const deleteBtn = Button({ variant: 'danger', icon: Icon({ name: 'trash' }), label: 'Delete' });

  favBtn.addEventListener('click', async () => {
    try {
      const now = await toggleFavoriteForStrip(strip.id);
      strip.favorited = now;
      favBtn.querySelector('span').textContent = '';
      favBtn.querySelector('span').append(Icon({ name: now ? 'heartFilled' : 'heart' }));
      const lbl = document.createElement('span');
      lbl.textContent = now ? 'Unfavorite' : 'Favorite';
      favBtn.append(lbl);
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    }
  });

  shareBtn.addEventListener('click', async () => {
    try {
      const url = await ensureSignedUrl(strip, { force: true });
      if (!url) throw new Error('Could not load image.');
      const res = await fetch(url);
      const blob = await res.blob();
      const result = await shareStrip(blob, { filename: strip.id });
      if (!result.shared && !result.cancelled) {
        pushToast({ message: 'Saved a local copy instead.', type: 'info' });
      }
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    }
  });

  downloadBtn.addEventListener('click', async () => {
    try {
      const url = await ensureSignedUrl(strip, { force: true });
      if (!url) throw new Error('Could not load image.');
      const res = await fetch(url);
      const blob = await res.blob();
      downloadStrip(blob, strip.id);
      pushToast({ message: 'Saved to your downloads.', type: 'success' });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const confirm = Modal({
      title: 'Delete this strip?',
      content: 'This removes the strip from your gallery. The original photos remain on the device only.',
      actions: [
        Button({ label: 'Cancel', variant: 'ghost', onClick: () => confirm.close() }),
        Button({ label: 'Delete', variant: 'danger', onClick: async () => {
          confirm.close();
          try {
            await removeStrip(strip.id);
            modal.close();
          } catch (err) {
            pushToast({ message: err.message, type: 'error' });
          }
        } }),
      ],
    });
    document.body.append(confirm.element);
  });

  const actions = [favBtn, shareBtn, downloadBtn, deleteBtn];
  const modal = Modal({
    title: strip.themeName || 'Strip',
    content: wrap,
    actions,
    onClose: () => { activeModal = null; activeState = null; },
  });
  activeModal = modal;
  document.body.append(modal.element);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}
