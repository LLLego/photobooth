export async function registerSW() {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) {
    console.info('[sw] Service workers are not supported in this browser.');
    return null;
  }
  try {
    // BASE_URL ends with a slash (e.g. '/photobooth/'). The SW script must be
    // resolved relative to it so the URL is '<base>/sw.js', and the scope must
    // be the base directory — service workers can never claim a scope above
    // their own script path, so use the dirname of the script URL as scope.
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
    const serviceWorkerUrl = new URL('sw.js', baseUrl);
    const scriptPath = serviceWorkerUrl.pathname;
    const scopePath = scriptPath.substring(0, scriptPath.lastIndexOf('/') + 1);
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: scopePath,
    });
    return registration;
  } catch (err) {
    console.warn('[sw] registration failed', err);
    return null;
  }
}
