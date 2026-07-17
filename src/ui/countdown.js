function resolveDuration(value) {
  if (value === 0 || value === 'off') return 0;
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 3;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Operation cancelled.', 'AbortError');
}

function createOverlay(host) {
  const overlay = document.createElement('div');
  overlay.className = 'countdown-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
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

function wait(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', aborted, { once: true });
    function done() {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal.reason || new DOMException('Operation cancelled.', 'AbortError'));
    }
  });
}

async function tick(num, label, fast, signal) {
  num.textContent = label;
  num.classList.toggle('is-snap', label === 'SNAP!');
  if (!fast) {
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }
  await wait(fast ? 180 : 800, signal);
}

export function showFlash(host, { signal } = {}) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const f = document.createElement('div');
    f.className = 'flash-overlay';
    host.append(f);
    requestAnimationFrame(() => f.classList.add('active'));
    const timer = setTimeout(done, 360);
    signal?.addEventListener('abort', aborted, { once: true });
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      f.remove();
    }
    function done() {
      cleanup();
      resolve();
    }
    function aborted() {
      cleanup();
      reject(signal.reason || new DOMException('Operation cancelled.', 'AbortError'));
    }
  });
}

export async function startCountdown(host, {
  duration = 3,
  flashEnabled = true,
  onSnap,
  signal,
} = {}) {
  if (!host) throw new Error('Countdown host element is required.');
  const resolvedDuration = resolveDuration(duration);
  // 0 / 'off' means "instant capture" — skip overlay/UI entirely and
  // still honor the flash so the user gets visual feedback that a snap fired.
  if (resolvedDuration <= 0) {
    throwIfAborted(signal);
    const capture = Promise.resolve().then(() => {
      throwIfAborted(signal);
      return onSnap?.();
    });
    const flash = flashEnabled ? showFlash(host, { signal }).catch(() => {}) : Promise.resolve();
    await flash;
    return await capture;
  }
  const fast = prefersReducedMotion();
  const { overlay, num } = createOverlay(host);
  try {
    for (let i = resolvedDuration; i >= 1; i--) {
      await tick(num, String(i), fast, signal);
    }
    throwIfAborted(signal);
    num.textContent = 'SNAP!';
    num.classList.add('is-snap');
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
    const capture = Promise.resolve().then(() => {
      throwIfAborted(signal);
      return onSnap?.();
    });
    const flash = flashEnabled ? showFlash(host, { signal }) : Promise.resolve();
    await wait(fast ? 100 : 320, signal);
    overlay.remove();
    await flash;
    return await capture;
  } finally {
    overlay.remove();
  }
}
