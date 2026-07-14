export async function registerSW() {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) {
    console.info('[sw] Service workers are not supported in this browser.');
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (registration.waiting && registration.active) {
      // already active
    }
    return registration;
  } catch (err) {
    console.warn('[sw] registration failed', err);
    return null;
  }
}
