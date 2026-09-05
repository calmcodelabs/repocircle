import { useEffect, useState } from 'preact/hooks';
import { Timestamp, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { activeMembers, myMembership } from '../data/activeGroup';
import { sessionUser } from '../auth/session';
import { canManageRepo } from '../data/repos';
import type { Repo } from '../data/types';
import { doc, onSnapshot as onDoc } from 'firebase/firestore';
import { sparkSeries } from '../poll/engine';
import { CollabSheet } from './CollabSheet';
import { Pill } from '../ui/Pill';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Spark } from '../ui/Spark';
import { langClass } from '../util/lang';
import { log } from '../util/log';
import { relTime } from '../util/time';

type FeedEvent = {
  id: string;
  type: string;
  actorLogin: string;
  actorAvatarUrl: string;
  summary: string;
  url: string;
  occurredAt: Timestamp;
};

const TYPE_ICON: Record<string, string> = {
  push: '⇡',
  pr_opened: '⎇',
  pr_merged: '⎇',
  pr_closed: '⎇',
  issue_opened: '◎',
  issue_closed: '◎',
  release: '⏏',
  branch_created: '⌥',
  fork: '⑂',
};

/** S7 detail — repo header + the last 30 normalized events. */
export function RepoDetail({ gid, repoId }: { gid: string; repoId: string }) {
  const [repo, setRepo] = useState<Repo | null | undefined>(undefined);
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);
  const uid = sessionUser.value?.uid;
  const me = myMembership.value;
  const iAmAdmin = me?.role === 'admin';
  const canWrite = !!me && me.role !== 'guest' && me.role !== 'alumnus';

  useEffect(
    () =>
      onDoc(
        doc(db(), `groups/${gid}/repos/${repoId}`),
        (snap) => setRepo(snap.exists() ? ({ id: snap.id, ...snap.data() } as Repo) : null),
        (e) => {
          log('warn', `repo watch: ${e.code}`);
          setRepo(null);
        },
      ),
    [gid, repoId],
  );

  useEffect(
    () =>
      onSnapshot(
        query(collection(db(), `groups/${gid}/repos/${repoId}/events`), orderBy('occurredAt', 'desc'), limit(30)),
        (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedEvent, 'id'>) }))),
        (e) => log('warn', `events watch: ${e.code}`),
      ),
    [gid, repoId],
  );

  if (repo === undefined) return <span class="skeleton" />;
  if (repo === null)
    return <EmptyState line="This repo isn’t registered here (anymore)." action={<a href={`#/g/${gid}/repos`}>All repos</a>} />;

  const contributorsHint = activeMembers.value?.filter((m) => m.login === repo.githubOwnerLogin);

  return (
    <main class="stack">
      <section class="card stack">
        <div class="row">
          <span class={`langdot ${langClass(repo.language)}`} />
          <h2 class="mono repodetail__name">{repo.fullName}</h2>
          <Chip tone={repo.status === 'building' ? 'accent' : repo.status === 'paused' ? 'warn' : 'default'}>
            {repo.status}
          </Chip>
          {repo.poll?.failing && <Chip tone="danger">poll failing</Chip>}
        </div>
        {repo.description && <p class="small dim">{repo.description}</p>}
        <div class="row small">
          <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer nofollow">
            GitHub ↗
          </a>
          {repo.demoUrl && (
            <a href={repo.demoUrl} target="_blank" rel="noopener noreferrer nofollow">
              demo ↗
            </a>
          )}
          <span class="topbar__spacer" />
          <Spark series={sparkSeries(repo.daily)} width={140} height={30} />
        </div>
        <div class="row small faint">
          <Avatar login={repo.githubOwnerLogin} src={`https://avatars.githubusercontent.com/${repo.githubOwnerLogin}`} />
          <span class="mono">@{repo.githubOwnerLogin}</span>
          {contributorsHint && contributorsHint.length > 0 && <Chip tone="accent">in this circle</Chip>}
          <span class="topbar__spacer" />
          {canManageRepo(repo, uid, iAmAdmin) ? (
            <a class="small" href={`#/g/${gid}/repos`}>
              manage in Repos →
            </a>
          ) : (
            canWrite && (
              <Pill onClick={() => setCollabOpen(true)}>Request to collaborate</Pill>
            )
          )}
        </div>
      </section>

      {collabOpen && repo && <CollabSheet gid={gid} repo={repo} onClose={() => setCollabOpen(false)} />}

      <section class="card stack rise-2">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">Recent activity</span>
          {events && events.length > 0 && <span class="sectionhead__count">{events.length}</span>}
        </div>
        {events === null && <span class="skeleton" />}
        {events?.length === 0 && (
          <EmptyState line="Nothing captured yet — activity appears within ~15 minutes of happening on GitHub." />
        )}
        {events?.map((ev) => (
          <a key={ev.id} class="row event" href={ev.url} target="_blank" rel="noopener noreferrer nofollow">
            <span class="tile tile--sm" aria-hidden="true">
              {TYPE_ICON[ev.type] ?? '·'}
            </span>
            <Avatar login={ev.actorLogin} src={ev.actorAvatarUrl} />
            <span class="event__summary">{ev.summary}</span>
            <span class="topbar__spacer" />
            <span class="small faint">{relTime(ev.occurredAt)}</span>
          </a>
        ))}
      </section>
    </main>
  );
}
