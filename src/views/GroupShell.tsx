import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { activeDenied, activeGroup, myMembership, setActiveGroup } from '../data/activeGroup';
import { fetchMyGroups, forgetGroup } from '../data/groups';
import { myUserDoc } from '../data/users';
import { toast } from '../ui/Toast';
import { Pill } from '../ui/Pill';
import type { Group } from '../data/types';
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
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [myGroups, setMyGroups] = useState<Group[] | null>(null);

  useEffect(() => setActiveGroup(gid), [gid]);

  useEffect(() => {
    if (!switcherOpen) return;
    let alive = true;
    void fetchMyGroups(myUserDoc.value?.groupIds ?? []).then((gs) => {
      if (alive) setMyGroups(gs);
    });
    return () => {
      alive = false;
    };
  }, [switcherOpen]);

  const g = activeGroup.value;
  const r = route.value;
  const activeSeg =
    r.name === 'repos' ? 'repos' : r.name === 'members' ? 'members' : r.name === 'settings' ? 'settings' : '';

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
        <Mark />
        <button
          class="switcher"
          onClick={() => {
            setSwitcherOpen(!switcherOpen);
            setAccountOpen(false);
          }}
          aria-expanded={switcherOpen}
        >
          <strong>{g?.name ?? '…'}</strong>
          <span class="dim switcher__chev">⌄</span>
        </button>
        <span class="topbar__spacer" />
        {u && (
          <button
            class="row"
            onClick={() => {
              setAccountOpen(!accountOpen);
              setSwitcherOpen(false);
            }}
            aria-expanded={accountOpen}
            aria-label="Account menu"
          >
            <Avatar src={u.photoURL ?? undefined} login={u.displayName ?? 'me'} />
          </button>
        )}
      </header>

      {switcherOpen && (
        <div class="card stack menu menu--left">
          {myGroups === null && <span class="skeleton" />}
          {myGroups?.map((mg) => (
            <button
              key={mg.id}
              class={`menu__item ${mg.id === gid ? 'menu__item--active' : ''}`}
              onClick={() => {
                setSwitcherOpen(false);
                navigate(`#/g/${mg.id}`);
              }}
            >
              {mg.name}
            </button>
          ))}
          <button
            class="menu__item menu__item--dim"
            onClick={() => {
              setSwitcherOpen(false);
              navigate('#/new');
            }}
          >
            + New group
          </button>
        </div>
      )}

      {accountOpen && (
        <div class="card stack menu menu--right">
          <div class="row">
            <Avatar src={u?.photoURL ?? undefined} login={u?.displayName ?? 'me'} />
            <div class="small">
              <div>{myUserDoc.value?.login ?? u?.displayName}</div>
              <div class="faint">{myMembership.value ? `${myMembership.value.role} here` : ''}</div>
            </div>
          </div>
          <button class="menu__item menu__item--dim" onClick={() => navigate('#/diag')}>
            Diagnostics
          </button>
          <button class="menu__item menu__item--dim" onClick={() => void signOutApp()}>
            Sign out
          </button>
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

      {children}
    </div>
  );
}
