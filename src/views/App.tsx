import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { myUserDoc } from '../data/users';
import { route, type Route } from '../router';
import { ProfileRecovery } from './ProfileRecovery';
import { ToastRegion } from '../ui/Toast';
import { lazyView } from '../util/lazy';
import { GroupHome } from './GroupHome';
import { GroupShell } from './GroupShell';
import { Join } from './Join';
import { Members } from './Members';
import { NotFound } from './NotFound';
import { Onboard } from './Onboard';
import { AskDetail } from './AskDetail';
import { PersonalHome } from './PersonalHome';
import { RepoDetail } from './RepoDetail';
import { Repos } from './Repos';
import { SignIn } from './SignIn';

const Diag = lazyView<Record<string, never>>(() => import('./Diag'), 'Diag');
const GroupSettings = lazyView<{ gid: string }>(() => import('./GroupSettings'), 'GroupSettings');

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

/**
 * True once `users/{me}` has been *confirmed* absent — not merely unread. The delay
 * keeps a fresh sign-in (whose profile write is still in flight) from flashing the
 * recovery screen.
 */
function useConfirmedMissingProfile(): boolean {
  const missing = sessionUser.value !== null && myUserDoc.value === null;
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!missing) {
      setConfirmed(false);
      return;
    }
    const t = setTimeout(() => setConfirmed(true), 2500);
    return () => clearTimeout(t);
  }, [missing]);
  return confirmed;
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
    case 'ask':
      return (
        <GroupShell gid={r.gid}>
          <AskDetail gid={r.gid} askId={r.askId} />
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
  const profileMissing = useConfirmedMissingProfile();

  let view;
  if (r.name === 'diag') view = <Diag />;
  else if (u === undefined) view = <Splash />;
  else if (u === null) view = <SignIn invited={r.name === 'join'} />;
  else if (profileMissing) view = <ProfileRecovery />;
  else if (r.name === 'root') view = <Root />;
  else if (r.name === 'new') view = <Onboard />;
  else if (r.name === 'join') view = <Join gid={r.gid} token={r.token} />;
  else if (r.name === 'notfound') view = <NotFound />;
  else view = groupView(r);

  return (
    <>
      {view}
      <ToastRegion />
    </>
  );
}
