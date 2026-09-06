import { useEffect, useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { fetchMyOpenItems, type MyAsk } from '../data/asks';
import { fetchMyGroupsDetailed, forgetGroup } from '../data/groups';
import { fetchMyRepos, type MyRepo } from '../data/repos';
import type { Group } from '../data/types';
import { markSeen, myProfile, myUserDoc, setCirclePref, type CirclePref } from '../data/users';
import { fetchInbox } from '../data/inbox';
import { addComment } from '../data/comments';
import { applyLocalWatermark, type InboxItem } from '../util/inboxItems';
import { addWatch, fetchSaved, removeWatch, type SavedItem } from '../data/watches';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
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
/**
 * M18 — dismissal lives on the device. Triage state is ephemeral, the server
 * watermark already supersedes it within the hour, and a cross-device array on
 * users/{uid} would mean a write on every glance at a document every session
 * already touches.
 */
const dismissKey = (uid: string) => `rc.inboxDismissed.${uid}`;

/**
 * One row of the away-inbox. Slack's finding, and the reason this stopped being
 * a read-only digest: "recall is finding the message you half-remembered;
 * triage is processing everything that happened while you were gone" — and
 * triage needs somewhere to act, not just somewhere to look.
 */
function InboxRow({
  item,
  uid,
  line,
  onDismiss,
}: {
  item: InboxItem;
  uid: string;
  line: string;
  onDismiss: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const canReply = (item.kind === 'reply' || item.kind === 'mention') && item.subject !== 'session';
  const savable = item.subject !== 'session' ? item.subject : null;

  async function send() {
    const profile = myProfile(uid);
    // A session is a moment, not a thread — there is nothing to reply into.
    if (!profile || !body.trim() || item.subject === 'session') return;
    setBusy(true);
    try {
      await addComment(item.gid, { kind: item.subject, id: item.subjectId }, profile, {
        body: body.trim(),
        parentId: null,
        // A quick reply from the inbox is plain text; the thread itself is
        // where mentions and repo refs get resolved against the roster.
        mentions: [],
        repoRefs: [],
        replyToUid: item.actorUid !== uid ? item.actorUid : null,
      });
      toast('Replied');
      setReplying(false);
      setBody('');
      onDismiss();
    } catch {
      toast('Could not send that.', { error: true });
    }
    setBusy(false);
  }

  return (
    <div class="stack inboxrow">
      <a class="recent" href={item.href}>
        <span class="row small faint">
          {item.isNew && <span class="dot dot--accent" aria-label="new" />}
          <Avatar login={item.actorLogin} src={item.actorAvatarUrl} />
          <b>@{item.actorLogin}</b>
          <span>{line}</span>
          <span>{relTime(item.at)}</span>
        </span>
        {item.body && (
          <span class="recent__body">
            <CommentBody body={item.body} />
          </span>
        )}
      </a>
      <div class="row inboxrow__acts">
        {canReply && (
          <Pill variant="ghost" onClick={() => setReplying(!replying)}>
            Reply
          </Pill>
        )}
        {savable && (
          <Pill
            variant="ghost"
            onClick={() =>
              void addWatch(uid, item.gid, {
                kind: savable,
                id: item.subjectId,
                title: item.body?.slice(0, 80) || `${savable} from @${item.actorLogin}`,
              })
                .then(() => toast('Saved for later'))
                .catch(() => toast('Could not save that.', { error: true }))
            }
          >
            Save
          </Pill>
        )}
        <span class="topbar__spacer" />
        <Pill variant="ghost" ariaLabel="Dismiss" onClick={onDismiss}>
          Dismiss
        </Pill>
      </div>
      {replying && (
        <div class="stack">
          <textarea
            class="input"
            rows={2}
            maxLength={1000}
            placeholder={`Reply to @${item.actorLogin}…`}
            value={body}
            onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          />
          <div class="row">
            <span class="topbar__spacer" />
            <Pill variant="primary" busy={busy} onClick={() => void send()}>
              Send
            </Pill>
          </div>
        </div>
      )}
    </div>
  );
}

const PREFS: Array<{ key: CirclePref; label: string }> = [
  { key: 'all', label: 'all' },
  { key: 'mentions', label: 'mentions' },
  { key: 'mute', label: 'mute' },
];

export function PersonalHome() {
  const u = sessionUser.value;
  const me = myUserDoc.value;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [repos, setRepos] = useState<MyRepo[] | null>(null);
  const [openItems, setOpenItems] = useState<MyAsk[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [saved, setSaved] = useState<SavedItem[] | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
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
    void fetchInbox(me.groupIds, u.uid, me.login, me.lastSeenAt, me.circlePrefs ?? {}).then(
      (items) => {
        if (!alive) return;
        setInbox(applyLocalWatermark(items, localSeen));
        markSeen(u.uid);
        try {
          localStorage.setItem(seenKey, String(Date.now()));
        } catch {
          /* storage unavailable */
        }
      },
    );
    void fetchSaved(u.uid, me.groupIds).then((s) => alive && setSaved(s));
    return () => {
      alive = false;
    };
  }, [u?.uid, me?.login, groupIds.join(',')]);

  useEffect(() => {
    if (!u) return;
    try {
      setDismissed(JSON.parse(localStorage.getItem(dismissKey(u.uid)) ?? '[]') as string[]);
    } catch {
      setDismissed([]);
    }
  }, [u?.uid]);

  function dismiss(key: string) {
    if (!u) return;
    const next = [key, ...dismissed.filter((k) => k !== key)].slice(0, 100);
    setDismissed(next);
    try {
      localStorage.setItem(dismissKey(u.uid), JSON.stringify(next));
    } catch {
      /* best-effort: it will simply reappear next visit */
    }
  }

  const visibleInbox = (inbox ?? []).filter((i) => !dismissed.includes(i.key));

  const kindLine = (i: InboxItem): string =>
    i.kind === 'reply'
      ? 'replied to you'
      : i.kind === 'mention'
        ? 'mentioned you'
        : i.subject === 'idea'
          ? 'would build your idea'
          : i.subject === 'session'
            ? 'is coming to your session'
            : 'raised a hand for your repo';

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

        {visibleInbox.length > 0 && (
          <section class="card stack rise-2">
            <div class="sectionhead">
              <span class="sectionhead__mark" />
              <span class="sectionhead__title">While you were away</span>
              {visibleInbox.some((i) => i.isNew) && (
                <span class="sectionhead__count">
                  {visibleInbox.filter((i) => i.isNew).length} new
                </span>
              )}
            </div>
            {visibleInbox.map((item) => (
              <InboxRow
                key={item.key}
                item={item}
                uid={u!.uid}
                line={kindLine(item)}
                onDismiss={() => dismiss(item.key)}
              />
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
              <div key={g.id} class="card phome__group">
                <a class="stack phome__grouplink" href={`#/g/${g.id}`}>
                  <div class="row">
                    <span class="tile tile--accent">{(g.name[0] ?? '•').toUpperCase()}</span>
                    <strong>{g.name}</strong>
                  </div>
                  {g.description && <span class="small dim phome__desc">{g.description}</span>}
                </a>
                {/* Exactly three levels, and muting skips the circle's inbox
                    queries entirely rather than fetching and hiding them. */}
                <div class="row wrap phome__prefs">
                  {PREFS.map((p) => {
                    const cur = me?.circlePrefs?.[g.id] ?? 'all';
                    return (
                      <button
                        key={p.key}
                        class={`chip ${cur === p.key ? 'chip--accent' : ''}`}
                        aria-pressed={cur === p.key}
                        onClick={() =>
                          u &&
                          void setCirclePref(u.uid, g.id, p.key).catch(() =>
                            toast('Could not save that preference.', { error: true }),
                          )
                        }
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
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

        {saved !== null && saved.length > 0 && (
          <section class="card stack rise-2">
            <div class="sectionhead">
              <span class="sectionhead__mark" />
              <span class="sectionhead__title">Saved for later</span>
              <span class="sectionhead__count">{saved.length}</span>
            </div>
            {saved.map(({ watch, live }) =>
              live ? (
                <div key={watch.id} class="row home__repo phome__watch">
                  <a class="row phome__watchlink" href={live.href}>
                    <Chip>{watch.kind}</Chip>
                    <span class={watch.kind === 'repo' ? 'mono' : ''}>{live.title}</span>
                  </a>
                  <span class="topbar__spacer" />
                  <button
                    class="chip"
                    aria-label={`Remove ${live.title} from saved`}
                    onClick={() =>
                      u &&
                      void removeWatch(u.uid, watch.gid, watch.kind, watch.itemId).then(() =>
                        setSaved((xs) => (xs ?? []).filter((x) => x.watch.id !== watch.id)),
                      )
                    }
                  >
                    saved ×
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
