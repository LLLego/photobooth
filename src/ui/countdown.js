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
  const num = document.createElement('span');
  num.className = 'countdown-number';
  overlay.append(num);
  host.append(overlay);
  return { overlay, num };
}

function tick(num, label) {
  return new Promise((resolve) => {
    num.textContent = label;
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
    setTimeout(resolve, 900);
  });
}

function flash(host) {
  return new Promise((resolve) => {
    const f = document.createElement('div');
    f.className = 'flash-overlay';
    host.append(f);
    requestAnimationFrame(() => f.classList.add('active'));
    setTimeout(() => {
      f.remove();
      resolve();
    }, 280);
  });
}

export async function startCountdown(host, { duration = resolveDuration() } = {}) {
  if (!host) throw new Error('Countdown host element is required.');
  if (duration <= 0) {
    await flash(host);
    return;
  }
  const { overlay, num } = createOverlay(host);
  try {
    for (let i = duration; i >= 1; i--) {
      await tick(num, String(i));
    }
    overlay.remove();
    await flash(host);
  } catch (err) {
    overlay.remove();
    throw err;
  }
}

export { NO_COUNTDOWN };
