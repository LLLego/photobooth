import { currentRouteName, navigate } from '../router.js';
import { Icon } from './components.js';

const ITEMS = [
  { name: 'home', label: 'Capture', icon: 'camera' },
  { name: 'gallery', label: 'Gallery', icon: 'gallery' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export function mountNavigation(root) {
  if (!root) return () => {};
  root.innerHTML = '';
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Primary navigation');
  const row = document.createElement('div');
  row.className = 'max-w-md mx-auto flex justify-around items-center';

  for (const item of ITEMS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex flex-col items-center gap-1 px-4 py-2 text-xs text-warmth-600 dark:text-warmth-400 transition hover:text-warmth-900 dark:hover:text-warmth-100';
    btn.setAttribute('data-route', item.name);
    btn.setAttribute('aria-label', item.label);
    const icon = Icon({ name: item.icon, size: 22 });
    const label = document.createElement('span');
    label.textContent = item.label;
    btn.append(icon, label);
    btn.addEventListener('click', () => navigate(item.name));
    row.append(btn);
  }
  nav.append(row);
  root.append(nav);

  const setActive = () => {
    const current = currentRouteName();
    for (const b of row.querySelectorAll('button')) {
      const isActive = b.getAttribute('data-route') === current;
      b.classList.toggle('text-warmth-900', isActive);
      b.classList.toggle('dark:text-warmth-100', isActive);
      b.classList.toggle('text-warmth-600', !isActive);
      b.classList.toggle('dark:text-warmth-400', !isActive);
      b.setAttribute('aria-current', isActive ? 'page' : 'false');
    }
  };
  setActive();
  window.addEventListener('hashchange', setActive);
  return () => {
    window.removeEventListener('hashchange', setActive);
    try { nav.remove(); } catch {}
    try { root.innerHTML = ''; } catch {}
  };
}
