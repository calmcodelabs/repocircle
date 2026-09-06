import { useEffect, useState } from 'preact/hooks';
import { Timestamp, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { activeMembers, myMembership } from '../data/activeGroup';
import { sessionUser } from '../auth/session';
import { canManageRepo } from '../data/repos';
import { canWriteRole, type Repo, type RepoInterest } from '../data/types';
import { doc, onSnapshot as onDoc } from 'firebase/firestore';
import { fetchReadme, socialPreviewUrl } from '../github/repos';
import { readmePreview } from '../util/readme';
import { CommentThread } from './CommentThread';
import { InterestButton } from './InterestButton';
import { REPO_NEEDS } from '../data/types';
import { sparkSeries } from '../poll/engine';
import { CollabSheet } from './CollabSheet';
import { watchRepoCollabs, type CollabRequest } from '../data/collabs';
import type { Idea } from '../data/types';
import { adoptRepo, markRepoOwnerLeft, watchInterests } from '../data/repos';
import { addWatch, isWatching, removeWatch } from '../data/watches';
import { myProfile } from '../data/users';
import { buildJourney } from '../util/journey';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { circleOwner, ownsRepo } from '../util/skills';
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
  const [interests, setInterests] = useState<RepoInterest[]>([]);
  const [repoCollabs, setRepoCollabs] = useState<CollabRequest[]>([]);
  const [watching, setWatching] = useState<boolean | null>(null);
  const [originIdea, setOriginIdea] = useState<Idea | null>(null);
  const [handOver, setHandOver] = useState(false);
  const uid = sessionUser.value?.uid;
  const me = myMembership.value;
  const iAmAdmin = me?.role === 'admin';
  const canWrite = canWriteRole(me);

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

  useEffect(() => watchInterests(gid, repoId, setInterests), [gid, repoId]);
  useEffect(() => watchRepoCollabs(gid, repoId, setRepoCollabs), [gid, repoId]);
  // The origin idea (M15): live like everything else on this page (Class E).
  const ideaId = repo && repo !== null ? repo.ideaId : undefined;
  useEffect(() => {
    if (!ideaId) {
      setOriginIdea(null);
      return;
    }
    return onDoc(
      doc(db(), `groups/${gid}/ideas/${ideaId}`),
      (snap) => setOriginIdea(snap.exists() ? ({ id: snap.id, ...snap.data() } as Idea) : null),
      () => setOriginIdea(null),
    );
  }, [gid, ideaId]);
  useEffect(() => {
    let alive = true;
    if (!uid) return;
    void isWatching(uid, gid, repoId).then((w) => alive && setWatching(w));
    return () => {
      alive = false;
    };
  }, [uid, gid, repoId]);

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

  async function toggleWatch() {
    if (!uid || !repo || watching === null) return;
    setWatching(!watching);
    try {
      if (watching) await removeWatch(uid, gid, repoId);
      else await addWatch(uid, gid, repo);
    } catch {
      setWatching(watching);
      toast('Could not save that — check your connection.', { error: true });
    }
  }

  const journey = repo
    ? buildJourney(
        repo,
        interests,
        repoCollabs,
        (events ?? [])
          .filter((e) => e.type === 'release')
          .map((e) => ({ occurredAt: e.occurredAt, summary: e.summary })),
        4,
        originIdea,
      )
    : [];
  const isMine = !!repo && !!me && ownsRepo(repo, me);

  // Class F: one spelling of ownership, uid-first (mirrors lie after adoption).
  const liveOwner = circleOwner(repo, activeMembers.value);
  const ownerMember = liveOwner;

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
          {repo.ideaByLogin && (
            <a href={repo.ideaId ? `#/g/${gid}/idea/${repo.ideaId}` : undefined}>
              <Chip tone="accent">from an idea by @{repo.ideaByLogin}</Chip>
            </a>
          )}
          {repo.ownerLeft && !liveOwner && (
            <Chip tone="warn">owner left the circle — up for adoption</Chip>
          )}
          {repo.adoptedByLogin && (
            <Chip tone="accent">
              taken over by @{repo.adoptedByLogin} · started by @{repo.adoptedFromLogin}
            </Chip>
          )}
          {!repo.ownerLeft && !repo.adoptedByLogin && repo.seekingOwner && (
            <Chip tone="warn">Looking for a new owner</Chip>
          )}
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
          {!isMine && uid && watching !== null && (
            <Pill variant={watching ? 'ghost' : undefined} onClick={() => void toggleWatch()}>
              {watching ? 'Watching' : 'Watch'}
            </Pill>
          )}
          {repo.seekingOwner && (isMine || iAmAdmin) && interests.length > 0 && (
            <Pill variant="primary" onClick={() => setHandOver(true)}>
              Hand it over
            </Pill>
          )}
          {!repo.seekingOwner && !liveOwner && iAmAdmin && (
            <Pill
              onClick={() =>
                void markRepoOwnerLeft(gid, repoId)
                  .then(() => toast('Flagged — anyone interested can now take it over'))
                  .catch(() => toast('Could not flag it.', { error: true }))
              }
            >
              Open for adoption
            </Pill>
          )}
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
      {handOver && repo && (
        <HandOverSheet
          gid={gid}
          repo={repo}
          interests={interests}
          onClose={() => setHandOver(false)}
        />
      )}

      <InterestButton gid={gid} repo={repo} />

      {journey.length > 1 && (
        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">The journey</span>
          </div>
          <div class="journey">
            {journey.map((m) => (
              <div key={`${m.kind}${m.text}${m.at?.toMillis() ?? 0}`} class="row journey__row">
                <span class={`dot ${m.kind === 'release' ? 'dot--accent' : ''}`} />
                <span class="small">{m.text}</span>
                <span class="topbar__spacer" />
                <span class="small faint">{m.at ? relTime(m.at) : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

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
          <EmptyState
            // Promising a ~15 minute arrival is false while the poller is erroring.
            line={
              repo.poll?.failing
                ? 'Nothing captured — GitHub polling is failing for this repo, so activity isn’t coming through.'
                : 'Nothing captured yet — activity appears within ~15 minutes of happening on GitHub.'
            }
          />
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

/**
 * M12 — adoption made real: ownership moves to someone who raised a hand. The
 * GitHub repo stays where it is (transfer there is GitHub's ceremony, not
 * ours); in-app ownership drives collab routing and management rights.
 */
function HandOverSheet({
  gid,
  repo,
  interests,
  onClose,
}: {
  gid: string;
  repo: Repo;
  interests: RepoInterest[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<RepoInterest | null>(null);
  const uid = sessionUser.value?.uid;
  const candidates = interests.filter(
    (i) => activeMembers.value?.some((m) => m.uid === i.uid) && i.uid !== uid,
  );

  async function confirm() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !picked) return;
    setBusy(true);
    try {
      await adoptRepo(gid, profile, repo, picked);
      toast(`@${picked.login} owns ${repo.fullName.split('/')[1]} here now`);
      onClose();
    } catch {
      toast('Handover failed — check your connection.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Hand over ${repo.fullName.split('/')[1]}`} onClose={onClose}>
      <div class="stack">
        <p class="small dim">
          They become the owner in this circle — collab requests route to them, and the card keeps
          crediting @{repo.adoptedFromLogin ?? repo.githubOwnerLogin} as the starter. On GitHub
          itself nothing changes.
        </p>
        {candidates.length === 0 && (
          <p class="small faint">Nobody who raised a hand is still in the circle.</p>
        )}
        {candidates.map((i) => (
          <button
            key={i.uid}
            class={`row member ${picked?.uid === i.uid ? 'member--picked' : ''}`}
            aria-pressed={picked?.uid === i.uid}
            onClick={() => setPicked(i)}
          >
            <Avatar src={i.avatarUrl} login={i.login} />
            <span class="mono">@{i.login}</span>
            {i.note && <span class="small faint">{i.note}</span>}
          </button>
        ))}
        <Pill variant="primary" busy={busy} disabled={!picked} onClick={() => void confirm()}>
          {picked ? `Hand it to @${picked.login}` : 'Pick someone'}
        </Pill>
      </div>
    </Sheet>
  );
}
