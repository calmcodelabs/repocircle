import { useEffect, useState } from 'preact/hooks';
import { Timestamp, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { activeMembers, myMembership } from '../data/activeGroup';
import { sessionUser } from '../auth/session';
import { canManageRepo } from '../data/repos';
import type { Repo } from '../data/types';
import { doc, onSnapshot as onDoc } from 'firebase/firestore';
import { fetchReadme, socialPreviewUrl } from '../github/repos';
import { readmePreview } from '../util/readme';
import { CommentThread } from './CommentThread';
import { InterestButton } from './InterestButton';
import { REPO_NEEDS } from '../data/types';
import { sparkSeries } from '../poll/engine';
import { CollabSheet } from './CollabSheet';
import { Pill } from '../ui/Pill';
import { Icon, type IconName } from '../ui/Icon';
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

const TYPE_ICON: Record<string, IconName> = {
  push: 'commit',
  pr_opened: 'pull-request',
  pr_merged: 'pull-request',
  pr_closed: 'pull-request',
  issue_opened: 'issue',
  issue_closed: 'issue',
  release: 'release',
  branch_created: 'branch',
  fork: 'fork',
};

/** S7 detail — repo header + the last 30 normalized events. */
export function RepoDetail({ gid, repoId }: { gid: string; repoId: string }) {
  const [repo, setRepo] = useState<Repo | null | undefined>(undefined);
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);
  const [readme, setReadme] = useState<string | null | undefined>(undefined);
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
        query(
          collection(db(), `groups/${gid}/repos/${repoId}/events`),
          orderBy('occurredAt', 'desc'),
          limit(30),
        ),
        (snap) =>
          setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedEvent, 'id'>) }))),
        (e) => log('warn', `events watch: ${e.code}`),
      ),
    [gid, repoId],
  );

  useEffect(() => {
    if (!repo?.fullName) return;
    let alive = true;
    void fetchReadme(repo.fullName).then((md) => {
      if (alive) setReadme(md ? readmePreview(md) : null);
    });
    return () => {
      alive = false;
    };
  }, [repo?.fullName]);

  if (repo === undefined) return <span class="skeleton" />;
  if (repo === null)
    return (
      <EmptyState
        line="This repo isn’t registered here (anymore)."
        action={<a href={`#/g/${gid}/repos`}>All repos</a>}
      />
    );

  const ownerMember = activeMembers.value?.find(
    (m) => m.login.toLowerCase() === repo.githubOwnerLogin.toLowerCase(),
  );

  return (
    <main class="stack">
      <section class="card stack">
        <div class="row">
          <span class={`langdot ${langClass(repo.language)}`} />
          <h2 class="mono repodetail__name">{repo.fullName}</h2>
          <Chip
            tone={
              repo.status === 'building' ? 'accent' : repo.status === 'paused' ? 'warn' : 'default'
            }
          >
            {repo.status}
          </Chip>
          {repo.poll?.failing && <Chip tone="danger">poll failing</Chip>}
        </div>
        {repo.pitch && <p class="lead">{repo.pitch}</p>}
        {repo.description && <p class="small dim">{repo.description}</p>}
        <div class="row wrap">
          {repo.needs && (
            <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === repo.needs)?.label}</Chip>
          )}
          {repo.seekingOwner && <Chip tone="warn">Looking for a new owner</Chip>}
          {(repo.domainTags ?? []).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
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
          <span class="row repodetail__spark">
            <Spark series={sparkSeries(repo.daily, 14)} width={140} height={30} />
            <span class="small faint">last 14 days</span>
          </span>
        </div>
        <div class="row small faint">
          {ownerMember ? (
            <a class="row member__link" href={`#/g/${gid}/m/${ownerMember.uid}`}>
              <Avatar
                login={repo.githubOwnerLogin}
                src={`https://avatars.githubusercontent.com/${repo.githubOwnerLogin}`}
              />
              <span class="mono">@{repo.githubOwnerLogin}</span>
              <Chip tone="accent">in this circle</Chip>
            </a>
          ) : (
            <>
              <Avatar
                login={repo.githubOwnerLogin}
                src={`https://avatars.githubusercontent.com/${repo.githubOwnerLogin}`}
              />
              <span class="mono">@{repo.githubOwnerLogin}</span>
            </>
          )}
          <span class="topbar__spacer" />
          {canManageRepo(repo, uid, iAmAdmin) ? (
            <a class="small" href={`#/g/${gid}/repos`}>
              manage in Repos →
            </a>
          ) : (
            canWrite && <Pill onClick={() => setCollabOpen(true)}>Request to collaborate</Pill>
          )}
        </div>
      </section>

      <CommentThread
        gid={gid}
        subject={{ kind: 'repo', id: repoId }}
        canModerate={canManageRepo(repo, uid, iAmAdmin)}
        title="What people think"
      />

      {collabOpen && repo && (
        <CollabSheet gid={gid} repo={repo} onClose={() => setCollabOpen(false)} />
      )}

      <InterestButton gid={gid} repo={repo} />

      <section class="card stack rise-2">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">What it looks like</span>
        </div>
        <img class="repodetail__shot" src={socialPreviewUrl(repo.fullName)} alt="" loading="lazy" />
        {readme === undefined && <span class="skeleton" />}
        {readme === null && (
          <EmptyState
            icon="repo"
            line="No README yet — a few lines there help people judge the idea."
          />
        )}
        {readme && <p class="readme">{readme}</p>}
        <a
          class="small"
          href={`${repo.htmlUrl}#readme`}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          Read the full README on GitHub ↗
        </a>
      </section>

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
          <a
            key={ev.id}
            class="row event"
            href={ev.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <span class="tile tile--sm" aria-hidden="true">
              <Icon name={TYPE_ICON[ev.type] ?? 'commit'} size={14} />
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
