import { sessionUser } from '../auth/session';
import { myUserDoc } from '../data/users';
import { route, type Route } from '../router';
import { ToastRegion } from '../ui/Toast';
import { Diag } from './Diag';
import { GroupHome } from './GroupHome';
import { GroupSettings } from './GroupSettings';
import { GroupShell } from './GroupShell';
import { Join } from './Join';
import { Members } from './Members';
import { NotFound } from './NotFound';
import { Onboard } from './Onboard';
import { PersonalHome } from './PersonalHome';
import { RepoDetail } from './RepoDetail';
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

/** Signed-in landing: personal homepage, or onboarding when you have no groups. */
function Root() {
  const u = myUserDoc.value;
  if (u === undefined) return <Splash />;
  if (u === null || u.groupIds.length === 0) return <Onboard />;
  return <PersonalHome />;
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
    case 'repodetail':
      return (
        <GroupShell gid={r.gid}>
          <RepoDetail gid={r.gid} repoId={r.repoId} />
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
  else if (r.name === 'root') view = <Root />;
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
