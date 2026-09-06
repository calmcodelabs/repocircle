import { useEffect, useMemo, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { activeGroup, activeSummary, myMembership } from '../data/activeGroup';
import {
  UNBLOCKED_CAP,
  claimAsk,
  unblockedThisWeek,
  watchMyAsks,
  watchMyClaims,
  watchLongestWaiting,
  watchNeedsHelp,
} from '../data/asks';
import {
  watchActiveRepos,
  watchNewRepos,
  watchOrphanRepos,
  watchReposOf,
  watchWantedRepos,
} from '../data/repos';
import { watchRecentMembers } from '../data/members';
import { myProfile } from '../data/users';
import {
  canWriteRole,
  HELP_AREAS,
  REPO_NEEDS,
  type Ask,
  type Member,
  type Repo,
  type RepoNeed,
} from '../data/types';
import { watchAcceptedCollabs, type CollabRequest } from '../data/collabs';
import { watchAnyGerminated, watchMatchingIdeas, watchOpenIdeas } from '../data/ideas';
import type { Idea } from '../data/types';
import { SkillsSheet } from './Profile';
import { toast } from '../ui/Toast';
import { notifyDiscord } from '../notify/discord';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pill } from '../ui/Pill';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { watchRecentComments, type RecentComment } from '../data/comments';
import { CommentBody } from './CommentBody';
import { AnnouncementBar, CircleLinks, PinnedRepo } from './CircleNotices';
import { ChecklistCard } from './ChecklistCard';
import { ComingUp } from './ComingUp';
import { PollCard } from './PollCard';
import { InviteSheet } from './InviteManager';
import { CollabInbox } from './CollabInbox';
import { sparkSeries } from '../poll/engine';
import { Spark } from '../ui/Spark';
import { ownsRepo } from '../util/skills';
import { langClass } from '../util/lang';
import { isNarrowed, visibleBlocks } from '../util/homeBlocks';
import { log, noteServerError } from '../util/log';
import { relTime } from '../util/time';

const ALL_NEEDS: RepoNeed[] = REPO_NEEDS.map((n) => n.key);
const WEEK_MS = 7 * 86_400_000;

const shortName = (fullName: string) => fullName.split('/')[1] ?? fullName;
const needLabel = (n: RepoNeed | null | undefined) => REPO_NEEDS.find((x) => x.key === n)?.label;

/* ------------------------------------------------------------------ blocks */
/*
 * Every block below owns the listener it needs. That is the whole mechanism of
 * M16.5: a block that is not rendered mounts no onSnapshot and costs no reads,
 * so the layout decision and the read budget are the same decision (ADR-022).
 * Gating markup while the parent still subscribed would save nothing at all.
 */

