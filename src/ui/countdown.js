import { getState } from '../state.js';

const NO_COUNTDOWN = Symbol('no-countdown');

function resolveDuration() {
  const pref = getState().preferences?.countdownDuration;
  if (pref === 0 || pref === 'off') return 0;
  if (typeof pref === 'number' && pref > 0) return pref;
  return 3;
}

function createOverlay(host) {
  const overlay = document.createElement('div');
  overlay.className = 'countdown-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  const num = document.createElement('span');
  num.className = 'countdown-number';
  overlay.append(num);
  host.append(overlay);
  return { overlay, num };
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick(num, label, fast) {
  num.textContent = label;
  num.classList.toggle('is-snap', label === 'SNAP!');
  if (!fast) {
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }
  await wait(fast ? 180 : 800);
}

export function showFlash(host) {
  return new Promise((resolve) => {
    const f = document.createElement('div');
    f.className = 'flash-overlay';
    host.append(f);
    requestAnimationFrame(() => f.classList.add('active'));
    setTimeout(() => {
      f.remove();
      resolve();
    }, 360);
  });
}

export async function startCountdown(host, {
  duration = resolveDuration(),
  flashEnabled = true,
  onSnap,
} = {}) {
  if (!host) throw new Error('Countdown host element is required.');
  const fast = prefersReducedMotion();
  const { overlay, num } = createOverlay(host);
  try {
    for (let i = duration; i >= 1; i--) {
      await tick(num, String(i), fast);
    }

    num.textContent = 'SNAP!';
    num.classList.add('is-snap');
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
    const capture = Promise.resolve().then(() => onSnap?.());
    const flash = flashEnabled ? showFlash(host) : Promise.resolve();
    await wait(fast ? 100 : 320);
    overlay.remove();
    await flash;
    return await capture;
  } catch (err) {
    try { overlay.remove(); } catch {}
    throw err;
  }
}

export { NO_COUNTDOWN };
