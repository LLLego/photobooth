import { getState, set } from '../state.js';
import { navigate } from '../router.js';
import { fetchStrips } from '../gallery/gallery.js';

export async function renderHome(mount) {
  const state = getState();
  const displayName = state.profile?.display_name || state.user?.user_metadata?.display_name || 'you';
  const firstName = displayName.split(' ')[0];

  mount.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'hero';
  wrap.setAttribute('role', 'main');

  // Eyebrow
  const eyebrow = document.createElement('div');
  eyebrow.className = 'hero-eyebrow fade-up';
  eyebrow.style.animationDelay = '0ms';
  eyebrow.textContent = 'every photo, a memory';

  // Hero title
  const title = document.createElement('h1');
  title.className = 'hero-title fade-up';
  title.style.animationDelay = '60ms';
  const our = document.createElement('span');
  our.className = 'our';
  our.textContent = 'our';
  const photobooth = document.createElement('span');
  photobooth.className = 'photobooth';
  photobooth.textContent = 'photobooth';
  title.append(our, photobooth);

  // Subtitle — build via DOM (no innerHTML) so user-controlled display_name
  // can't inject markup.
  const subtitle = document.createElement('p');
  subtitle.className = 'hero-subtitle fade-up';
  subtitle.style.animationDelay = '120ms';
  const heyName = document.createElement('span');
  heyName.textContent = `Hey ${firstName} — `;
  const underline = document.createElement('span');
  underline.className = 'underline';
  underline.textContent = 'moments together';
  subtitle.append(heyName, underline, document.createTextNode(', wherever you are'));

  wrap.append(eyebrow, title, subtitle);

  // === Feature Cards ===
  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'feature-grid';

  const singleCard = createFeatureCard({
    icon: 'camera',
    eyebrow: 'Solo · one of us',
    title: 'single <em>camera</em>',
    desc: 'Take 4 photos and create a beautiful photo strip with frames and filters.',
    visual: 'single',
    delay: 180,
    onClick: () => navigate('single'),
  });

  const dualCard = createFeatureCard({
    icon: 'dual-camera',
    eyebrow: 'Together · both of us',
    title: 'dual <em>camera</em>',
    desc: 'Take photos together even when apart. Host a room and invite your partner.',
    visual: 'dual',
    delay: 240,
    onClick: () => navigate('dual'),
  });

  cardsWrap.append(singleCard, dualCard);
  wrap.append(cardsWrap);

  // === Gallery peek ===
  const galleryRow = document.createElement('div');
  galleryRow.className = 'gallery-card fade-up';
  galleryRow.style.animationDelay = '320ms';

  const galleryTitle = document.createElement('div');
  galleryTitle.className = 'gallery-info';
  const galleryLabel = document.createElement('p');
  galleryLabel.className = 'gallery-info-title';
  galleryLabel.textContent = 'Our memories';
  const gallerySub = document.createElement('p');
  gallerySub.className = 'gallery-info-meta';
  gallerySub.textContent = 'Photo strips we have saved together';
  galleryTitle.append(galleryLabel, gallerySub);

  const galleryCta = document.createElement('button');
  galleryCta.className = 'gallery-cta';
  galleryCta.textContent = 'View gallery →';
  galleryCta.addEventListener('click', () => navigate('gallery'));

  const galleryFooter = document.createElement('div');
  galleryFooter.className = 'gallery-footer';
  galleryFooter.append(galleryTitle, galleryCta);
  galleryRow.append(galleryFooter);

  // Hero strip preview — four placeholder frames in a row.
  const strip = document.createElement('div');
  strip.className = 'gallery-strip';
  for (let i = 1; i <= 4; i++) {
    const item = document.createElement('div');
    item.className = 'gallery-strip-item';
    const img = document.createElement('div');
    img.className = `gallery-strip-img m${i}`;
    img.setAttribute('data-date', 'soon');
    item.append(img);
    strip.append(item);
  }
  galleryRow.insertBefore(strip, galleryFooter);

  wrap.append(galleryRow);

  // === Frame preview row ===
  const framePreview = document.createElement('div');
  framePreview.className = 'themes-section fade-up';
  framePreview.style.animationDelay = '400ms';

  const frameHeader = document.createElement('div');
  frameHeader.className = 'section-header';
  const frameHeadInner = document.createElement('div');
  const eyebrowFrame = document.createElement('span');
  eyebrowFrame.className = 'section-eyebrow';
  eyebrowFrame.textContent = 'choose a frame';
  const frameTitle = document.createElement('h2');
  frameTitle.className = 'section-title';
  frameTitle.append(
    document.createTextNode('pick your '),
    Object.assign(document.createElement('em'), { textContent: 'flavor' }),
  );
  frameHeadInner.append(eyebrowFrame, frameTitle);
  frameHeader.append(frameHeadInner);

  const frameMeta = document.createElement('div');
  frameMeta.className = 'section-meta';
  frameMeta.append(
    Object.assign(document.createElement('strong'), { textContent: '4' }),
    document.createTextNode('frames · tap to choose'),
  );
  frameHeader.append(frameMeta);

  framePreview.append(frameHeader);

  const themesGrid = document.createElement('div');
  themesGrid.className = 'themes-grid';

  const themes = [
    { slug: 'minimal', previewClass: 'minimal', name: 'Minimal', sub: 'clean & simple', tag: null },
    { slug: 'hundred-acre-gang', previewClass: 'acre', name: 'Hundred Acre', sub: 'cosy & sweet', tag: 'new' },
    { slug: 'pucca', previewClass: 'pucca', name: 'Pucca', sub: 'bold & playful', tag: null },
    { slug: 'hello-kitty', previewClass: 'kitty', name: 'Hello Kitty', sub: 'soft & lovely', tag: null },
  ];

  const selectedTheme = getState().preferences?.themeId || 'minimal';

  themes.forEach(({ slug, previewClass, name, sub, tag }) => {
    const isActive = slug === selectedTheme;
    const card = document.createElement('button');
    card.className = `theme-card${isActive ? ' active' : ''}`;
    card.type = 'button';
    card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    card.setAttribute('aria-label', `Choose ${name} frame`);
    card.dataset.themeSlug = slug;
    card.style.animationDelay = '0ms';

    const preview = document.createElement('div');
    preview.className = `theme-preview ${previewClass}`;
    preview.setAttribute('aria-hidden', 'true');

    const tagEl = document.createElement('span');
    tagEl.className = tag ? `theme-tag ${tag}` : 'theme-tag';
    tagEl.textContent = tag || name.toLowerCase();
    preview.append(tagEl);

    const info = document.createElement('div');
    info.className = 'theme-info';
    const themeName = document.createElement('div');
    themeName.className = 'theme-name';
    themeName.append(
      document.createTextNode(name),
      Object.assign(document.createElement('em'), { textContent: sub }),
    );
    const radio = document.createElement('span');
    radio.className = 'theme-radio';
    radio.setAttribute('aria-hidden', 'true');
    info.append(themeName, radio);

    card.append(preview, info);
    card.addEventListener('click', () => {
      set({ preferences: { ...getState().preferences, themeId: slug } });
      navigate('single');
    });
    themesGrid.append(card);
  });

  framePreview.append(themesGrid);
  wrap.append(framePreview);

  // === Footer mark ===
  const footer = document.createElement('div');
  footer.className = 'footer-mark fade-up';
  footer.textContent = 'made with love · for us';
  wrap.append(footer);

  mount.append(wrap);

  // Load gallery count after the route renders so we don't block first paint.
  let badgeStale = false;
  async function updateGalleryBadge() {
    try {
      // Don't reset the global gallery state — just peek at item count.
      // A previous mount may have already populated the cache; reusing it
      // avoids clobbering the user's gallery before they open it.
      const s = getState();
      if (s.gallery?.items?.length) {
        const meta = frameMeta.querySelector('strong');
        if (meta) meta.textContent = String(s.gallery.items.length);
        return;
      }
      await fetchStrips({ limit: 1, reset: true });
      if (badgeStale) return;
      const items = getState().gallery?.items || [];
      const meta = frameMeta.querySelector('strong');
      if (meta) meta.textContent = String(items.length);
    } catch {
      // Gallery count unavailable — leave the placeholder "4" in place.
    }
  }
  updateGalleryBadge();

  return () => {
    // Mark any in-flight badge fetch as stale so a late resolve on a
    // detached route doesn't corrupt future renders.
    badgeStale = true;
  };
}

