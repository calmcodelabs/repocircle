import { useEffect, useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { fetchMyOpenItems, type MyAsk } from '../data/asks';
import { fetchMyGroupsDetailed, forgetGroup } from '../data/groups';
import { fetchMyRepos, type MyRepo } from '../data/repos';
import type { Group } from '../data/types';
import { markSeen, myUserDoc } from '../data/users';
import { fetchInbox } from '../data/inbox';
import { applyLocalWatermark, type InboxItem } from '../util/inboxItems';
import { fetchWatchedRepos, removeWatch, type WatchedRepo } from '../data/watches';
import { CommentBody } from './CommentBody';
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
  const [openItems, setOpenItems] = useState<MyAsk[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [watched, setWatched] = useState<WatchedRepo[] | null>(null);
  const [unreachable, setUnreachable] = useState<string[]>([]);

  const groupIds = me?.groupIds ?? [];

  useEffect(() => {
    let alive = true;
    void fetchMyGroupsDetailed(groupIds).then(async ({ groups: gs, unreachable: dead }) => {
      if (!alive) return;
      setGroups(gs);
      setUnreachable(dead);
      if (u) {
        const [mine, items] = await Promise.all([
          fetchMyRepos(gs, u.uid),
          fetchMyOpenItems(gs, u.uid),
        ]);
        if (alive) {
          setRepos(mine);
          setOpenItems(items);
        }
      }
    });
    return () => {
      alive = false;
    };
    // groupIds identity changes on every snapshot; string-join keeps this stable
  }, [groupIds.join(','), u?.uid]);

  // The away-inbox and watched repos are visit-time digests, not live wires:
  // one getDocs sweep on arrival, then the watermark advances (throttled).
  useEffect(() => {
    if (!u || !me) return;
    let alive = true;
    const seenKey = `rc.seenLocal.${u.uid}`;
    let localSeen = 0;
    try {
      localSeen = Number(localStorage.getItem(seenKey) ?? 0);
    } catch {
      /* storage unavailable */
    }
    void fetchInbox(me.groupIds, u.uid, me.login, me.lastSeenAt).then((items) => {
      if (!alive) return;
      setInbox(applyLocalWatermark(items, localSeen));
      markSeen(u.uid);
      try {
        localStorage.setItem(seenKey, String(Date.now()));
      } catch {
        /* storage unavailable */
      }
    });
    void fetchWatchedRepos(u.uid, me.groupIds).then((w) => alive && setWatched(w));
    return () => {
      alive = false;
    };
  }, [u?.uid, me?.login, groupIds.join(',')]);

  const KIND_LINE: Record<InboxItem['kind'], string> = {
    reply: 'replied to you',
    mention: 'mentioned you',
    interest: 'raised a hand for your repo',
  };

  return (
    <div class="app">
      <header class="topbar">
        <Mark />
        <strong>RepoCircle</strong>
        <span class="topbar__spacer" />
        {u && (
          <button
            class="row"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
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
        <section class="home__head rise">
          <h2>
            Your <span class="tint">space</span>.
          </h2>
          <p class="lead">Circles, repos and open loops — everything yours, in one place.</p>
        </section>

        {inbox !== null && inbox.length > 0 && (
          <section class="card stack rise-2">
            <div class="sectionhead">
              <span class="sectionhead__mark" />
              <span class="sectionhead__title">While you were away</span>
              {inbox.some((i) => i.isNew) && (
                <span class="sectionhead__count">{inbox.filter((i) => i.isNew).length} new</span>
              )}
            </div>
            {inbox.map((item) => (
              <a key={item.key} class="recent" href={item.href}>
                <span class="row small faint">
                  {item.isNew && <span class="dot dot--accent" aria-label="new" />}
                  <Avatar login={item.actorLogin} src={item.actorAvatarUrl} />
                  <b>@{item.actorLogin}</b>
                  <span>{KIND_LINE[item.kind]}</span>
                  <span>{relTime(item.at)}</span>
                </span>
                {item.body && (
                  <span class="recent__body">
                    <CommentBody body={item.body} />
                  </span>
                )}
              </a>
            ))}
          </section>
        )}

        <section class="stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Your circles</span>
            {groups && groups.length > 0 && <span class="sectionhead__count">{groups.length}</span>}
          </div>
          {groups === null && <span class="skeleton" />}
          <div class="phome__groups">
            {groups?.map((g) => (
              <a key={g.id} class="card phome__group" href={`#/g/${g.id}`}>
                <div class="row">
                  <span class="tile tile--accent">{(g.name[0] ?? '•').toUpperCase()}</span>
                  <strong>{g.name}</strong>
                </div>
                {g.description && <span class="small dim phome__desc">{g.description}</span>}
              </a>
            ))}
            {unreachable.map((gid) => (
              <div key={gid} class="card phome__group phome__group--dead">
                <span class="small dim">
                  A circle here can’t be opened — you may have been removed, or it was deleted.
                </span>
                <button
                  class="chip"
                  onClick={() =>
                    u &&
                    void forgetGroup(u.uid, gid).then(() =>
                      setUnreachable((xs) => xs.filter((x) => x !== gid)),
                    )
                  }
                >
                  Remove from my list
                </button>
              </div>
            ))}
            <a class="card phome__group phome__group--new" href="#/new">
              <span class="dim">+ New group</span>
            </a>
          </div>
        </section>

        {watched !== null && watched.length > 0 && (
          <section class="card stack rise-2">
            <div class="sectionhead">
              <span class="sectionhead__mark" />
              <span class="sectionhead__title">Repos you watch</span>
              <span class="sectionhead__count">{watched.length}</span>
            </div>
            {watched.map(({ watch, repo }) =>
              repo ? (
                <div key={watch.id} class="row home__repo phome__watch">
                  <a class="row phome__watchlink" href={`#/g/${watch.gid}/repo/${repo.id}`}>
                    <span class={`langdot ${langClass(repo.language)}`} />
                    <span class="mono">{repo.fullName}</span>
                    {repo.lastEventAt && (
                      <span class="small faint">{relTime(repo.lastEventAt)}</span>
                    )}
                  </a>
                  <span class="topbar__spacer" />
                  <button
                    class="chip"
                    aria-label={`Unwatch ${repo.fullName}`}
                    onClick={() =>
                      u &&
                      void removeWatch(u.uid, watch.gid, watch.repoId).then(() =>
                        setWatched((w) => (w ?? []).filter((x) => x.watch.id !== watch.id)),
                      )
                    }
                  >
                    watching ×
                  </button>
                </div>
              ) : null,
            )}
          </section>
        )}

        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Your repos</span>
            {repos && repos.length > 0 && <span class="sectionhead__count">{repos.length}</span>}
          </div>
          {repos === null && <span class="skeleton" />}
          {repos?.length === 0 && (
            <EmptyState
              icon="repo"
              line="Repos you own show up here once they’re registered in a group."
            />
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
                  <span class="small faint home__time home__time--wide">
                    {r.lastEventAt ? `pushed ${relTime(r.lastEventAt)}` : ''}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section class="card stack rise-3">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Your open loops</span>
            {openItems && openItems.length > 0 && (
              <span class="sectionhead__count">{openItems.length}</span>
            )}
          </div>
          {openItems === null && <span class="skeleton" />}
          {openItems?.length === 0 && (
            <EmptyState
              icon="check"
              line="Nothing open — asks you post and claims you make appear here across all your circles."
            />
          )}
          {openItems?.map((a) => (
            <a key={`${a.gid}:${a.id}`} class="row home__repo" href={`#/g/${a.gid}/ask/${a.id}`}>
              <span class="row">
                <span class={`dot ${a.kind === 'stuck' ? 'dot--warn' : 'dot--accent'}`} />
                <span class="small">
                  {a.authorUid === u?.uid ? 'you asked' : 'you claimed'}: {a.title}
                </span>
                <Chip>{a.groupName}</Chip>
              </span>
              <Chip tone={a.state === 'claimed' ? 'default' : 'warn'}>{a.state}</Chip>
            </a>
          ))}
        </section>
      </main>
    </div>
  );
}
