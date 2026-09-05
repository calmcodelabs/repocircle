import { useEffect, useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { fetchMyGroups } from '../data/groups';
import { fetchMyRepos, type MyRepo } from '../data/repos';
import type { Group } from '../data/types';
import { myUserDoc } from '../data/users';
import { navigate } from '../router';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Mark } from '../ui/Mark';
import { langClass } from '../util/lang';
import { relTime } from '../util/time';

/**
 * Personal homepage (ADR-015): a launchpad, deliberately not a profile.
 * Your groups, the repos you own across them, and (M5) your open items.
 * No stats, no streaks — the PRD's anti-showcase principles still bind here.
 */
export function PersonalHome() {
  const u = sessionUser.value;
  const me = myUserDoc.value;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [repos, setRepos] = useState<MyRepo[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const groupIds = me?.groupIds ?? [];

  useEffect(() => {
    let alive = true;
    void fetchMyGroups(groupIds).then(async (gs) => {
      if (!alive) return;
      setGroups(gs);
      if (u) {
        const mine = await fetchMyRepos(gs, u.uid);
        if (alive) setRepos(mine);
      }
    });
    return () => {
      alive = false;
    };
    // groupIds identity changes on every snapshot; string-join keeps this stable
  }, [groupIds.join(','), u?.uid]);

  return (
    <div class="app">
      <header class="topbar">
        <Mark />
        <strong>RepoCircle</strong>
        <span class="topbar__spacer" />
        {u && (
          <button class="row" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Account menu">
            <Avatar src={u.photoURL ?? undefined} login={me?.login ?? 'me'} />
          </button>
        )}
      </header>

      {menuOpen && (
        <div class="card stack menu menu--right">
          <div class="row">
            <Avatar src={u?.photoURL ?? undefined} login={me?.login ?? 'me'} />
            <span class="small">{me?.login}</span>
          </div>
          <button class="menu__item menu__item--dim" onClick={() => navigate('#/diag')}>
            Diagnostics
          </button>
          <button class="menu__item menu__item--dim" onClick={() => void signOutApp()}>
            Sign out
          </button>
        </div>
      )}

      <main class="stack">
        <section class="stack">
          <div class="row">
            <div class="label">Your circles</div>
          </div>
          {groups === null && <span class="skeleton" />}
          <div class="phome__groups">
            {groups?.map((g) => (
              <a key={g.id} class="card phome__group" href={`#/g/${g.id}`}>
                <div class="row">
                  <strong>{g.name}</strong>
                </div>
                {g.description && <span class="small dim phome__desc">{g.description}</span>}
              </a>
            ))}
            <a class="card phome__group phome__group--new" href="#/new">
              <span class="dim">+ New group</span>
            </a>
          </div>
        </section>

        <section class="card stack">
          <div class="label">Your repos</div>
          {repos === null && <span class="skeleton" />}
          {repos?.length === 0 && (
            <EmptyState line="Repos you own show up here once they’re registered in a group." />
          )}
          {repos && repos.length > 0 && (
            <div class="home__repos">
              {repos.slice(0, 10).map((r) => (
                <a key={`${r.gid}:${r.id}`} class="home__repo" href={`#/g/${r.gid}/repos`}>
                  <span class="row">
                    <span class={`langdot ${langClass(r.language)}`} />
                    <span class="mono">{r.fullName.split('/')[1] ?? r.fullName}</span>
                    <Chip>{r.groupName}</Chip>
                  </span>
                  {r.lastEventAt && <span class="small faint">pushed {relTime(r.lastEventAt)}</span>}
                </a>
              ))}
            </div>
          )}
        </section>

        <section class="card">
          <div class="label">Your asks &amp; requests</div>
          <EmptyState line="Asks you post, claims you make and pending collab requests gather here — lands with M5." />
        </section>
      </main>
    </div>
  );
}
