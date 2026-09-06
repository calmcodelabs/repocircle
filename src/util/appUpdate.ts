import { signal } from '@preact/signals';

/**
 * Class D (REVIEW.md): open tabs must find out that the app changed. True once
 * a new service worker has taken control of this tab — the running JS is now
 * older than the deployed app, and only a reload reconciles them.
 */
export const updateReady = signal(false);

export function watchForUpdates(reg: ServiceWorkerRegistration): void {
  // A controller change means a newer SW (skipWaiting + clients.claim) owns the
  // page. Ignore the very first claim on a fresh install — nothing is stale yet.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) updateReady.value = true;
    hadController = true;
  });

  // Long-lived tabs never navigate, so they never check by themselves.
  const check = () => void reg.update().catch(() => undefined);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, 30 * 60_000);
}
