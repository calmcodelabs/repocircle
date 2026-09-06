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
import { watchForUpdates } from './util/appUpdate';
import { Maintenance } from './views/Maintenance';

// CSP violations otherwise surface as unrelated-looking SDK errors — name them.
window.addEventListener('securitypolicyviolation', (e) => {
  log('error', `CSP blocked ${e.violatedDirective}: ${e.blockedURI}`);
});

// Short-circuit before anything initialises: no auth listener, no Firestore
// connection, no reads. The app is genuinely inert while paused.
//
// The pause is about the people using the app, not about the person building
// or testing it — so any run wired to the local emulators walks straight past
// it. The guard keys on the emulator flag alone: `npm run dev` pointed at
// production still shows the pause screen, because that run would spend real
// read quota, which is the thing that caused the pause in the first place.
// A production build never sets the flag, so the pause is never skipped there.
const pausedHere = MAINTENANCE.on && import.meta.env.VITE_EMULATORS !== '1';

if (pausedHere) {
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
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(watchForUpdates)
      .catch(() => {
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