function createFeatureCard({ icon, eyebrow, title, desc, visual, delay, onClick }) {
  const card = document.createElement('button');
  card.className = 'feature-card fade-up';
  card.style.animationDelay = `${delay}ms`;
  card.addEventListener('click', onClick);

  const tag = document.createElement('div');
  tag.className = 'feature-card-tag';
  const dot = document.createElement('span');
  dot.className = 'dot';
  tag.append(dot, document.createTextNode(eyebrow));

  const cardTitle = document.createElement('h3');
  cardTitle.className = 'feature-card-title';
  // Build title via DOM rather than innerHTML so callers can't accidentally
  // pass user-controlled markup here in the future.
  const titleMatch = /^(.*?)<em>(.*?)<\/em>(.*)$/s.exec(title || '');
  if (titleMatch) {
    cardTitle.append(
      document.createTextNode(titleMatch[1]),
      Object.assign(document.createElement('em'), { textContent: titleMatch[2] }),
      document.createTextNode(titleMatch[3]),
    );
  } else {
    cardTitle.textContent = title || '';
  }

  const cardDesc = document.createElement('p');
  cardDesc.className = 'feature-card-desc';
  cardDesc.textContent = desc;

  const visualEl = document.createElement('div');
  visualEl.className = 'feature-card-visual';
  if (visual === 'single') {
    visualEl.classList.add('single-visual');
    for (let i = 0; i < 3; i++) {
      const p = document.createElement('div');
      p.className = 'polaroid';
      const f = document.createElement('div');
      f.className = 'polaroid-frame';
      p.append(f);
      visualEl.append(p);
    }
  } else {
    visualEl.classList.add('dual-visual');
    for (let i = 0; i < 3; i++) {
      if (i === 1) {
        const bridge = document.createElement('div');
        bridge.className = 'heart-bridge';
        visualEl.append(bridge);
        continue;
      }
      const cam = document.createElement('div');
      cam.className = 'camera-mock';
      const lens = document.createElement('div');
      lens.className = 'lens';
      cam.append(lens);
      visualEl.append(cam);
    }
  }

  const cta = document.createElement('span');
  cta.className = 'feature-card-cta';
  cta.append(
    document.createTextNode('Get started '),
    Object.assign(document.createElement('span'), { className: 'arrow', textContent: '→' }),
  );

  card.append(tag, cardTitle, cardDesc, visualEl, cta);
  return card;
}
