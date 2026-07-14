export function Button({ label, variant = 'primary', onClick, disabled, type = 'button', icon, className = '' } = {}) {
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

export function Modal({ title, content, actions, onClose, dismissible = true } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop fade-in';

  const dialog = document.createElement('div');
  dialog.className = 'card max-w-md w-full p-6 fade-up dark:bg-warmth-100 dark:border-warmth-300';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  if (title) {
    const h = document.createElement('h2');
    h.className = 'heading-display text-2xl mb-3 text-warmth-900 dark:text-warmth-100';
    h.textContent = title;
    dialog.append(h);
  }
  if (content) {
    const body = document.createElement('div');
    if (content instanceof HTMLElement) body.append(content);
    else if (typeof content === 'string') body.innerHTML = content;
    else body.append(...content);
    body.className = 'text-warmth-700 dark:text-warmth-200 leading-relaxed';
    dialog.append(body);
  }
  if (actions && actions.length) {
    const row = document.createElement('div');
    row.className = 'mt-6 flex flex-wrap justify-end gap-2';
    for (const a of actions) row.append(a);
    dialog.append(row);
  }

  backdrop.append(dialog);
  if (dismissible) {
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) close();
    });
    document.addEventListener('keydown', escClose);
  }
  function escClose(ev) { if (ev.key === 'Escape') close(); }
  function close() {
    document.removeEventListener('keydown', escClose);
    backdrop.remove();
    if (typeof onClose === 'function') onClose();
  }
  return { element: backdrop, close };
}

export function Toast({ message, type = 'info' }) {
  const root = document.createElement('div');
  const palette = {
    info: 'bg-warmth-900 text-warmth-50 dark:bg-warmth-100 dark:text-warmth-900',
    success: 'bg-sage-500 text-warmth-50',
    error: 'bg-rose-500 text-warmth-50',
    warn: 'bg-honey-500 text-warmth-900',
  };
  root.className = `${palette[type] || palette.info} text-sm rounded-full px-4 py-2 shadow-md slide-in pointer-events-auto`;
  root.textContent = message;
  return root;
}

export function Spinner({ size = 24, label } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'inline-flex items-center gap-2 text-warmth-600 dark:text-warmth-300';
  const ring = document.createElement('span');
  ring.className = 'inline-block rounded-full border-2 border-warmth-200 border-t-warmth-900 dark:border-warmth-700 dark:border-t-warmth-100 animate-spin';
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
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
  const h = document.createElement('h3');
  h.className = 'heading-display text-xl mb-2 text-warmth-900 dark:text-warmth-100';
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'text-warmth-600 dark:text-warmth-300';
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
  const map = {
    camera: '📷', gallery: '🖼️', settings: '⚙️', heart: '♥', heartFilled: '❤️',
    switch: '🔄', flash: '⚡', download: '⬇', share: '↗', close: '✕',
    trash: '🗑', back: '←', add: '+', check: '✓', user: '👤',
    sparkle: '✨', link: '🔗', wifi: '📡', play: '▶', pause: '⏸',
  };
  el.textContent = map[name] || '•';
  return el;
}
