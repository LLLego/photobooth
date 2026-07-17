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
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  const mark = document.createElement('div');
  mark.className = 'nav-mark';
  mark.textContent = 'our photobooth';

  const links = document.createElement('ul');
  links.className = 'nav-links';
  for (const item of ITEMS) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#/${item.name}`;
    a.textContent = item.label;
    a.dataset.route = item.name;
    a.setAttribute('aria-label', item.label);
    const onClick = (ev) => {
      ev.preventDefault();
      navigate(item.name);
    };
    listen(a, 'click', onClick);
    li.append(a);
    links.append(li);
  }

  const settings = document.createElement('button');
  settings.className = 'nav-settings';
  settings.type = 'button';
  settings.setAttribute('aria-label', 'settings');
  settings.append(Icon({ name: 'settings', size: 16 }));
  listen(settings, 'click', () => navigate('settings'));

  root.append(mark, links, settings);

  const setActive = () => {
    const current = currentRouteName();
    for (const a of root.querySelectorAll('a[data-route]')) {
      const isActive = a.dataset.route === current;
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  };
  setActive();
  listen(window, 'hashchange', setActive);

  return () => {
    for (const dispose of cleanups.splice(0)) dispose();
    root.innerHTML = '';
  };
}
