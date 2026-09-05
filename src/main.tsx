import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import { initRouter } from './router';
import { initAuth } from './auth/session';
import { App } from './views/App';
import { log } from './util/log';

// CSP violations otherwise surface as unrelated-looking SDK errors — name them.
window.addEventListener('securitypolicyviolation', (e) => {
  log('error', `CSP blocked ${e.violatedDirective}: ${e.blockedURI}`);
});

initRouter();
initAuth();

render(<App />, document.getElementById('app')!);
