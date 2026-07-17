import { signIn, signUp } from './auth.js';
import { pushToast } from '../state.js';
import { navigate } from '../router.js';

export async function renderAuthUI(mount) {
  mount.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'min-h-dvh flex items-center justify-center p-6';

  const card = document.createElement('div');
  card.className = 'card w-full max-w-md p-8 fade-up';

  const title = document.createElement('h1');
  title.className = 'heading-display text-3xl text-center mb-1';
  title.textContent = 'our photobooth';

  const subtitle = document.createElement('p');
  subtitle.className = 'text-warmth-600 text-center text-sm mb-6';
  subtitle.textContent = 'Take photos together, even when we are apart.';

  const tabs = document.createElement('div');
  tabs.className = 'flex bg-warmth-100 rounded-2xl p-1 mb-6';
  tabs.setAttribute('role', 'tablist');
  const tabLogin = makeTab('Login');
  const tabSignup = makeTab('Sign Up');
  tabLogin.setAttribute('role', 'tab');
  tabSignup.setAttribute('role', 'tab');
  tabs.append(tabLogin, tabSignup);

  const form = document.createElement('form');
  form.className = 'flex flex-col gap-4';
  form.noValidate = true;
  form.setAttribute('aria-label', 'Authentication');

  const nameWrap = document.createElement('label');
  nameWrap.className = 'flex flex-col gap-1';
  nameWrap.setAttribute('data-name-wrap', 'true');
  const nameLabel = document.createElement('span');
  nameLabel.className = 'text-xs uppercase tracking-widest text-warmth-500';
  nameLabel.textContent = 'Display name (optional)';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input';
  nameInput.placeholder = 'Your name';
  nameInput.autocomplete = 'name';
  nameInput.setAttribute('aria-label', 'Display name');
  nameWrap.append(nameLabel, nameInput);

  const emailWrap = document.createElement('label');
  emailWrap.className = 'flex flex-col gap-1';
  const emailLabel = document.createElement('span');
  emailLabel.className = 'text-xs uppercase tracking-widest text-warmth-500';
  emailLabel.textContent = 'Email';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.className = 'input';
  emailInput.placeholder = 'you@example.com';
  emailInput.required = true;
  emailInput.autocomplete = 'email';
  emailInput.setAttribute('aria-label', 'Email address');
  emailWrap.append(emailLabel, emailInput);

  const pwWrap = document.createElement('label');
  pwWrap.className = 'flex flex-col gap-1';
  const pwLabel = document.createElement('span');
  pwLabel.className = 'text-xs uppercase tracking-widest text-warmth-500';
  pwLabel.textContent = 'Password';
  const pwInput = document.createElement('input');
  pwInput.type = 'password';
  pwInput.className = 'input';
  pwInput.placeholder = 'At least 6 characters';
  pwInput.minLength = 6;
  pwInput.required = true;
  pwInput.autocomplete = 'current-password';
  pwInput.setAttribute('aria-label', 'Password');
  pwWrap.append(pwLabel, pwInput);

  const error = document.createElement('div');
  error.className = 'text-rose-500 text-sm hidden';
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn-primary mt-2';
  submit.textContent = 'Continue';

  form.append(nameWrap, emailWrap, pwWrap, error, submit);

  card.append(title, subtitle, tabs, form);
  wrap.append(card);
  mount.append(wrap);

  let mode = 'login';
  const setMode = (next) => {
    if (mode === next) return;
    mode = next;
    tabLogin.classList.toggle('bg-warmth-50', mode === 'login');
    tabLogin.classList.toggle('text-warmth-900', mode === 'login');
    tabLogin.classList.toggle('text-warmth-500', mode !== 'login');
    tabSignup.classList.toggle('bg-warmth-50', mode === 'signup');
    tabSignup.classList.toggle('text-warmth-900', mode === 'signup');
    tabSignup.classList.toggle('text-warmth-500', mode !== 'signup');
    tabLogin.setAttribute('aria-selected', mode === 'login');
    tabSignup.setAttribute('aria-selected', mode === 'signup');
    const hidden = mode !== 'signup';
    nameWrap.style.display = hidden ? 'none' : 'flex';
    if (hidden) {
      nameWrap.setAttribute('aria-hidden', 'true');
      nameWrap.setAttribute('hidden', '');
      nameWrap.setAttribute('inert', '');
      nameInput.setAttribute('tabindex', '-1');
      nameInput.setAttribute('aria-hidden', 'true');
    } else {
      nameWrap.removeAttribute('aria-hidden');
      nameWrap.removeAttribute('hidden');
      nameWrap.removeAttribute('inert');
      nameInput.removeAttribute('tabindex');
      nameInput.removeAttribute('aria-hidden');
    }
    submit.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    error.classList.add('hidden');
  };
  setMode('login');
  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  emailInput.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.classList.add('hidden');

    const email = emailInput.value.trim();
    const password = pwInput.value;

    if (!email) {
      showError('Please enter your email.', emailInput);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.', emailInput);
      return;
    }
    if (!password) {
      showError('Please enter your password.', pwInput);
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters.', pwInput);
      return;
    }

    submit.disabled = true;
    const previousText = submit.textContent;
    submit.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      submit.disabled = false;
      submit.textContent = previousText;
      showError('Taking longer than expected. Check your connection and try again.', emailInput);
    }, 20000);
    try {
      if (mode === 'signup') {
        await signUp({ email, password, displayName: nameInput.value });
        if (timedOut) return;
        clearTimeout(timeoutId);
        pushToast({ message: 'Account created. You are signed in.', type: 'success' });
        navigate('home', {}, { replace: true });
      } else {
        await signIn({ email, password });
        if (timedOut) return;
        clearTimeout(timeoutId);
        pushToast({ message: 'Welcome back.', type: 'success' });
        navigate('home', {}, { replace: true });
      }
    } catch (err) {
      if (timedOut) return;
      clearTimeout(timeoutId);
      const msg = err?.message || 'Authentication failed.';
      error.textContent = msg;
      error.classList.remove('hidden');
      emailInput.focus();
    } finally {
      if (!timedOut) {
        clearTimeout(timeoutId);
        submit.disabled = false;
        submit.textContent = previousText;
      }
    }
  });

  function showError(msg, focusEl) {
    error.textContent = msg;
    error.classList.remove('hidden');
    focusEl?.focus();
  }
}

function makeTab(label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'flex-1 py-2 rounded-xl text-sm font-medium text-warmth-500 transition hover:text-warmth-700';
  el.textContent = label;
  return el;
}
