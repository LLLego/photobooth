import { currentRouteName, navigate } from '../router.js';
import { Icon } from './components.js';

const ITEMS = [
  { name: 'home', label: 'home', icon: 'home' },
  { name: 'single', label: 'capture', icon: 'camera' },
  { name: 'dual', label: 'together', icon: 'dual-camera' },
  { name: 'gallery', label: 'memories', icon: 'gallery' },
];

export function mountNavigation(root) {
  if (!root) return () => {};
  root.innerHTML = '';

  // Brand mark on the left.
  const mark = document.createElement('div');
  mark.className = 'nav-mark';
  mark.textContent = 'our photobooth';

  // Center nav links.
  const links = document.createElement('ul');
  links.className = 'nav-links';
  for (const item of ITEMS) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#/${item.name}`;
    a.textContent = item.label;
    a.dataset.route = item.name;
    a.setAttribute('aria-label', item.label);
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      navigate(item.name);
    });
    li.append(a);
    links.append(li);
  }

  // Settings gear on the right.
  const settings = document.createElement('button');
  settings.className = 'nav-settings';
  settings.type = 'button';
  settings.setAttribute('aria-label', 'settings');
  settings.append(Icon({ name: 'settings', size: 16 }));
  settings.addEventListener('click', () => navigate('settings'));

  root.append(mark, links, settings);

  const setActive = () => {
    const current = currentRouteName();
    for (const a of root.querySelectorAll('a[data-route]')) {
      const isActive = a.getAttribute('data-route') === current;
      a.setAttribute('aria-current', isActive ? 'page' : 'false');
    }
  };
  setActive();
  window.addEventListener('hashchange', setActive);
  return () => {
    window.removeEventListener('hashchange', setActive);
    try { root.innerHTML = ''; } catch {}
  };
}