function MatcherBlock({
  gid,
  me,
  uid,
  onMatched,
}: {
  gid: string;
  me: Member;
  uid: string | undefined;
  onMatched: (ids: string[]) => void;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const matchNeeds = useMemo<RepoNeed[]>(() => [...me.helpWith, 'anything'], [me.helpWith]);

  useEffect(
    () => watchWantedRepos(gid, matchNeeds, setRepos, (code) => log('warn', `matcher: ${code}`), 5),
    [gid, matchNeeds],
  );
  useEffect(
    () =>
      watchMatchingIdeas(gid, matchNeeds, setIdeas, (code) => log('warn', `idea matcher: ${code}`)),
    [gid, matchNeeds],
  );

  const mine = useMemo(() => repos.filter((r) => !ownsRepo(r, me)).slice(0, 5), [repos, me]);
  const theirIdeas = useMemo(() => ideas.filter((i) => i.authorUid !== uid), [ideas, uid]);

  useEffect(() => onMatched(mine.map((r) => r.id)), [mine, onMatched]);

  if (mine.length === 0 && theirIdeas.length === 0) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Wants what you’re good at</span>
        <span class="sectionhead__count">{mine.length + Math.min(theirIdeas.length, 3)}</span>
        <span class="topbar__spacer" />
        {uid && (
          <a class="small" href={`#/g/${gid}/m/${uid}`}>
            your skills →
          </a>
        )}
      </div>
      {mine.map((r) => (
        <a key={r.id} class="idea" href={`#/g/${gid}/repo/${r.id}`}>
          <span class="row">
            <span class={`langdot ${langClass(r.language)}`} />
            <span class="mono idea__name">{shortName(r.fullName)}</span>
            <Chip tone="accent">{needLabel(r.needs)}</Chip>
            <span class="topbar__spacer" />
            <span class="small faint">@{r.githubOwnerLogin}</span>
          </span>
          {(r.pitch || r.description) && (
            <span class="idea__pitch">{r.pitch || r.description}</span>
          )}
        </a>
      ))}
      {theirIdeas.slice(0, 3).map((i) => (
        <a key={i.id} class="idea" href={`#/g/${gid}/idea/${i.id}`}>
          <span class="row">
            <Chip tone="warn">idea</Chip>
            <span class="idea__name">{i.title}</span>
            <Chip tone="accent">{needLabel(i.needs)}</Chip>
            <span class="topbar__spacer" />
            <span class="small faint">@{i.authorLogin}</span>
          </span>
          <span class="idea__pitch">{i.pitch}</span>
        </a>
      ))}
    </section>
  );
}

function ArrivalsBlock({
  gid,
  members,
  uid,
}: {
  gid: string;
  members: Member[] | null;
  uid: string | undefined;
}) {
  const weekMs = Date.now() - WEEK_MS;
  const arrivals = useMemo(
    () =>
      (members ?? [])
        .filter(
          (m) =>
            m.uid !== uid && m.joinedVia !== 'founder' && (m.joinedAt?.toMillis() ?? 0) >= weekMs,
        )
        .slice(0, 5),
    [members, uid, weekMs],
  );
  if (arrivals.length === 0) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">New in the circle</span>
      </div>
      {arrivals.map((m) => {
        const skills = m.helpWith
          .map((h) => HELP_AREAS.find((a) => a.key === h)?.label ?? h)
          .join(', ');
        return (
          <a key={m.uid} class="row home__repo" href={`#/g/${gid}/m/${m.uid}`}>
            <span class="row">
              <Avatar src={m.avatarUrl} login={m.login} />
              <span class="mono">@{m.login}</span>
            </span>
            <span class="small dim home__arrival">
              {skills && <span>{skills}</span>}
              {m.learning.length > 0 && (
                <span class="faint"> · learning {m.learning.slice(0, 3).join(', ')}</span>
              )}
            </span>
            <span class="topbar__spacer" />
            <span class="small faint">{relTime(m.joinedAt)}</span>
          </a>
        );
      })}
    </section>
  );
}

function IdeasBrewingBlock({ gid }: { gid: string }) {
  const [brewing, setBrewing] = useState<Idea[] | null>(null);
  const [anyGerminated, setAnyGerminated] = useState(false);
  useEffect(
    () =>
      watchOpenIdeas(gid, setBrewing, (code) => {
        log('warn', `ideas watch: ${code}`);
        noteServerError(code, 'ideas');
      }),
    [gid],
  );
  useEffect(() => watchAnyGerminated(gid, setAnyGerminated), [gid]);

  if (brewing === null || (brewing.length === 0 && !anyGerminated)) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Ideas brewing</span>
        {brewing.length > 0 && <span class="sectionhead__count">{brewing.length}</span>}
      </div>
      {brewing.slice(0, 5).map((i) => (
        <a key={i.id} class="idea" href={`#/g/${gid}/idea/${i.id}`}>
          <span class="row">
            <span class="idea__name">{i.title}</span>
            {i.needs && <Chip tone="accent">{needLabel(i.needs)}</Chip>}
            <span class="topbar__spacer" />
            {(i.interestCount ?? 0) > 0 && (
              <span class="small faint">{i.interestCount} would build it</span>
            )}
            <span class="small faint">@{i.authorLogin}</span>
          </span>
          <span class="idea__pitch">{i.pitch}</span>
        </a>
      ))}
      {/* Class G: an empty list here means every idea graduated, not that nobody had one. */}
      {brewing.length === 0 && anyGerminated && (
        <EmptyState line="Nothing brewing right now — every idea here became a repo. Pitch the next one with + Share." />
      )}
    </section>
  );
}

