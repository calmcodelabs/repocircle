import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { activeDenied, activeGroup, myMembership, setActiveGroup } from '../data/activeGroup';
import { forgetGroup } from '../data/groups';
import { myUserDoc } from '../data/users';
import { toast } from '../ui/Toast';
import { serverUnavailable } from '../util/log';
import { Pill } from '../ui/Pill';
import { AskComposer } from './AskComposer';
import { startPolling, stopPolling } from '../poll/engine';
import { navigate, route } from '../router';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';
import { Mark } from '../ui/Mark';

const NAV: Array<{ seg: string; label: string }> = [
  { seg: '', label: 'Home' },
  { seg: 'repos', label: 'Repos' },
  { seg: 'members', label: 'Members' },
  { seg: 'settings', label: 'Settings' },
];

/** Frame for all group-scoped routes: listeners, topbar, switcher, nav, gates. */
export function GroupShell({ gid, children }: { gid: string; children: ComponentChildren }) {
  const u = sessionUser.value;
  const [accountOpen, setAccountOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => setActiveGroup(gid), [gid]);
  useEffect(() => {
    startPolling(gid);
    return stopPolling;
  }, [gid]);

  useEffect(() => {
    const off = () =>
      toast('You’re offline — reads come from cache, writes sync later.', { error: true });
    const on = () => toast('Back online');
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, []);

  const g = activeGroup.value;
  const r = route.value;
  const activeSeg =
    r.name === 'repos'
      ? 'repos'
      : r.name === 'members'
        ? 'members'
        : r.name === 'settings'
          ? 'settings'
          : '';

  if (activeDenied.value) {
    const inMyList = myUserDoc.value?.groupIds.includes(gid) ?? false;
    async function forget() {
      const uid = u?.uid;
      if (uid) {
        try {
          await forgetGroup(uid, gid);
        } catch {
          // best-effort; navigating away is what matters
        }
      }
      toast('Removed from your groups');
      navigate('#/new');
    }
    return (
      <div class="app">
        <EmptyState
          line="This group isn’t available to you — it may have been removed, or you’re not a member."
          action={
            inMyList ? (
              <Pill onClick={() => void forget()}>Remove it from my groups</Pill>
            ) : (
              <a href="#/new">Go to your groups</a>
            )
          }
        />
      </div>
    );
  }

  return (
    <div class="app">
      <header class="topbar">
        <a href="#/" class="row topbar__brand" aria-label="Your circles">
          <Mark />
          <strong>RepoCircle</strong>
        </a>
        <span class="topbar__spacer" />
        {u && (
          <button
            class="row"
            onClick={() => setAccountOpen(!accountOpen)}
            aria-expanded={accountOpen}
            aria-label="Account menu"
          >
            <Avatar src={u.photoURL ?? undefined} login={u.displayName ?? 'me'} />
          </button>
        )}
      </header>

      {accountOpen && (
        <div class="card stack menu menu--right">
          <div class="row">
            <Avatar src={u?.photoURL ?? undefined} login={u?.displayName ?? 'me'} />
            <div class="small">
              <div>{myUserDoc.value?.login ?? u?.displayName}</div>
              <div class="faint">{myMembership.value ? `${myMembership.value.role} here` : ''}</div>
            </div>
          </div>
          <button class="menu__item menu__item--dim" onClick={() => navigate('#/')}>
            My home
          </button>
          <button class="menu__item menu__item--dim" onClick={() => navigate('#/diag')}>
            Diagnostics
          </button>
          <button class="menu__item menu__item--dim" onClick={() => void signOutApp()}>
            Sign out
          </button>
        </div>
      )}

      {serverUnavailable.value && (
        <div class="staleboard" role="status">
          {serverUnavailable.value}
        </div>
      )}

      <nav class="groupnav" aria-label="Group">
        {NAV.map((n) => (
          <a
            key={n.seg}
            class={`groupnav__link ${activeSeg === n.seg ? 'groupnav__link--active' : ''}`}
            href={`#/g/${gid}${n.seg ? `/${n.seg}` : ''}`}
          >
            {n.label}
          </a>
        ))}
      </nav>

      {activeSeg !== '' && g && (
        <a class="groupctx" href={`#/g/${gid}`}>
          {g.name}
        </a>
      )}

      {children}

      {myMembership.value && !['guest', 'alumnus'].includes(myMembership.value.role) && (
        <button class="fab" onClick={() => setAskOpen(true)} aria-label="Post an ask">
          + Ask
        </button>
      )}
      {askOpen && <AskComposer gid={gid} onClose={() => setAskOpen(false)} />}
    </div>
  );
}
