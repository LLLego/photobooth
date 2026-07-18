import { currentRouteName, navigate } from '../router.js';
import { Icon } from './components.js';

const ITEMS = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'single', label: 'Camera', icon: 'camera' },
  { name: 'dual', label: 'Together', icon: 'dual-camera' },
  { name: 'gallery', label: 'Gallery', icon: 'gallery' },
];

export function mountNavigation(root) {
  if (!root) return () => {};
  root.innerHTML = '';
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  const links = document.createElement('ul');
  links.className = 'nav-links';
  for (const item of ITEMS) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#/${item.name}`;
    a.dataset.route = item.name;
    a.setAttribute('aria-label', item.label);

    const icon = Icon({ name: item.icon, size: 22 });

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = item.label;

    a.append(icon, label);

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
  settings.setAttribute('aria-label', 'Settings');
  settings.append(Icon({ name: 'settings', size: 18 }));
  listen(settings, 'click', () => navigate('settings'));

  root.append(links, settings);

  const setActive = () => {
    const current = currentRouteName();
    for (const a of root.querySelectorAll('a[data-route]')) {
      const isActive = a.dataset.route === current;
      a.classList.toggle('nav-active', isActive);
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