function NewThisWeekBlock({ gid }: { gid: string }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  useEffect(() => watchNewRepos(gid, setRepos, (code) => log('warn', `new repos: ${code}`)), [gid]);
  const weekMs = Date.now() - WEEK_MS;
  const fresh = useMemo(
    () => repos.filter((r) => (r.createdAt?.toMillis() ?? 0) >= weekMs).slice(0, 6),
    [repos, weekMs],
  );
  if (fresh.length === 0) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">New this week</span>
        <span class="sectionhead__count">{fresh.length}</span>
      </div>
      {fresh.map((r) => (
        <a key={r.id} class="idea" href={`#/g/${gid}/repo/${r.id}`}>
          <span class="row">
            <span class={`langdot ${langClass(r.language)}`} />
            <span class="mono idea__name">{shortName(r.fullName)}</span>
            <span class="small faint">@{r.githubOwnerLogin}</span>
          </span>
          {(r.pitch || r.description) && (
            <span class="idea__pitch">{r.pitch || r.description}</span>
          )}
        </a>
      ))}
    </section>
  );
}

function BuildingTogetherBlock({ gid }: { gid: string }) {
  const [collabs, setCollabs] = useState<CollabRequest[]>([]);
  useEffect(() => watchAcceptedCollabs(gid, setCollabs), [gid]);

  // Drawn straight from accepted collaboration requests — each one a recorded
  // fact, so stating it needs no member lookup. No counts, no ranking (ADR-019).
  const together = useMemo(() => {
    const byRepo = new Map<
      string,
      { repoId: string; fullName: string; ownerLogin: string; mates: string[] }
    >();
    for (const c of collabs) {
      const ownerLogin = c.repoFullName.split('/')[0] ?? '';
      const cur = byRepo.get(c.repoId) ?? {
        repoId: c.repoId,
        fullName: c.repoFullName,
        ownerLogin,
        mates: [],
      };
      if (
        c.requesterLogin &&
        c.requesterLogin !== ownerLogin &&
        !cur.mates.includes(c.requesterLogin)
      ) {
        cur.mates.push(c.requesterLogin);
      }
      byRepo.set(c.repoId, cur);
    }
    return [...byRepo.values()].filter((x) => x.mates.length > 0).slice(0, 5);
  }, [collabs]);

  if (together.length === 0) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Building together</span>
        <span class="sectionhead__count">{together.length}</span>
      </div>
      {together.map((t) => (
        <a key={t.repoId} class="row home__repo" href={`#/g/${gid}/repo/${t.repoId}`}>
          <span class="row">
            <span class="mono">{shortName(t.fullName)}</span>
          </span>
          <span class="small dim">
            @{t.ownerLogin} with {t.mates.map((m) => `@${m}`).join(', ')}
          </span>
          <span class="topbar__spacer" />
          <span class="row home__faces">
            {[t.ownerLogin, ...t.mates].slice(0, 4).map((login) => (
              <Avatar key={login} login={login} />
            ))}
          </span>
        </a>
      ))}
    </section>
  );
}

