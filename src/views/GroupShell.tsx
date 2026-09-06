import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import {
  activeDenied,
  activeGroup,
  myMembership,
  retryActiveGroup,
  setActiveGroup,
} from '../data/activeGroup';
import { forgetGroup } from '../data/groups';
import { myUserDoc } from '../data/users';
import { toast } from '../ui/Toast';
import { serverUnavailable } from '../util/log';
import { canWriteRole } from '../data/types';
import { Pill } from '../ui/Pill';
import { AskComposer } from './AskComposer';
import { IdeaComposer } from './IdeaComposer';
import { AnnouncementComposer } from './AnnouncementComposer';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
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
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

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
            <div class="row wrap">
              <Pill variant="primary" onClick={() => retryActiveGroup()}>
                Try again
              </Pill>
              {inMyList ? (
                <Pill onClick={() => void forget()}>Remove it from my groups</Pill>
              ) : (
                <a href="#/new">Go to your groups</a>
              )}
            </div>
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

      {canWriteRole(myMembership.value) && (
        <button class="fab" onClick={() => setChooserOpen(true)} aria-label="Share something">
          + Share
        </button>
      )}
      {chooserOpen && (
        <Sheet title="What have you got?" onClose={() => setChooserOpen(false)}>
          <div class="stack">
            <button
              class="row share__opt"
              onClick={() => {
                setChooserOpen(false);
                setIdeaOpen(true);
              }}
            >
              <span class="tile tile--accent">
                <Icon name="repo" size={19} />
              </span>
              <span class="share__text">
                <b>An idea</b>
                <span class="small dim">
                  No repo yet — pitch it and see who'd build it with you.
                </span>
              </span>
            </button>
            <button
              class="row share__opt"
              onClick={() => {
                setChooserOpen(false);
                setAskOpen(true);
              }}
            >
              <span class="tile">
                <Icon name="ask" size={19} />
              </span>
              <span class="share__text">
                <b>An ask</b>
                <span class="small dim">You need a hand with something you're building.</span>
              </span>
            </button>
            {myMembership.value?.role === 'admin' && (
              <button
                class="row share__opt"
                onClick={() => {
                  setChooserOpen(false);
                  setAnnounceOpen(true);
                }}
              >
                <span class="tile">
                  <Icon name="users" size={19} />
                </span>
                <span class="share__text">
                  <b>An announcement</b>
                  <span class="small dim">
                    Something the whole circle needs to know. Admins only.
                  </span>
                </span>
              </button>
            )}
          </div>
        </Sheet>
      )}
      {askOpen && <AskComposer gid={gid} onClose={() => setAskOpen(false)} />}
      {ideaOpen && <IdeaComposer gid={gid} onClose={() => setIdeaOpen(false)} />}
      {announceOpen && <AnnouncementComposer gid={gid} onClose={() => setAnnounceOpen(false)} />}
    </div>
  );
}
