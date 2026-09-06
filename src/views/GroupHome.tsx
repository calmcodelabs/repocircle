import { useEffect, useMemo, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { activeGroup, activeSummary, myMembership } from '../data/activeGroup';
import {
  claimAsk,
  UNBLOCKED_CAP,
  unblockedThisWeek,
  watchMyAsks,
  watchMyClaims,
  watchNeedsHelp,
} from '../data/asks';
import { watchActiveRepos, watchNewRepos, watchOrphanRepos, watchWantedRepos } from '../data/repos';
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
import { ChecklistCard } from './ChecklistCard';
import { InviteSheet } from './InviteManager';
import { CollabInbox } from './CollabInbox';
import { sparkSeries } from '../poll/engine';
import { Spark } from '../ui/Spark';
import { ownsRepo } from '../util/skills';
import { langClass } from '../util/lang';
import { log, noteServerError } from '../util/log';
import { relTime } from '../util/time';

const ALL_NEEDS: RepoNeed[] = REPO_NEEDS.map((n) => n.key);
const WEEK_MS = 7 * 86_400_000;

/**
 * Group Home. Every block is fed by the circle summary (counts) or a bounded
 * query (lists) — M16. It used to read the whole repo, member and idea
 * collections, which cost about nine hundred document reads a visit at two
 * hundred members and took the app down. See docs/SCALING.md.
 */
export function GroupHome({ gid }: { gid: string }) {
  const g = activeGroup.value;
  const summary = activeSummary.value;
  const me = myMembership.value;
  const [activeRepos, setActiveRepos] = useState<Repo[] | null>(null);
  const [newRepos, setNewRepos] = useState<Repo[]>([]);
  const [wanted, setWanted] = useState<Repo[]>([]);
  const [forYouRepos, setForYouRepos] = useState<Repo[]>([]);
  const [orphans, setOrphans] = useState<Repo[]>([]);
  const [recentMembers, setRecentMembers] = useState<Member[] | null>(null);
  const [needsHelp, setNeedsHelp] = useState<Ask[] | null>(null);
  const [myAsks, setMyAsks] = useState<Ask[]>([]);
  const [myClaims, setMyClaims] = useState<Ask[]>([]);
  const [unblocked, setUnblocked] = useState(0);
  const [hasDiscord, setHasDiscord] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [collabs, setCollabs] = useState<CollabRequest[]>([]);
  const [brewing, setBrewing] = useState<Idea[] | null>(null);
  const [ideasForMe, setIdeasForMe] = useState<Idea[]>([]);
  const [anyGerminated, setAnyGerminated] = useState(false);
  const [recent, setRecent] = useState<RecentComment[]>([]);
  const iAmAdmin = me?.role === 'admin';
  const uid = sessionUser.value?.uid;
  const canWrite = canWriteRole(me);
  const mySkills = useMemo(() => me?.helpWith ?? [], [me?.helpWith]);
  const matchNeeds = useMemo<RepoNeed[]>(
    () => (mySkills.length === 0 ? [] : [...mySkills, 'anything']),
    [mySkills],
  );

  useEffect(
    () =>
      watchNeedsHelp(gid, setNeedsHelp, (code) => {
        log('warn', `asks watch: ${code}`);
      }),
    [gid],
  );
  useEffect(() => (uid ? watchMyAsks(gid, uid, setMyAsks) : undefined), [gid, uid]);
  useEffect(() => (uid ? watchMyClaims(gid, uid, setMyClaims) : undefined), [gid, uid]);
  // The resolved-count query always hits the server, so it is throttled to once
  // a minute per tab and keyed on the one number that can change its answer.
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
  useEffect(
    () => watchRecentComments(gid, setRecent, (code) => log('warn', `recent comments: ${code}`)),
    [gid],
  );
  useEffect(() => {
    void getDoc(fsDoc(db(), `groups/${gid}/integrations/discord`))
      .then((s) => setHasDiscord(s.exists()))
      .catch(() => undefined);
  }, [gid]);

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

  useEffect(
    () =>
      watchActiveRepos(gid, setActiveRepos, (code) => {
        log('warn', `home repos watch: ${code}`);
        noteServerError(code, 'repos'); // Class B: give-ups surface, never just log
      }),
    [gid],
  );
  useEffect(
    () => watchNewRepos(gid, setNewRepos, (code) => log('warn', `new repos watch: ${code}`)),
    [gid],
  );
  useEffect(
    () =>
      watchWantedRepos(gid, ALL_NEEDS, setWanted, (code) => {
        log('warn', `wanted repos watch: ${code}`);
        noteServerError(code, 'repos');
      }),
    [gid],
  );
  useEffect(
    () =>
      watchWantedRepos(
        gid,
        matchNeeds,
        setForYouRepos,
        (code) => log('warn', `matcher watch: ${code}`),
        5,
      ),
    [gid, matchNeeds],
  );
  useEffect(
    () => watchOrphanRepos(gid, setOrphans, (code) => log('warn', `orphan repos: ${code}`)),
    [gid],
  );
  useEffect(
    () =>
      watchRecentMembers(gid, setRecentMembers, (code) => {
        log('warn', `recent members: ${code}`);
        noteServerError(code, 'members');
      }),
    [gid],
  );
  useEffect(() => watchAcceptedCollabs(gid, setCollabs), [gid]);
  useEffect(
    () =>
      watchOpenIdeas(gid, setBrewing, (code) => {
        log('warn', `home ideas watch: ${code}`);
        noteServerError(code, 'ideas');
      }),
    [gid],
  );
  useEffect(
    () =>
      watchMatchingIdeas(gid, matchNeeds, setIdeasForMe, (code) =>
        log('warn', `idea matcher: ${code}`),
      ),
    [gid, matchNeeds],
  );
  useEffect(() => watchAnyGerminated(gid, setAnyGerminated), [gid]);

  const weekMs = Date.now() - WEEK_MS;
  // Derive once per snapshot rather than on every render (SCALING §2).
  const active = useMemo(
    () => (activeRepos ?? []).filter((r) => (r.lastEventAt?.toMillis() ?? 0) >= weekMs),
    [activeRepos, weekMs],
  );
  const fresh = useMemo(
    () => newRepos.filter((r) => (r.createdAt?.toMillis() ?? 0) >= weekMs).slice(0, 6),
    [newRepos, weekMs],
  );
  const forYou = useMemo(
    () => forYouRepos.filter((r) => !(me && ownsRepo(r, me))).slice(0, 5),
    [forYouRepos, me],
  );
  const forYouIds = useMemo(() => new Set(forYou.map((r) => r.id)), [forYou]);
  const mineFilteredIdeas = useMemo(
    () => ideasForMe.filter((i) => i.authorUid !== uid),
    [ideasForMe, uid],
  );
  // Longest-waiting first (the query orders by needsSince), then the repos whose
  // owner left. Anything already shown in the matcher is not repeated here.
  const needing = useMemo(() => {
    const seen = new Set(forYouIds);
    const out: Repo[] = [];
    for (const r of [...wanted, ...orphans]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out.slice(0, 5);
  }, [wanted, orphans, forYouIds]);

  // Building together (M12): the product working, made visible. Drawn straight
  // from accepted collaboration requests — each one is a recorded fact, so no
  // member lookup is needed to state it. No counts, no ranking (ADR-019).
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

  // New in the circle (M12): arrivals within a week, introduced by what they
  // bring — the moment 200 semi-strangers stop being invisible on day one.
  const arrivals = useMemo(
    () =>
      (recentMembers ?? [])
        .filter(
          (m) =>
            m.uid !== uid && m.joinedVia !== 'founder' && (m.joinedAt?.toMillis() ?? 0) >= weekMs,
        )
        .slice(0, 5),
    [recentMembers, uid, weekMs],
  );

  const memberCount = summary?.memberCount ?? recentMembers?.length ?? null;
  const repoCount = summary?.repoCount ?? null;
  // Ask once, quietly, and only when there's something to match against.
  const skillsPrompt = canWrite && mySkills.length === 0 && wanted.length > 0;

  return (
    <main class="stack">
      <section class="home__head rise">
        {g === undefined ? (
          <span class="skeleton" />
        ) : (
          <>
            <h2>{g?.name}</h2>
            {g?.description && <p class="lead">{g.description}</p>}
          </>
        )}
        <div class="stats stats--divided home__stats">
          <div class="stat">
            <span class="stat__value">{memberCount ?? '–'}</span>
            <span class="stat__label">members</span>
          </div>
          <div class="stat">
            <span class="stat__value">
              {active.length}
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

      {(forYou.length > 0 || mineFilteredIdeas.length > 0) && (
        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Wants what you’re good at</span>
            <span class="sectionhead__count">
              {forYou.length + Math.min(mineFilteredIdeas.length, 3)}
            </span>
            <span class="topbar__spacer" />
            {uid && (
              <a class="small" href={`#/g/${gid}/m/${uid}`}>
                your skills →
              </a>
            )}
          </div>
          {forYou.map((r) => (
            <a key={r.id} class="idea" href={`#/g/${gid}/repo/${r.id}`}>
              <span class="row">
                <span class={`langdot ${langClass(r.language)}`} />
                <span class="mono idea__name">{r.fullName.split('/')[1] ?? r.fullName}</span>
                <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === r.needs)?.label}</Chip>
                <span class="topbar__spacer" />
                <span class="small faint">@{r.githubOwnerLogin}</span>
              </span>
              {(r.pitch || r.description) && (
                <span class="idea__pitch">{r.pitch || r.description}</span>
              )}
            </a>
          ))}
          {mineFilteredIdeas.slice(0, 3).map((i) => (
            <a key={i.id} class="idea" href={`#/g/${gid}/idea/${i.id}`}>
              <span class="row">
                <Chip tone="warn">idea</Chip>
                <span class="idea__name">{i.title}</span>
                <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === i.needs)?.label}</Chip>
                <span class="topbar__spacer" />
                <span class="small faint">@{i.authorLogin}</span>
              </span>
              <span class="idea__pitch">{i.pitch}</span>
            </a>
          ))}
        </section>
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

      {arrivals.length > 0 && (
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
      )}

      {((brewing?.length ?? 0) > 0 || anyGerminated) && (
        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Ideas brewing</span>
            {(brewing?.length ?? 0) > 0 && (
              <span class="sectionhead__count">{brewing?.length}</span>
            )}
          </div>
          {(brewing ?? []).slice(0, 5).map((i) => (
            <a key={i.id} class="idea" href={`#/g/${gid}/idea/${i.id}`}>
              <span class="row">
                <span class="idea__name">{i.title}</span>
                {i.needs && (
                  <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === i.needs)?.label}</Chip>
                )}
                <span class="topbar__spacer" />
                {(i.interestCount ?? 0) > 0 && (
                  <span class="small faint">{i.interestCount} would build it</span>
                )}
                <span class="small faint">@{i.authorLogin}</span>
              </span>
              <span class="idea__pitch">{i.pitch}</span>
            </a>
          ))}
          {brewing?.length === 0 && anyGerminated && (
            <EmptyState line="Nothing brewing right now — every idea here became a repo. Pitch the next one with + Share." />
          )}
        </section>
      )}

      {fresh.length > 0 && (
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
                <span class="mono idea__name">{r.fullName.split('/')[1] ?? r.fullName}</span>
                <span class="small faint">@{r.githubOwnerLogin}</span>
              </span>
              {(r.pitch || r.description) && (
                <span class="idea__pitch">{r.pitch || r.description}</span>
              )}
            </a>
          ))}
        </section>
      )}

      {together.length > 0 && (
        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Building together</span>
            <span class="sectionhead__count">{together.length}</span>
          </div>
          {together.map((t) => (
            <a key={t.repoId} class="row home__repo" href={`#/g/${gid}/repo/${t.repoId}`}>
              <span class="row">
                <span class="mono">{t.fullName.split('/')[1] ?? t.fullName}</span>
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
      )}

      {needing.length > 0 && (
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
                <span class="mono">{r.fullName.split('/')[1] ?? r.fullName}</span>
              </span>
              <span class="row">
                {r.seekingOwner && <Chip tone="warn">needs an owner</Chip>}
                {r.needs && (
                  <Chip tone="accent">{REPO_NEEDS.find((n) => n.key === r.needs)?.label}</Chip>
                )}
              </span>
            </a>
          ))}
        </section>
      )}

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
        {activeRepos === null ? (
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
        ) : activeRepos.length === 0 ? (
          <EmptyState line="Every repo here is paused or done — nothing in flight right now." />
        ) : active.length === 0 ? (
          <EmptyState line="Quiet week — no repo activity in the last 7 days." />
        ) : (
          <div class="home__repos">
            {active.slice(0, 6).map((r) => (
              <a key={r.id} class="home__repo" href={`#/g/${gid}/repo/${r.id}`}>
                <span class="row">
                  <span class={`langdot ${langClass(r.language)}`} />
                  <span class="mono">{r.fullName.split('/')[1] ?? r.fullName}</span>
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

      <ChecklistCard gid={gid} hasDiscord={hasDiscord} memberCount={memberCount ?? 1} />

      <CollabInbox gid={gid} />

      <section class="card stack rise-3">
        <div class="sectionhead">
          <span
            class={
              needsHelp?.some((a) => a.kind === 'stuck')
                ? 'sectionhead__mark sectionhead__mark--warn'
                : 'sectionhead__mark'
            }
          />
          <span class="sectionhead__title">Needs help right now</span>
          {needsHelp && needsHelp.length > 0 && (
            <span class="sectionhead__count">{needsHelp.length}</span>
          )}
        </div>
        {needsHelp === null && <span class="skeleton" />}
        {needsHelp?.length === 0 && (
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
        {needsHelp?.map((a) => (
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

      {recent.length > 0 && (
        <section class="card stack rise-3">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Recent discussion</span>
            <span class="sectionhead__count">{recent.length}</span>
          </div>
          {recent.map((c) => (
            <a
              key={c.id}
              class="recent"
              href={c.repoId ? `#/g/${gid}/repo/${c.repoId}` : `#/g/${gid}`}
            >
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
      )}

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

      <section class="card stack rise-3">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">Members</span>
          {memberCount !== null && <span class="sectionhead__count">{memberCount}</span>}
          <span class="topbar__spacer" />
          {iAmAdmin && <Pill onClick={() => setInviteOpen(true)}>Invite people</Pill>}
          {me && <Chip tone={me.role === 'admin' ? 'accent' : 'default'}>you: {me.role}</Chip>}
        </div>
        {recentMembers === null ? (
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
            {recentMembers.slice(0, 8).map((m) => (
              <a key={m.uid} href={`#/g/${gid}/m/${m.uid}`} aria-label={`@${m.login}`}>
                <Avatar src={m.avatarUrl} login={m.login} />
              </a>
            ))}
            <a class="small" href={`#/g/${gid}/members`}>
              {memberCount ?? recentMembers.length} member
              {(memberCount ?? recentMembers.length) === 1 ? '' : 's'} →
            </a>
          </div>
        )}
      </section>

      {inviteOpen && <InviteSheet gid={gid} onClose={() => setInviteOpen(false)} />}
      {skillsOpen && me && (
        <SkillsSheet
          gid={gid}
          me={me}
          myRepos={[...(activeRepos ?? []), ...newRepos].filter((r) => ownsRepo(r, me))}
          onClose={() => setSkillsOpen(false)}
        />
      )}
    </main>
  );
}