function WantsAHandBlock({
  gid,
  excludeIds,
  onCount,
}: {
  gid: string;
  excludeIds: Set<string>;
  onCount: (n: number) => void;
}) {
  const [wanted, setWanted] = useState<Repo[]>([]);
  const [orphans, setOrphans] = useState<Repo[]>([]);
  useEffect(
    () =>
      watchWantedRepos(gid, ALL_NEEDS, setWanted, (code) => {
        log('warn', `wanted repos: ${code}`);
        noteServerError(code, 'repos');
      }),
    [gid],
  );
  useEffect(
    () => watchOrphanRepos(gid, setOrphans, (code) => log('warn', `orphan repos: ${code}`)),
    [gid],
  );

  useEffect(() => onCount(wanted.length), [wanted.length, onCount]);

  // Longest-waiting first (the query orders by needsSince), then repos whose
  // owner left. Anything the matcher already showed is not repeated.
  const needing = useMemo(() => {
    const seen = new Set(excludeIds);
    const out: Repo[] = [];
    for (const r of [...wanted, ...orphans]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out.slice(0, 5);
  }, [wanted, orphans, excludeIds]);

  if (needing.length === 0) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark sectionhead__mark--warn" />
        <span class="sectionhead__title">Wants a hand</span>
        <span class="sectionhead__count">{needing.length}</span>
        <span class="topbar__spacer" />
        <a class="small" href={`#/g/${gid}/repos`}>
          All repos →
        </a>
      </div>
      {needing.map((r) => (
        <a key={r.id} class="row home__repo" href={`#/g/${gid}/repo/${r.id}`}>
          <span class="row">
            <span class={`langdot ${langClass(r.language)}`} />
            <span class="mono">{shortName(r.fullName)}</span>
          </span>
          <span class="row">
            {r.needsSince && <span class="small faint">asking {relTime(r.needsSince)}</span>}
            {r.seekingOwner && <Chip tone="warn">needs an owner</Chip>}
            {r.needs && <Chip tone="accent">{needLabel(r.needs)}</Chip>}
          </span>
        </a>
      ))}
    </section>
  );
}

