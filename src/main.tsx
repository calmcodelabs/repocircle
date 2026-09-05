import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import { initRouter } from './router';
import { ensureGitHubToken, initAuth } from './auth/session';
import { configureTokenProvider } from './github/client';
import { clearToken, getToken } from './auth/vault';
import { App } from './views/App';
import { log } from './util/log';

// CSP violations otherwise surface as unrelated-looking SDK errors — name them.
window.addEventListener('securitypolicyviolation', (e) => {
  log('error', `CSP blocked ${e.violatedDirective}: ${e.blockedURI}`);
});

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
