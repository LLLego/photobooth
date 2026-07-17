function resolveDuration(value) {
  if (value === 0 || value === 'off') return 0;
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 3;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Operation cancelled.', 'AbortError');
}

function createOverlay(host, { progressLabel, onCancel } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'countdown-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', progressLabel || 'Photo countdown');

  const content = document.createElement('div');
  content.className = 'countdown-content';

  const progress = document.createElement('p');
  progress.className = 'countdown-progress';
  progress.textContent = progressLabel || 'Get ready';

  const num = document.createElement('span');
  num.className = 'countdown-number';
  num.setAttribute('aria-live', 'assertive');
  num.setAttribute('aria-atomic', 'true');

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'countdown-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', onCancel);

  content.append(progress, num);
  if (onCancel) content.append(cancel);
  overlay.append(content);
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
    void f.offsetWidth;
    f.classList.add('active');
    const timer = setTimeout(done, 200);
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
  progressLabel,
  onCancel,
  onSnap,
  signal,
} = {}) {
  if (!host) throw new Error('Countdown host element is required.');
  const resolvedDuration = resolveDuration(duration);
  if (resolvedDuration <= 0) {
    throwIfAborted(signal);
    const capture = Promise.resolve().then(() => {
      throwIfAborted(signal);
      return onSnap?.();
    });
    if (flashEnabled) await showFlash(host, { signal });
    return await capture;
  }
  const fast = prefersReducedMotion();
  const countdownController = new AbortController();
  const abortCountdown = () => countdownController.abort(signal?.reason);
  signal?.addEventListener('abort', abortCountdown, { once: true });
  const cancel = () => {
    const reason = new DOMException('Countdown cancelled.', 'AbortError');
    countdownController.abort(reason);
    onCancel?.();
  };
  const { overlay, num } = createOverlay(host, { progressLabel, onCancel: cancel });
  try {
    for (let i = resolvedDuration; i >= 1; i--) {
      await tick(num, String(i), fast, countdownController.signal);
    }
    throwIfAborted(countdownController.signal);
    num.textContent = 'SNAP!';
    num.classList.add('is-snap');
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
    const capture = Promise.resolve().then(() => {
      throwIfAborted(countdownController.signal);
      return onSnap?.();
    });
    const flash = flashEnabled ? showFlash(host, { signal: countdownController.signal }) : Promise.resolve();
    await wait(fast ? 100 : 200, countdownController.signal);
    overlay.remove();
    await flash;
    return await capture;
  } finally {
    signal?.removeEventListener('abort', abortCountdown);
    overlay.remove();
  }
}