function ActiveThisWeekBlock({
  gid,
  repoCount,
  onActiveCount,
}: {
  gid: string;
  repoCount: number | null;
  onActiveCount: (n: number) => void;
}) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  useEffect(
    () =>
      watchActiveRepos(gid, setRepos, (code) => {
        log('warn', `home repos watch: ${code}`);
        noteServerError(code, 'repos'); // Class B: give-ups surface, never just log
      }),
    [gid],
  );
  const weekMs = Date.now() - WEEK_MS;
  const active = useMemo(
    () => (repos ?? []).filter((r) => (r.lastEventAt?.toMillis() ?? 0) >= weekMs),
    [repos, weekMs],
  );
  useEffect(() => onActiveCount(active.length), [active.length, onActiveCount]);
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Active this week</span>
        {active.length > 0 && <span class="sectionhead__count">{active.length}</span>}
        <span class="topbar__spacer" />
        {active.length > 0 && <span class="small faint spark__legend">last 7 days</span>}
        {repoCount !== null && repoCount > 0 && (
          <a class="small" href={`#/g/${gid}/repos`}>
            All repos →
          </a>
        )}
      </div>
      {/* Class G: four different reasons this list can be short, four sentences. */}
      {repos === null ? (
        <span class="skeleton" />
      ) : repoCount === 0 ? (
        <EmptyState
          line="No repos yet — register the group’s repos and this becomes your shared window."
          action={
            <a class="pill" href={`#/g/${gid}/repos`}>
              Add repos →
            </a>
          }
        />
      ) : repos.length === 0 ? (
        <EmptyState line="Every repo here is paused or done — nothing in flight right now." />
      ) : active.length === 0 ? (
        <EmptyState line="Quiet week — no repo activity in the last 7 days." />
      ) : (
        <div class="home__repos">
          {active.slice(0, 6).map((r) => (
            <a key={r.id} class="home__repo" href={`#/g/${gid}/repo/${r.id}`}>
              <span class="row">
                <span class={`langdot ${langClass(r.language)}`} />
                <span class="mono">{shortName(r.fullName)}</span>
              </span>
              <span class="row home__repo-meta">
                <Spark series={sparkSeries(r.daily, 7)} width={84} />
                <span class="small faint home__time">
                  {r.lastEventAt ? relTime(r.lastEventAt) : ''}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function NeedsHelpBlock({
  gid,
  uid,
  canWrite,
  unblocked,
}: {
  gid: string;
  uid: string | undefined;
  canWrite: boolean;
  unblocked: number;
}) {
  const [asks, setAsks] = useState<Ask[] | null>(null);
  const [waiting, setWaiting] = useState<Ask[]>([]);
  useEffect(
    () => watchNeedsHelp(gid, setAsks, (code) => log('warn', `asks watch: ${code}`)),
    [gid],
  );
  // M18: the list above is newest-first, which is exactly how an unanswered ask
  // sinks. This is the counterweight, and it is its own query so it stays true
  // past the twenty-five Home loads.
  useEffect(() => watchLongestWaiting(gid, setWaiting), [gid]);
  const stale = useMemo(() => {
    const shown = new Set((asks ?? []).slice(0, 3).map((a) => a.id));
    const twoDays = Date.now() - 2 * 86_400_000;
    return waiting.filter(
      (a) => !shown.has(a.id) && (a.createdAt?.toMillis() ?? Date.now()) < twoDays,
    );
  }, [waiting, asks]);

  async function quickClaim(ask: Ask) {
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    try {
      await claimAsk(gid, ask, profile, '');
      toast(`Claimed — @${ask.authorLogin} will see it`);
      notifyDiscord(gid, 'postClaims', {
        title: `@${profile.login} claimed: ${ask.title}`,
        path: `#/g/${gid}/ask/${ask.id}`,
      });
    } catch {
      toast('Claiming failed.', { error: true });
    }
  }

  return (
    <section class="card stack rise-3">
      <div class="sectionhead">
        <span
          class={
            asks?.some((a) => a.kind === 'stuck')
              ? 'sectionhead__mark sectionhead__mark--warn'
              : 'sectionhead__mark'
          }
        />
        <span class="sectionhead__title">Needs help right now</span>
        {asks && asks.length > 0 && <span class="sectionhead__count">{asks.length}</span>}
      </div>
      {/* Only worth saying when it has genuinely been sitting there, and only
          about asks the main list is not already showing at the top. */}
      {stale.length > 0 && (
        <div class="stack waiting">
          <span class="small faint">Waiting longest, nobody on it yet</span>
          {stale.map((a) => (
            <a key={a.id} class="row waiting__row" href={`#/g/${gid}/ask/${a.id}`}>
              <span class="dot dot--warn" />
              <span class="small">{a.title}</span>
              <span class="topbar__spacer" />
              <span class="small faint">asked {relTime(a.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
      {asks === null && <span class="skeleton" />}
      {asks?.length === 0 && (
        <EmptyState
          icon="ask"
          // The query filters to open+claimed, so an empty list has two very
          // different meanings. `unblocked` (resolved in 7d) proves asks exist.
          line={
            unblocked > 0
              ? 'Nothing open right now — everything asked this week got picked up.'
              : 'No asks yet — post the first one with the + button.'
          }
        />
      )}
      {asks?.map((a) => (
        <div key={a.id} class={`row ask ${a.kind === 'stuck' ? 'ask--stuck' : ''}`}>
          <a class="ask__main" href={`#/g/${gid}/ask/${a.id}`}>
            <span class="row">
              <span class={`dot ${a.kind === 'stuck' ? 'dot--warn' : 'dot--accent'}`} />
              <span class="ask__title">{a.title}</span>
            </span>
            <span class="row small faint">
              <Avatar login={a.authorLogin} src={a.authorAvatarUrl} />
              <span>@{a.authorLogin}</span>
              {a.tags.slice(0, 3).map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
              <span>{relTime(a.createdAt)}</span>
            </span>
          </a>
          <span class="topbar__spacer" />
          {a.state === 'claimed' && <Chip>{a.claimCount} on it</Chip>}
          {canWrite && a.authorUid !== uid && !(a.claimerUids ?? []).includes(uid ?? '') && (
            <Pill onClick={() => void quickClaim(a)} ariaLabel={`Claim: ${a.title}`}>
              Claim
            </Pill>
          )}
        </div>
      ))}
    </section>
  );
}

function DiscussionBlock({ gid }: { gid: string }) {
  const [recent, setRecent] = useState<RecentComment[]>([]);
  useEffect(
    () => watchRecentComments(gid, setRecent, (code) => log('warn', `recent comments: ${code}`)),
    [gid],
  );
  if (recent.length === 0) return null;
  return (
    <section class="card stack rise-3">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Recent discussion</span>
        <span class="sectionhead__count">{recent.length}</span>
      </div>
      {recent.map((c) => (
        <a key={c.id} class="recent" href={c.repoId ? `#/g/${gid}/repo/${c.repoId}` : `#/g/${gid}`}>
          <span class="row small faint">
            <Avatar login={c.authorLogin} src={c.authorAvatarUrl} />
            <b>@{c.authorLogin}</b>
            <span>{relTime(c.createdAt)}</span>
          </span>
          <span class="recent__body">
            <CommentBody body={c.body.slice(0, 160)} />
          </span>
        </a>
      ))}
    </section>
  );
}

function YourActivityBlock({ gid, uid }: { gid: string; uid: string }) {
  const [myAsks, setMyAsks] = useState<Ask[]>([]);
  const [myClaims, setMyClaims] = useState<Ask[]>([]);
  useEffect(() => watchMyAsks(gid, uid, setMyAsks), [gid, uid]);
  useEffect(() => watchMyClaims(gid, uid, setMyClaims), [gid, uid]);
  return (
    <section class="card stack rise-3">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Your activity</span>
      </div>
      {myAsks.length === 0 && myClaims.length === 0 && (
        <EmptyState line="Nothing from you yet — asks you post and claims you make land here." />
      )}
      {myAsks.slice(0, 5).map((a) => (
        <a key={a.id} class="row home__repo" href={`#/g/${gid}/ask/${a.id}`}>
          <span class="small">you asked: {a.title}</span>
          <span class="topbar__spacer" />
          <Chip
            tone={a.state === 'resolved' ? 'accent' : a.state === 'claimed' ? 'default' : 'warn'}
          >
            {a.state}
          </Chip>
        </a>
      ))}
      {myClaims
        .filter((a) => a.authorUid !== uid)
        .slice(0, 5)
        .map((a) => (
          <a key={a.id} class="row home__repo" href={`#/g/${gid}/ask/${a.id}`}>
            <span class="small">you claimed: {a.title}</span>
            <span class="topbar__spacer" />
            <Chip tone={a.state === 'resolved' ? 'accent' : 'default'}>{a.state}</Chip>
          </a>
        ))}
    </section>
  );
}

/**
 * The skills sheet seeds its suggestions from the languages in your own repos
 * (M11), so it needs them — but only once it is open, which is why this lives
 * in its own component rather than in the page's listener set.
 */
function SkillsSheetForMe({ gid, me, onClose }: { gid: string; me: Member; onClose: () => void }) {
  const [mine, setMine] = useState<Repo[]>([]);
  useEffect(
    () =>
      watchReposOf(gid, me.uid, me.login, setMine, (code) =>
        log('warn', `own repos for skills: ${code}`),
      ),
    [gid, me.uid, me.login],
  );
  return <SkillsSheet gid={gid} me={me} myRepos={mine} onClose={onClose} />;
}

/* -------------------------------------------------------------------- page */

const showAllKey = (gid: string, uid: string | undefined) => `rc.homeAll.${gid}.${uid ?? 'anon'}`;

export function GroupHome({ gid }: { gid: string }) {
  const g = activeGroup.value;
  const summary = activeSummary.value;
  const me = myMembership.value;
  const uid = sessionUser.value?.uid;
  const iAmAdmin = me?.role === 'admin';
  const canWrite = canWriteRole(me);

  // Owned here because two blocks share them: the member list feeds both
  // arrivals and the avatar strip, and the unblocked count feeds both the stat
  // row and the ask block's empty state.
  const [members, setMembers] = useState<Member[] | null>(null);
  const [unblocked, setUnblocked] = useState(0);
  const [hasDiscord, setHasDiscord] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wantedCount, setWantedCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      setShowAll(localStorage.getItem(showAllKey(gid, uid)) === '1');
    } catch {
      /* storage denied — the narrow view is a safe default */
    }
  }, [gid, uid]);

  function openEverything() {
    setShowAll(true);
    try {
      localStorage.setItem(showAllKey(gid, uid), '1');
    } catch {
      /* remembering the preference is best-effort */
    }
  }

  useEffect(
    () =>
      watchRecentMembers(gid, setMembers, (code) => {
        log('warn', `recent members: ${code}`);
        noteServerError(code, 'members');
      }),
    [gid],
  );
  useEffect(() => {
    void getDoc(fsDoc(db(), `groups/${gid}/integrations/discord`))
      .then((s) => setHasDiscord(s.exists()))
      .catch(() => undefined);
  }, [gid]);

  // Always hits the server, so it is throttled to once a minute per tab and
  // keyed on the one number that can change its answer.
  const openAskCount = summary?.openAskCount ?? 0;
  useEffect(() => {
    const key = `rc.unblocked.${gid}`;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(key) ?? 0);
    } catch {
      /* storage unavailable */
    }
    if (Date.now() - last < 60_000) return;
    try {
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      /* storage unavailable */
    }
    void unblockedThisWeek(gid)
      .then(setUnblocked)
      .catch(() => undefined);
  }, [gid, openAskCount]);

  const checklist = me?.checklist ?? {};
  const blocks = visibleBlocks({
    hasSkills: (me?.helpWith?.length ?? 0) > 0,
    repoCount: summary?.repoCount ?? null,
    hasActivity: !!checklist.postedOrAnswered,
    membershipAgeMs: me?.joinedAt ? Date.now() - me.joinedAt.toMillis() : null,
    checklistDone: Object.values(checklist).filter(Boolean).length,
    showAll,
  });

  const memberCount = summary?.memberCount ?? members?.length ?? null;
  const repoCount = summary?.repoCount ?? null;
  const excludeIds = useMemo(() => new Set(matchedIds), [matchedIds]);
  // Ask once, quietly, and only when there's something to match against.
  const skillsPrompt = canWrite && (me?.helpWith?.length ?? 0) === 0 && wantedCount > 0;

  return (
    <main class="stack">
      <AnnouncementBar gid={gid} />
      {summary?.pinnedRepoId && <PinnedRepo gid={gid} repoId={summary.pinnedRepoId} />}
      <section class="home__head rise">
        {g === undefined ? (
          <span class="skeleton" />
        ) : (
          <>
            <h2>{g?.name}</h2>
            {g?.description && <p class="lead">{g.description}</p>}
            <CircleLinks summary={summary} />
          </>
        )}
        <div class="stats stats--divided home__stats">
          <div class="stat">
            <span class="stat__value">{memberCount ?? '–'}</span>
            <span class="stat__label">members</span>
          </div>
          <div class="stat">
            <span class="stat__value">
              {activeCount}
              {repoCount ? <span class="stat__unit">/{repoCount}</span> : null}
            </span>
            <span class="stat__label">active this week</span>
          </div>
          <div class="stat">
            <span class={unblocked > 0 ? 'stat__value stat__value--accent' : 'stat__value'}>
              {unblocked >= UNBLOCKED_CAP ? `${UNBLOCKED_CAP}+` : unblocked}
            </span>
            <span class="stat__label">unblocked · 7d</span>
          </div>
        </div>
      </section>

      {blocks.matcher && me && (
        <MatcherBlock gid={gid} me={me} uid={uid} onMatched={setMatchedIds} />
      )}

      {skillsPrompt && (
        <section class="hero hero--dim stack rise-2">
          <span class="hero__label">For you</span>
          <h3>Say what you’re good at</h3>
          <p class="small dim">
            Repos here declare the help they want. Tell the circle what you can do and the matches
            land right on this page.
          </p>
          <div>
            <Pill variant="primary" onClick={() => setSkillsOpen(true)}>
              Pick what you can help with
            </Pill>
          </div>
        </section>
      )}

      <ComingUp gid={gid} />
      <PollCard gid={gid} />
      {blocks.arrivals && <ArrivalsBlock gid={gid} members={members} uid={uid} />}
      {blocks.ideas && <IdeasBrewingBlock gid={gid} />}
      {blocks.newThisWeek && <NewThisWeekBlock gid={gid} />}
      {blocks.together && <BuildingTogetherBlock gid={gid} />}
      {blocks.wantsAHand && (
        <WantsAHandBlock gid={gid} excludeIds={excludeIds} onCount={setWantedCount} />
      )}

      <ActiveThisWeekBlock gid={gid} repoCount={repoCount} onActiveCount={setActiveCount} />

      <ChecklistCard gid={gid} hasDiscord={hasDiscord} memberCount={memberCount ?? 1} />

      <CollabInbox gid={gid} />

      <NeedsHelpBlock gid={gid} uid={uid} canWrite={canWrite} unblocked={unblocked} />

      {blocks.discussion && <DiscussionBlock gid={gid} />}
      {blocks.yourActivity && uid && <YourActivityBlock gid={gid} uid={uid} />}

      <section class="card stack rise-3">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">Members</span>
          {memberCount !== null && <span class="sectionhead__count">{memberCount}</span>}
          <span class="topbar__spacer" />
          {iAmAdmin && <Pill onClick={() => setInviteOpen(true)}>Invite people</Pill>}
          {me && <Chip tone={me.role === 'admin' ? 'accent' : 'default'}>you: {me.role}</Chip>}
        </div>
        {members === null ? (
          <span class="skeleton" />
        ) : memberCount === 1 && iAmAdmin ? (
          <EmptyState
            icon="users"
            line="Just you in here so far — invite your circle and their work shows up on this page."
            action={
              <Pill variant="primary" onClick={() => setInviteOpen(true)}>
                Invite people
              </Pill>
            }
          />
        ) : (
          <div class="row home__avatars">
            {members.slice(0, 8).map((m) => (
              <a key={m.uid} href={`#/g/${gid}/m/${m.uid}`} aria-label={`@${m.login}`}>
                <Avatar src={m.avatarUrl} login={m.login} />
              </a>
            ))}
            <a class="small" href={`#/g/${gid}/members`}>
              {memberCount ?? members.length} member
              {(memberCount ?? members.length) === 1 ? '' : 's'} →
            </a>
          </div>
        )}
      </section>

      {/*
        Say so. A page that is quietly narrower than it will be later is the
        kind of thing that sends someone looking for a bug, and the checklist
        is a guide rather than a gate (F-12) — so this is a view preference
        with a one-tap way out, never a lock.
      */}
      {isNarrowed(blocks) && (
        <div class="row home__narrowed">
          <span class="small faint">Showing the essentials while you’re new here.</span>
          <span class="topbar__spacer" />
          <Pill variant="ghost" onClick={openEverything}>
            Show everything
          </Pill>
        </div>
      )}

      {inviteOpen && <InviteSheet gid={gid} onClose={() => setInviteOpen(false)} />}
      {skillsOpen && me && (
        <SkillsSheetForMe gid={gid} me={me} onClose={() => setSkillsOpen(false)} />
      )}
    </main>
  );
}
