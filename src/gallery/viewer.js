import { ensureSignedUrl, removeStrip, toggleFavoriteForStrip } from './gallery.js';
import { Modal, Button, Icon, Spinner } from '../ui/components.js';
import { downloadStrip, shareStrip } from '../strips/export.js';
import { pushToast } from '../state.js';

let activeModal = null;

export function openStripViewer(strip) {
  if (activeModal) activeModal.close();
  const state = { strip, scale: 1, tx: 0, ty: 0, url: null };

  const loader = document.createElement('div');
  loader.className = 'flex flex-col items-center justify-center py-10 gap-3';
  loader.append(Spinner({ size: 28, label: 'Loading strip…' }));

  const errorBox = document.createElement('div');
  errorBox.className = 'text-center text-sm text-rose-600 dark:text-rose-300 py-6 hidden';
  errorBox.setAttribute('role', 'alert');
  const errorMsg = document.createElement('p');
  errorMsg.className = 'mb-3';
  const errorRetry = Button({ label: 'Try again', variant: 'ghost', onClick: () => loadImage(true) });
  errorBox.append(errorMsg, errorRetry);

  const img = document.createElement('img');
  img.alt = strip.themeName || 'Strip';
  img.className = 'max-h-[80vh] w-auto mx-auto rounded-2xl shadow-md select-none transition-transform duration-200 ease-out hidden';
  img.draggable = false;
  img.style.transformOrigin = 'center center';

  img.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    state.scale = Math.min(4, Math.max(1, state.scale + (ev.deltaY < 0 ? 0.1 : -0.1)));
    img.style.transform = `scale(${state.scale})`;
  }, { passive: false });

  let pinchStart = null;
  let pinchBaseScale = 1;
  img.addEventListener('touchstart', (ev) => {
    if (ev.touches.length === 2) {
      pinchStart = Math.hypot(
        ev.touches[0].clientX - ev.touches[1].clientX,
        ev.touches[0].clientY - ev.touches[1].clientY
      );
      pinchBaseScale = state.scale;
    }
  }, { passive: true });
  img.addEventListener('touchmove', (ev) => {
    if (pinchStart && ev.touches.length === 2) {
      const d = Math.hypot(
        ev.touches[0].clientX - ev.touches[1].clientX,
        ev.touches[0].clientY - ev.touches[1].clientY
      );
      const ratio = d / pinchStart;
      state.scale = Math.min(4, Math.max(1, pinchBaseScale * ratio));
      img.style.transform = `scale(${state.scale})`;
    }
  }, { passive: true });
  img.addEventListener('touchend', () => { pinchStart = null; });

  img.addEventListener('click', () => {
    state.scale = state.scale > 1 ? 1 : 2;
    img.style.transform = `scale(${state.scale})`;
  });

  img.addEventListener('error', () => {
    loader.classList.add('hidden');
    img.classList.add('hidden');
    errorMsg.textContent = 'This strip image could not be loaded.';
    errorBox.classList.remove('hidden');
  });

  async function loadImage(force = false) {
    loader.classList.remove('hidden');
    img.classList.add('hidden');
    errorBox.classList.add('hidden');
    try {
      const url = await ensureSignedUrl(strip, { force });
      if (!url) throw new Error('Could not load image.');
      loader.classList.add('hidden');
      img.src = url;
      img.classList.remove('hidden');
    } catch (err) {
      loader.classList.add('hidden');
      img.classList.add('hidden');
      errorMsg.textContent = err.message || 'Could not load image.';
      errorBox.classList.remove('hidden');
    }
  }

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center';
  wrap.append(loader, errorBox, img);

  const meta = document.createElement('div');
  meta.className = 'text-sm text-warmth-500 dark:text-warmth-400 text-center mt-3';
  meta.textContent = `${strip.mode === 'dual' ? 'Dual camera' : 'Single camera'} · ${strip.layout} · ${formatDate(strip.createdAt)}`;
  wrap.append(meta);

  loadImage();

  const buildFavBtn = (favorited) => {
    const b = Button({
      variant: 'ghost',
      icon: Icon({ name: favorited ? 'heartFilled' : 'heart' }),
      label: favorited ? 'Unfavorite' : 'Favorite',
      ariaLabel: favorited ? 'Remove from favorites' : 'Add to favorites',
    });
    b.setAttribute('aria-pressed', favorited ? 'true' : 'false');
    return b;
  };
  let favBtn = buildFavBtn(!!strip.favorited);
  const downloadBtn = Button({ variant: 'primary', icon: Icon({ name: 'download' }), label: 'Download', ariaLabel: 'Download strip' });
  const shareBtn = Button({ variant: 'ghost', icon: Icon({ name: 'share' }), label: 'Share', ariaLabel: 'Share strip' });
  const deleteBtn = Button({ variant: 'danger', icon: Icon({ name: 'trash' }), label: 'Delete', ariaLabel: 'Delete strip' });

  const replaceFavBtn = (favorited) => {
    const fresh = buildFavBtn(favorited);
    fresh.addEventListener('click', favClick);
    favBtn.replaceWith(fresh);
    favBtn = fresh;
  };

  const favClick = async () => {
    favBtn.disabled = true;
    try {
      const now = await toggleFavoriteForStrip(strip.id);
      strip.favorited = now;
      replaceFavBtn(now);
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    } finally {
      try { favBtn.disabled = false; } catch {}
    }
  };
  favBtn.addEventListener('click', favClick);

  const setBusy = (busy) => {
    downloadBtn.disabled = busy;
    shareBtn.disabled = busy;
  };

  shareBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      const url = await ensureSignedUrl(strip, { force: true });
      if (!url) throw new Error('Could not load image.');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Image fetch failed.');
      const blob = await res.blob();
      const result = await shareStrip(blob, { filename: strip.id });
      if (!result.shared && !result.cancelled) {
        pushToast({ message: 'Saved a local copy instead.', type: 'info' });
      }
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  });

  downloadBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      const url = await ensureSignedUrl(strip, { force: true });
      if (!url) throw new Error('Could not load image.');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Image fetch failed.');
      const blob = await res.blob();
      downloadStrip(blob, strip.id);
      pushToast({ message: 'Saved to your downloads.', type: 'success' });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  });

  const actions = [favBtn, shareBtn, downloadBtn, deleteBtn];
  const modal = Modal({
    title: strip.themeName || 'Strip',
    content: wrap,
    actions,
    onClose: () => { activeModal = null; },
  });
  activeModal = modal;

  const dialog = modal.element.querySelector('[role="dialog"]');
  const titleEl = dialog?.querySelector('h2');
  const bodyEl = dialog?.querySelector('[data-body]');
  const rowEl = dialog?.querySelector('[data-actions]');

  deleteBtn.addEventListener('click', () => {
    if (!titleEl || !bodyEl || !rowEl) {
      window.confirm('Delete this strip? This cannot be undone.')
        && removeStrip(strip.id).then(() => modal.close()).catch((err) => pushToast({ message: err.message, type: 'error' }));
      return;
    }
    const restore = () => {
      titleEl.textContent = strip.themeName || 'Strip';
      bodyEl.innerHTML = '';
      bodyEl.append(wrap);
      rowEl.innerHTML = '';
      actions.forEach((a) => rowEl.append(a));
    };
    titleEl.textContent = 'Delete this strip?';
    bodyEl.innerHTML = '';
    const warn = document.createElement('p');
    warn.className = 'text-warmth-700 dark:text-warmth-400 leading-relaxed';
    warn.textContent = 'This removes the strip from your gallery. The original photos remain on the device only.';
    bodyEl.append(warn);
    rowEl.innerHTML = '';
    const cancel = Button({ label: 'Cancel', variant: 'ghost', onClick: restore });
    const confirm = Button({ label: 'Delete', variant: 'danger', onClick: async () => {
      confirm.disabled = true;
      try {
        await removeStrip(strip.id);
        modal.close();
      } catch (err) {
        pushToast({ message: err.message, type: 'error' });
        confirm.disabled = false;
        restore();
      }
    } });
    rowEl.append(cancel, confirm);
    cancel.focus();
  });

  document.body.append(modal.element);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}