import { getState } from '../state.js';
import { Button, Icon } from './components.js';
import { navigate } from '../router.js';
import { renderThemePicker } from '../themes/theme-picker.js';

export async function renderHome(mount) {
  const state = getState();
  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-md md:max-w-2xl mx-auto px-6 pt-10 md:pt-14 pb-40 fade-in space-y-2 md:space-y-4';
  wrap.setAttribute('role', 'main');

  const greeting = document.createElement('p');
  greeting.className = 'text-warmth-500 dark:text-warmth-400 text-sm uppercase tracking-widest';
  const displayName = state.profile?.display_name || state.user?.user_metadata?.display_name;
  greeting.textContent = displayName ? `Hi, ${displayName}` : 'Welcome back';
  wrap.append(greeting);

  const title = document.createElement('h1');
  title.className = 'heading-display text-4xl mb-2 mt-1';
  title.textContent = 'our photobooth';
  title.tabIndex = -1;
  wrap.append(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'text-warmth-600 dark:text-warmth-300 mb-8';
  subtitle.textContent = 'Take photos together, even when you are apart.';
  wrap.append(subtitle);

  const card = document.createElement('div');
  card.className = 'grid grid-cols-1 gap-3';
  card.setAttribute('role', 'navigation');
  card.setAttribute('aria-label', 'Photobooth actions');
  const singleBtn = Button({ label: 'Single camera', variant: 'primary', icon: Icon({ name: 'camera' }) });
  singleBtn.classList.add('w-full', 'justify-start', 'text-left');
  singleBtn.addEventListener('click', () => navigate('single'));
  const dualBtn = Button({ label: 'Dual camera', variant: 'accent', icon: Icon({ name: 'sparkle' }) });
  dualBtn.classList.add('w-full', 'justify-start', 'text-left');
  dualBtn.addEventListener('click', () => navigate('dual'));
  const galleryBtn = Button({ label: 'Open gallery', variant: 'ghost', icon: Icon({ name: 'gallery' }) });
  galleryBtn.classList.add('w-full', 'justify-start', 'text-left');
  galleryBtn.addEventListener('click', () => navigate('gallery'));
  card.append(singleBtn, dualBtn, galleryBtn);
  wrap.append(card);

  const themeCard = document.createElement('div');
  themeCard.className = 'mt-8';
  wrap.append(themeCard);
  await renderThemePicker(themeCard);

  mount.append(wrap);
}
