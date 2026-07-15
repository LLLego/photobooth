import { getState } from '../state.js';
import { Button, Icon } from './components.js';
import { navigate } from '../router.js';

export async function renderHome(mount) {
  mount.textContent = 'HOME LOADED';  // diagnostic — remove after verify
  const state = getState();
  const displayName = state.profile?.display_name || state.user?.user_metadata?.display_name || 'you';
  const firstName = displayName.split(' ')[0];

  mount.innerHTML = '';
  mount.textContent = '⏳ loading...';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-md md:max-w-lg mx-auto px-6 pt-12 md:pt-16 pb-40';
  wrap.setAttribute('role', 'main');

  // === Greeting ===
  const greeting = document.createElement('div');
  greeting.className = 'mb-8 fade-up';
  greeting.style.animationDelay = '0ms';
  
  const hi = document.createElement('p');
  hi.className = 'text-warmth-500 dark:text-warmth-400 text-sm tracking-wide mb-1';
  hi.textContent = `Hey ${firstName} 👋`;
  
  const title = document.createElement('h1');
  title.className = 'heading-display text-5xl md:text-6xl leading-none tracking-tight';
  title.innerHTML = 'our<br>photobooth';
  
  const tagline = document.createElement('p');
  tagline.className = 'text-warmth-400 dark:text-warmth-500 text-sm mt-3 opacity-80';
  tagline.textContent = 'moments together, wherever you are';
  
  greeting.append(hi, title, tagline);
  wrap.append(greeting);

  // === Settings gear ===
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-warmth-400 hover:text-warmth-600 dark:text-warmth-500 dark:hover:text-warmth-200 transition';
  settingsBtn.append(Icon({ name: 'settings', size: 20 }));
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.addEventListener('click', () => navigate('settings'));
  
  const topWrap = document.createElement('div');
  topWrap.className = 'relative';
  topWrap.append(wrap, settingsBtn);
  mount.append(topWrap);

  // === Feature Cards ===
  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'space-y-3 mb-8';
  
  // Single Camera card
  const singleCard = createFeatureCard({
    icon: 'camera',
    title: 'Single camera',
    desc: 'Take 4 photos and create a beautiful photo strip with frames and filters.',
    variant: 'primary',
    delay: 100,
    onClick: () => navigate('single'),
  });
  
  // Dual Camera card
  const dualCard = createFeatureCard({
    icon: 'dual-camera',
    title: 'Dual camera',
    desc: 'Take photos together even when apart. Host a room and invite your partner.',
    variant: 'accent',
    delay: 200,
    onClick: () => navigate('dual'),
  });
  
  cardsWrap.append(singleCard, dualCard);
  wrap.append(cardsWrap);

  // === Gallery row ===
  const galleryRow = document.createElement('div');
  galleryRow.className = 'flex items-center gap-3 fade-up';
  galleryRow.style.animationDelay = '300ms';
  
  const galleryBtn = document.createElement('button');
  galleryBtn.className = 'flex-1 flex items-center gap-3 px-4 py-3 rounded-2xl border border-warmth-200 dark:border-warmth-300 hover:border-warmth-400 dark:hover:border-warmth-500 transition text-left';
  galleryBtn.addEventListener('click', () => navigate('gallery'));
  
  const galleryIcon = document.createElement('span');
  galleryIcon.className = 'w-10 h-10 rounded-xl bg-warmth-100 dark:bg-warmth-200 flex items-center justify-center shrink-0';
  galleryIcon.append(Icon({ name: 'gallery', size: 20 }));
  
  const galleryText = document.createElement('div');
  const galleryLabel = document.createElement('p');
  galleryLabel.className = 'text-sm font-medium text-warmth-900 dark:text-warmth-50';
  galleryLabel.textContent = 'Gallery';
  const gallerySub = document.createElement('p');
  gallerySub.className = 'text-xs text-warmth-500 dark:text-warmth-400';
  gallerySub.textContent = 'View your saved photo strips';
  galleryText.append(galleryLabel, gallerySub);
  
  galleryBtn.append(galleryIcon, galleryText);
  
  // Photo count badge
  const badge = document.createElement('span');
  badge.className = 'shrink-0 px-2.5 py-1 rounded-full bg-warmth-100 dark:bg-warmth-200 text-xs font-medium text-warmth-700 dark:text-warmth-200';
  badge.textContent = '0';
  galleryBtn.append(badge);
  
  async function updateGalleryBadge() {
    try {
      const { fetchStrips } = await import('../gallery/gallery.js');
      await fetchStrips({ limit: 1, reset: true });
      if (badge.isConnected) {
        badge.textContent = String(getState().gallery?.total ?? 0);
      }
    } catch {
      if (badge.isConnected) {
        badge.textContent = '—';
        badge.setAttribute('aria-label', 'Gallery count unavailable');
      }
    }
  }

  updateGalleryBadge();
  window.addEventListener('pageshow', updateGalleryBadge, { once: true });
  
  galleryRow.append(galleryBtn);
  wrap.append(galleryRow);

  // === Frame preview row ===
  const framePreview = document.createElement('div');
  framePreview.className = 'mt-8';
  framePreview.style.animationDelay = '400ms';
  framePreview.classList.add('fade-up');
  
  const frameLabel = document.createElement('p');
  frameLabel.className = 'text-xs uppercase tracking-widest text-warmth-400 dark:text-warmth-500 mb-3';
  frameLabel.textContent = 'Choose a frame';
  framePreview.append(frameLabel);
  
  // Quick frame picker — horizontal scroll of frames
  const frameScroller = document.createElement('div');
  frameScroller.className = 'flex gap-2 overflow-x-auto no-scrollbar pb-2';
  
  const themes = ['minimal', 'hundred-acre-gang', 'pucca', 'hello-kitty'];
  const themeColors = {
    'minimal': '#D4956A',
    'hundred-acre-gang': '#FFB400', 
    'pucca': '#E8443A',
    'hello-kitty': '#E891A0',
  };
  
  themes.forEach((slug) => {
    const chip = document.createElement('button');
    chip.className = 'shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-transparent hover:border-warmth-300 dark:hover:border-warmth-400 transition';
    chip.style.background = themeColors[slug];
    chip.style.opacity = '0.6';
    chip.title = slug.replace('-', ' ');
    chip.addEventListener('click', () => {
      // Select this theme and navigate to camera
      import('../state.js').then(({ set, getState: gs }) => {
        set({ preferences: { ...gs().preferences, themeId: slug } });
        navigate('single');
      });
    });
    frameScroller.append(chip);
  });
  
  framePreview.append(frameScroller);
  wrap.append(framePreview);
}

