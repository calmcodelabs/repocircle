import { useEffect } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { lastGid } from '../data/activeGroup';
import { myUserDoc } from '../data/users';
import { navigate, route, type Route } from '../router';
import { ToastRegion } from '../ui/Toast';
import { Diag } from './Diag';
import { GroupHome } from './GroupHome';
import { GroupSettings } from './GroupSettings';
import { GroupShell } from './GroupShell';
import { Join } from './Join';
import { Members } from './Members';
import { NotFound } from './NotFound';
import { Onboard } from './Onboard';
import { Repos } from './Repos';
import { SignIn } from './SignIn';

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

/** Signed-in landing: route to your group, or onboarding when you have none. */
function RootRedirect() {
  const u = myUserDoc.value;
  useEffect(() => {
    if (!u) return;
    if (u.groupIds.length > 0) {
      const last = lastGid();
      const gid = last && u.groupIds.includes(last) ? last : u.groupIds[0];
      navigate(`#/g/${gid}`);
    }
  }, [u]);
  if (u === undefined) return <Splash />;
  if (u === null || u.groupIds.length === 0) return <Onboard />;
  return <Splash />;
}

function groupView(r: Route) {
  switch (r.name) {
    case 'home':
      return (
        <GroupShell gid={r.gid}>
          <GroupHome gid={r.gid} />
        </GroupShell>
      );
    case 'repos':
      return (
        <GroupShell gid={r.gid}>
          <Repos gid={r.gid} />
        </GroupShell>
      );
    case 'members':
      return (
        <GroupShell gid={r.gid}>
          <Members gid={r.gid} />
        </GroupShell>
      );
    case 'settings':
      return (
        <GroupShell gid={r.gid}>
          <GroupSettings gid={r.gid} />
        </GroupShell>
      );
    default:
      return <NotFound />;
  }
}

export function App() {
  const r = route.value;
  const u = sessionUser.value;

  let view;
  if (r.name === 'diag') view = <Diag />;
  else if (u === undefined) view = <Splash />;
  else if (u === null) view = <SignIn invited={r.name === 'join'} />;
  else if (r.name === 'root') view = <RootRedirect />;
  else if (r.name === 'new') view = <Onboard />;
  else if (r.name === 'join') view = <Join gid={r.gid} token={r.token} />;
  else if (r.name === 'notfound') view = <NotFound />;
  else if (r.name === 'ask') view = <NotFound />; // M5
  else view = groupView(r);

  return (
    <>
      {view}
      <ToastRegion />
    </>
  );
}
