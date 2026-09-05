import { route } from '../router';
import { sessionUser } from '../auth/session';
import { ToastRegion } from '../ui/Toast';
import { SignIn } from './SignIn';
import { Home } from './Home';
import { Diag } from './Diag';
import { NotFound } from './NotFound';

function Splash() {
  return (
    <div class="app">
      <div class="topbar">
        <span class="skeleton splash__bar" />
      </div>
      <div class="stack">
        <span class="skeleton" />
        <span class="skeleton" />
        <span class="skeleton" />
      </div>
    </div>
  );
}

export function App() {
  const r = route.value;
  const u = sessionUser.value;

  let view;
  if (r.name === 'diag') view = <Diag />;
  else if (u === undefined) view = <Splash />;
  else if (u === null) view = <SignIn />;
  else if (r.name === 'notfound') view = <NotFound />;
  else view = <Home />; // root + group routes: M1 brings real group screens

  return (
    <>
      {view}
      <ToastRegion />
    </>
  );
}
