import { signOut, updateProfile, fetchProfile } from '../auth/auth.js';
import { getState, set, pushToast } from '../state.js';
import { navigate } from '../router.js';
import { Button, Icon } from './components.js';
import { storageGet, storageSet } from '../utils/storage.js';
import { reloadGallery } from '../gallery/gallery.js';

const PREF_KEYS = {
  autoDownload: 'auto-download',
  darkMode: 'dark-mode',
  countdownDuration: 'countdown-duration',
  theme: 'theme-preference',
  layout: 'layout-preference',
};

function applyDarkMode(enabled) {
  document.documentElement.classList.toggle('dark', Boolean(enabled));
}

function syncPrefsToUI() {
  const prefs = getState().preferences;
  applyDarkMode(prefs.darkMode);
}

export async function renderSettings(mount) {
  const user = getState().user;
  const profile = getState().profile;
  mount.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'max-w-md md:max-w-2xl mx-auto px-6 pt-8 pb-36 fade-in';

  const topBar = document.createElement('div');
  topBar.className = 'flex items-center justify-between mb-4';
  const back = Button({ label: 'Home', variant: 'ghost', onClick: () => navigate('home'), icon: Icon({ name: 'back' }) });
  topBar.append(back);
  wrap.append(topBar);

  const h = document.createElement('h1');
  h.className = 'heading-display text-3xl mb-6';
  h.textContent = 'Settings';

  const nameCard = document.createElement('section');
  nameCard.className = 'card p-5 mb-5 md:mb-0';
  nameCard.setAttribute('aria-labelledby', 'settings-name-heading');
  nameCard.innerHTML = `
    <h2 id="settings-name-heading" class="heading-display text-lg mb-3">Profile</h2>
    <div class="block">
      <label class="block" for="settings-display-name">
        <span class="text-xs uppercase tracking-widest text-warmth-500">Display name</span>
      </label>
      <input id="settings-display-name" class="input mt-2" type="text" data-field="displayName" maxlength="48" autocomplete="name" dir="auto" />
    </div>
    <p class="text-xs text-warmth-500 mt-3" dir="auto">Role: <span class="font-mono" data-field="role">…</span></p>
    <p class="text-xs text-warmth-500 mt-1" dir="auto">Email: <span class="font-mono" data-field="email">…</span></p>
  `;
  const nameInput = nameCard.querySelector('[data-field="displayName"]');
  const roleEl = nameCard.querySelector('[data-field="role"]');
  const emailEl = nameCard.querySelector('[data-field="email"]');
  nameInput.value = profile?.display_name || user?.user_metadata?.display_name || '';
  roleEl.textContent = profile?.role || '…';
  emailEl.textContent = user?.email || '—';

  const nameActions = document.createElement('div');
  nameActions.className = 'mt-4 flex justify-end';
  const saveBtn = Button({ label: 'Save name', variant: 'primary' });
  saveBtn.setAttribute('aria-label', 'Save display name');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const labelSpan = saveBtn.querySelector('span');
    const originalLabel = labelSpan?.textContent;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      saveBtn.disabled = false;
      if (labelSpan && originalLabel != null) labelSpan.textContent = originalLabel;
      pushToast({ message: 'Save timed out. Check your connection and try again.', type: 'error' });
    }, 15000);
    try {
      if (labelSpan) labelSpan.textContent = 'Saving…';
      const updated = await updateProfile(user.id, { display_name: nameInput.value.trim() });
      if (timedOut) return;
      clearTimeout(timeoutId);
      set({ profile: updated ? { ...profile, ...updated } : { ...profile, display_name: nameInput.value.trim() } });
      set({ preferences: { ...getState().preferences, displayName: nameInput.value.trim() } });
      pushToast({ message: 'Display name saved.', type: 'success' });
    } catch (err) {
      if (timedOut) return;
      clearTimeout(timeoutId);
      pushToast({ message: err.message || 'Could not save name.', type: 'error' });
    } finally {
      if (!timedOut) {
        clearTimeout(timeoutId);
        saveBtn.disabled = false;
        if (labelSpan && originalLabel != null) labelSpan.textContent = originalLabel;
      }
    }
  });
  nameActions.append(saveBtn);
  nameCard.append(nameActions);

  const prefsCard = document.createElement('section');
  prefsCard.className = 'card p-5 mb-5 md:mb-0';
  prefsCard.setAttribute('aria-labelledby', 'settings-prefs-heading');
  prefsCard.innerHTML = `
    <h2 id="settings-prefs-heading" class="heading-display text-lg mb-3">Capture preferences</h2>
    <div class="flex items-center justify-between py-2">
      <div>
        <p class="font-medium" id="settings-auto-label">Auto-download after capture</p>
        <p class="text-xs text-warmth-500">Save a local copy automatically.</p>
      </div>
      <label class="inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" data-pref="autoDownload" role="switch" aria-labelledby="settings-auto-label" />
        <span class="toggle-track w-11 h-6 bg-warmth-200 rounded-full peer-checked:bg-warmth-900 relative transition" aria-hidden="true">
          <span class="toggle-knob absolute top-0.5 left-0.5 w-5 h-5 bg-warmth-50 rounded-full transition peer-checked:translate-x-5"></span>
        </span>
      </label>
    </div>
    <div class="flex items-center justify-between py-2">
      <div>
        <p class="font-medium" id="settings-dark-label">Dark mode</p>
        <p class="text-xs text-warmth-500">Easier on the eyes at night.</p>
      </div>
      <label class="inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" data-pref="darkMode" role="switch" aria-labelledby="settings-dark-label" />
        <span class="toggle-track w-11 h-6 bg-warmth-200 rounded-full peer-checked:bg-warmth-900 relative transition" aria-hidden="true">
          <span class="toggle-knob absolute top-0.5 left-0.5 w-5 h-5 bg-warmth-50 rounded-full transition peer-checked:translate-x-5"></span>
        </span>
      </label>
    </div>
    <fieldset class="py-2 border-0 p-0 m-0">
      <legend class="font-medium mb-1">Countdown duration</legend>
      <p class="text-xs text-warmth-500 mb-2">Time between capture and shutter.</p>
      <div class="grid gap-2" data-pref-group="countdownDuration" role="radiogroup" aria-label="Countdown duration" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
        ${[3, 5, 0].map((v) => `<button class="px-3 py-2 rounded-2xl text-sm border border-warmth-200" role="radio" data-value="${v}" aria-checked="false" aria-label="${v === 0 ? 'No countdown' : `${v} second countdown`}">${v === 0 ? 'Off' : `${v}s`}</button>`).join('')}
      </div>
    </fieldset>
  `;

  const autoDownloadToggle = prefsCard.querySelector('[data-pref="autoDownload"]');
  const darkModeToggle = prefsCard.querySelector('[data-pref="darkMode"]');
  const countdownGroup = prefsCard.querySelector('[data-pref-group="countdownDuration"]');

  const refreshPrefUI = () => {
    const prefs = getState().preferences;
    autoDownloadToggle.checked = !!prefs.autoDownload;
    autoDownloadToggle.setAttribute('aria-checked', autoDownloadToggle.checked ? 'true' : 'false');
    darkModeToggle.checked = !!prefs.darkMode;
    darkModeToggle.setAttribute('aria-checked', darkModeToggle.checked ? 'true' : 'false');
    const target = Number(prefs.countdownDuration);
    countdownGroup.querySelectorAll('button').forEach((b) => {
      b.classList.remove(
        'bg-warmth-900',
        'text-warmth-50',
        'border-warmth-900',
        'border-warmth-200'
      );
      const isActive = Number(b.dataset.value) === target;
      if (isActive) {
        b.classList.add(
          'bg-warmth-900',
          'text-warmth-50',
          'border-warmth-900'
        );
      } else {
        b.classList.add(
          'border-warmth-200'
        );
      }
      b.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  };
  refreshPrefUI();

  autoDownloadToggle.addEventListener('change', () => {
    set({ preferences: { ...getState().preferences, autoDownload: autoDownloadToggle.checked } });
    storageSet(PREF_KEYS.autoDownload, autoDownloadToggle.checked);
  });
  darkModeToggle.addEventListener('change', () => {
    set({ preferences: { ...getState().preferences, darkMode: darkModeToggle.checked } });
    storageSet(PREF_KEYS.darkMode, darkModeToggle.checked);
    applyDarkMode(darkModeToggle.checked);
  });
  countdownGroup.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const v = Number(b.dataset.value);
      set({ preferences: { ...getState().preferences, countdownDuration: v } });
      storageSet(PREF_KEYS.countdownDuration, v);
      refreshPrefUI();
    });
  });

  const accountCard = document.createElement('section');
  accountCard.className = 'card p-5 mb-5 md:mb-0';
  accountCard.setAttribute('aria-labelledby', 'settings-account-heading');
  const accountHeading = document.createElement('h2');
  accountHeading.id = 'settings-account-heading';
  accountHeading.className = 'heading-display text-lg mb-3';
  accountHeading.textContent = 'Account';
  accountCard.append(accountHeading);
  const refreshBtn = Button({ label: 'Refresh profile', variant: 'ghost' });
  refreshBtn.setAttribute('aria-label', 'Refresh profile from server');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    const original = refreshBtn.querySelector('span')?.textContent;
    const labelSpan = refreshBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = 'Refreshing…';
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      refreshBtn.disabled = false;
      if (labelSpan && original) labelSpan.textContent = original;
      pushToast({ message: 'Refresh timed out. Check your connection and try again.', type: 'error' });
    }, 15000);
    try {
      const fresh = await fetchProfile(user.id);
      if (timedOut) return;
      clearTimeout(timeoutId);
      if (fresh) set({ profile: fresh });
      pushToast({ message: 'Profile refreshed.', type: 'success' });
    } catch (err) {
      if (timedOut) return;
      clearTimeout(timeoutId);
      pushToast({ message: err.message, type: 'error' });
    } finally {
      if (!timedOut) {
        clearTimeout(timeoutId);
        refreshBtn.disabled = false;
        if (labelSpan && original) labelSpan.textContent = original;
      }
    }
  });
  const reloadGalleryBtn = Button({ label: 'Reload gallery', variant: 'ghost' });
  reloadGalleryBtn.setAttribute('aria-label', 'Reload gallery photos');
  reloadGalleryBtn.addEventListener('click', async () => {
    reloadGalleryBtn.disabled = true;
    try { await reloadGallery({ reset: true }); pushToast({ message: 'Gallery refreshed.', type: 'success' }); }
    catch (err) { pushToast({ message: err.message, type: 'error' }); }
    finally { reloadGalleryBtn.disabled = false; }
  });
  const accountRow = document.createElement('div');
  accountRow.className = 'flex flex-wrap gap-2';
  accountRow.append(refreshBtn, reloadGalleryBtn);
  accountCard.append(accountRow);

  const signOutBtn = Button({ label: 'Sign out', variant: 'danger' });
  signOutBtn.classList.add('w-full');
  signOutBtn.setAttribute('aria-label', 'Sign out of your account');
  signOutBtn.addEventListener('click', async () => {
    signOutBtn.disabled = true;
    try {
      // Clear local profile/user state BEFORE awaiting signOut so a concurrent
      // SIGNED_OUT event from Supabase can't race the navigation.
      set({ profile: null });
      await signOut();
      set({ user: null });
      navigate('login', {}, { replace: true });
    } catch (err) {
      pushToast({ message: err.message, type: 'error' });
      signOutBtn.disabled = false;
    }
  });

  wrap.append(h);
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'md:grid md:grid-cols-2 md:gap-5';
  cardsGrid.append(nameCard, prefsCard, accountCard);
  wrap.append(cardsGrid, signOutBtn);
  mount.append(wrap);

  syncPrefsToUI();
  return () => { /* no persistent listeners */ };
}
