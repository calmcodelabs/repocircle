import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import { initRouter } from './router';
import { initAuth } from './auth/session';
import { App } from './views/App';

initRouter();
initAuth();

render(<App />, document.getElementById('app')!);
