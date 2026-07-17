export function Button({ label, variant = 'primary', onClick, disabled, type = 'button', icon, className = '', ariaLabel } = {}) {
  const btn = document.createElement('button');
  btn.type = type;
  const variantClass = {
    primary: 'btn-primary',
    accent: 'btn-accent',
    ghost: 'btn-ghost',
    honey: 'btn-honey',
    danger: 'btn-danger',
  }[variant] || 'btn-primary';
  btn.className = `${variantClass} ${className}`.trim();
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  if (icon) {
    const i = document.createElement('span');
    i.className = 'inline-flex items-center';
    if (icon instanceof HTMLElement) i.append(icon);
    else { i.textContent = String(icon); }
    btn.append(i);
  }
  if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    btn.append(span);
  }
  if (disabled) btn.disabled = true;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export function Modal({ title, content, actions, onClose, dismissible = true, ariaLabelledBy } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop fade-in';

  const dialog = document.createElement('div');
  dialog.className = 'card max-w-md w-full p-6 fade-up';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;

  if (title) {
    const h = document.createElement('h2');
    h.className = 'heading-display text-2xl mb-3';
    h.textContent = title;
    if (!ariaLabelledBy) ariaLabelledBy = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
    h.id = ariaLabelledBy;
    dialog.setAttribute('aria-labelledby', ariaLabelledBy);
    dialog.append(h);
  }
  if (content) {
    const body = document.createElement('div');
    body.setAttribute('data-body', 'true');
    if (content instanceof HTMLElement) body.append(content);
    else if (typeof content === 'string') body.innerHTML = content;
    else body.append(...content);
    body.className = 'text-warmth-700 leading-relaxed';
    dialog.append(body);
  }
  if (actions && actions.length) {
    const row = document.createElement('div');
    row.setAttribute('data-actions', 'true');
    row.className = 'mt-6 flex flex-wrap justify-end gap-2';
    for (const a of actions) row.append(a);
    dialog.append(row);
  }

  backdrop.append(dialog);

  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let removed = false;

  function getFocusable() {
    return Array.from(dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null || el === dialog);
  }

  function trapFocus(ev) {
    if (ev.key !== 'Tab') return;
    const focusables = getFocusable();
    if (!focusables.length) {
      ev.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function escClose(ev) { if (ev.key === 'Escape') close(); }

  if (dismissible) {
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) close();
    });
    document.addEventListener('keydown', escClose);
  }
  document.addEventListener('keydown', trapFocus);

  function close() {
    if (removed) return;
    removed = true;
    document.removeEventListener('keydown', escClose);
    document.removeEventListener('keydown', trapFocus);
    backdrop.remove();
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    if (typeof onClose === 'function') onClose();
  }

  queueMicrotask(() => {
    if (removed) return;
    const focusables = getFocusable();
    if (focusables.length) focusables[0].focus();
    else dialog.focus();
  });

  return { element: backdrop, close, dialog };
}

export function Toast({ message, type = 'info' }) {
  const root = document.createElement('div');
  const palette = {
    info: 'bg-warmth-900 text-warmth-50',
    success: 'bg-sage-500 text-warmth-50',
    error: 'bg-rose-500 text-warmth-50',
    warn: 'bg-honey-500 text-warmth-900',
  };
  root.className = `${palette[type] || palette.info} text-sm rounded-full px-4 py-2 shadow-md slide-in pointer-events-auto`;
  root.setAttribute('role', type === 'error' ? 'alert' : 'status');
  root.textContent = message;
  return root;
}

export function Spinner({ size = 24, label } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'inline-flex items-center gap-2 text-warmth-600';
  wrap.setAttribute('aria-live', 'polite');
  const ring = document.createElement('span');
  ring.className = 'inline-block rounded-full border-2 border-warmth-200 border-t-warmth-900 animate-spin';
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
  ring.setAttribute('aria-hidden', 'true');
  wrap.append(ring);
  if (label) {
    const t = document.createElement('span');
    t.className = 'text-sm';
    t.textContent = label;
    wrap.append(t);
  }
  return wrap;
}

export function EmptyState({ title, message, action }) {
  const root = document.createElement('div');
  root.className = 'card p-8 text-center fade-up';
  root.setAttribute('role', 'status');
  const h = document.createElement('h3');
  h.className = 'heading-display text-xl mb-2';
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'text-warmth-600 mb-4';
  p.textContent = message;
  root.append(h, p);
  if (action) root.append(action);
  return root;
}

export function Icon({ name, size = 20 }) {
  const el = document.createElement('span');
  el.className = 'inline-flex items-center justify-center';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');

  const svgMap = {
    camera: 'camera', gallery: 'gallery', settings: 'settings',
    heart: 'heart', heartFilled: 'heart-filled', switch: 'switch',
    download: 'download', share: 'share', close: 'close',
    back: 'back', check: 'check', add: 'close', user: 'home',
    sparkle: 'star', home: 'home', refresh: 'refresh',
    filter: 'filter', grid: 'grid', strip: 'strip',
    polaroid: 'polaroid', photo: 'single-photo',
    'dual-camera': 'dual-camera', star: 'star',
    'star-filled': 'star-filled', print: 'print', trash: 'trash',
  };
  const svgName = svgMap[name];
  if (svgName) {
    const img = document.createElement('img');
    img.src = `${import.meta.env.BASE_URL}icons/${svgName}.svg`;
    img.alt = '';
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.loading = 'lazy';
    el.append(img);
  } else {
    el.textContent = '•';
  }
  return el;
}
