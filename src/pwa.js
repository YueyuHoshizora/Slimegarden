let installPrompt = null;
let registrationPromise = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
  });
}

export function canInstall() {
  return installPrompt !== null;
}

export async function promptInstall() {
  if (!installPrompt) return null;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  return prompt.userChoice;
}

export function isIosInstallHint() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = navigator.standalone === true
    || (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);
  return isIos && !isStandalone;
}

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('./sw.js').catch(() => null);
  }
  return registrationPromise;
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  registerServiceWorker();
}
