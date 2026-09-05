import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import { initRouter } from './router';
import { ensureGitHubToken, initAuth } from './auth/session';
import { configureTokenProvider } from './github/client';
import { clearToken, getToken } from './auth/vault';
import { log } from './util/log';
import { App } from './views/App';
import { MAINTENANCE } from './maintenance';
import { Maintenance } from './views/Maintenance';

// CSP violations otherwise surface as unrelated-looking SDK errors — name them.
window.addEventListener('securitypolicyviolation', (e) => {
  log('error', `CSP blocked ${e.violatedDirective}: ${e.blockedURI}`);
});

// Short-circuit before anything initialises: no auth listener, no Firestore
// connection, no reads. The app is genuinely inert while paused.
if (MAINTENANCE.on) {
  render(<Maintenance />, document.getElementById('app')!);
} else {
  boot();
}

function boot(): void {
  configureTokenProvider({
    get: getToken,
    refresh: async () => {
      clearToken(); // the old token 401'd — drop it before re-acquiring
      return ensureGitHubToken();
    },
  });

  initRouter();
  initAuth();
  render(<App />, document.getElementById('app')!);
}

// PWA: service worker (prod only) + connectivity + install prompt capture.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      log('warn', 'service worker registration failed');
    });
  });
}

window.addEventListener('offline', () => log('warn', 'offline — changes will sync when back'));
window.addEventListener('online', () => log('info', 'back online'));

export let deferredInstall: Event | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});