function createFeatureCard({ icon, title, desc, variant, delay, onClick }) {
  const card = document.createElement('button');
  card.className = 'w-full text-left p-5 rounded-2xl border-2 border-warmth-200 dark:border-warmth-300 hover:border-warmth-400 dark:hover:border-warmth-500 hover:shadow-lg transition-all duration-200 fade-up';
  card.style.animationDelay = `${delay}ms`;
  card.addEventListener('click', onClick);
  
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 mb-2';
  
  const iconWrap = document.createElement('span');
  iconWrap.className = `w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
    variant === 'primary' 
      ? 'bg-honey-500 dark:bg-honey-600 text-warmth-50' 
      : 'bg-rose-500 dark:bg-rose-600 text-warmth-50'
  }`;
  iconWrap.append(Icon({ name: icon, size: 22 }));
  
  const cardTitle = document.createElement('h3');
  cardTitle.className = 'heading-display text-lg';
  cardTitle.textContent = title;
  
  header.append(iconWrap, cardTitle);
  
  const cardDesc = document.createElement('p');
  cardDesc.className = 'text-sm text-warmth-500 dark:text-warmth-400';
  cardDesc.textContent = desc;
  
  const arrow = document.createElement('span');
  arrow.className = 'inline-block mt-3 text-warmth-400 dark:text-warmth-500 text-sm';
  arrow.textContent = '→ Get started';
  
  card.append(header, cardDesc, arrow);
  return card;
}
