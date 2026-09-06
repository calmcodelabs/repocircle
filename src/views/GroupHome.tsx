import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import {
  claimAsk,
  unblockedThisWeek,
  watchMyAsks,
  watchMyClaims,
  watchNeedsHelp,
} from '../data/asks';
import { watchRepos } from '../data/repos';
import { myProfile } from '../data/users';
import { canWriteRole, HELP_AREAS, REPO_NEEDS, type Ask, type Repo } from '../data/types';
import { circleOwner, ownsRepo } from '../util/skills';
import { watchAcceptedCollabs, type CollabRequest } from '../data/collabs';
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
import { langClass } from '../util/lang';
import { log, noteServerError } from '../util/log';
import { relTime } from '../util/time';

/** Group Home, M1 edition: real tenancy, honest placeholders for M2/M3/M5 blocks. */
export function GroupHome({ gid }: { gid: string }) {
  const g = activeGroup.value;
  const members = activeMembers.value;
  const me = myMembership.value;
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [needsHelp, setNeedsHelp] = useState<Ask[] | null>(null);
  const [myAsks, setMyAsks] = useState<Ask[]>([]);
  const [myClaims, setMyClaims] = useState<Ask[]>([]);
  const [unblocked, setUnblocked] = useState(0);
  const [hasDiscord, setHasDiscord] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [collabs, setCollabs] = useState<CollabRequest[]>([]);
  const [recent, setRecent] = useState<RecentComment[]>([]);
  const iAmAdmin = me?.role === 'admin';
  const uid = sessionUser.value?.uid;
  const canWrite = canWriteRole(me);

  useEffect(
    () =>
      watchNeedsHelp(gid, setNeedsHelp, (code) => {
        log('warn', `asks watch: ${code}`);
      }),
    [gid],
  );
  useEffect(() => (uid ? watchMyAsks(gid, uid, setMyAsks) : undefined), [gid, uid]);
  useEffect(() => (uid ? watchMyClaims(gid, uid, setMyClaims) : undefined), [gid, uid]);
  // count() always hits the server (never the cache), and `needsHelp` gets a new
  // array identity on every snapshot delivery — depending on it re-queried on every
  // listener tick and burned quota fast. Key on what can actually change the count,
  // and never more than once a minute.
  const openCount = needsHelp?.length ?? 0;
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
  }, [gid, openCount]);
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
      watchRepos(gid, setRepos, (code) => {
        log('warn', `home repos watch: ${code}`);
        noteServerError(code, 'repos'); // Class B: give-ups surface, never just log
      }),
    [gid],
  );
  useEffect(() => watchAcceptedCollabs(gid, setCollabs), [gid]);

  const live =
    repos?.filter((r) => !r.archived && r.status !== 'paused' && r.status !== 'done') ?? [];
  const weekMs = Date.now() - 7 * 86_400_000;
  const active = live.filter((r) => (r.lastEventAt?.toMillis() ?? 0) >= weekMs);
  // Fresh ideas are the news in a circle that creates constantly — a two-day-old
  // repo has no activity to speak of, so it would otherwise look like the deadest
  // thing on the page.
  const fresh = (repos ?? [])
    .filter((r) => !r.archived && (r.createdAt?.toMillis() ?? 0) >= weekMs)
    .slice(0, 6);
  // The matcher (M11): repos whose declared need is something I said I can do.
  // 'anything' means "co-builder wanted" and matches whoever offered anything at
  // all. At 20 members this is a nicety; at 200 it's the reason to open the app.
  const mySkills = me?.helpWith ?? [];
  const forYou =
    mySkills.length === 0
      ? []
      : (repos ?? [])
          .filter(
            (r) =>
              !r.archived &&
              r.needs &&
              !(me && ownsRepo(r, me)) &&
              (mySkills.includes(r.needs as (typeof mySkills)[number]) || r.needs === 'anything'),
          )
          .sort(
            (a, b) =>
              Math.max(b.lastEventAt?.toMillis() ?? 0, b.createdAt?.toMillis() ?? 0) -
              Math.max(a.lastEventAt?.toMillis() ?? 0, a.createdAt?.toMillis() ?? 0),
          )
          .slice(0, 5);
  const forYouIds = new Set(forYou.map((r) => r.id));
  const needing = (repos ?? [])
    .filter((r) => !r.archived && (r.needs || r.seekingOwner) && !forYouIds.has(r.id))
    .slice(0, 5);
  // Building together (M12): the product working, made visible. A repo whose
  // owner is here plus at least one accepted collaborator — facts only, drawn
  // from the collab requests we already store. No counts, no ranking (ADR-019).
  const memberByUid = new Map((members ?? []).map((m) => [m.uid, m]));
  const together = (repos ?? [])
    .filter((r) => !r.archived)
    .map((r) => {
      const owner = circleOwner(r, members);
      const mates = collabs
        .filter((c) => c.repoId === r.id && memberByUid.has(c.requesterUid))
        .map((c) => memberByUid.get(c.requesterUid)!)
        .filter((m) => m.uid !== owner?.uid);
      const uniq = [...new Map(mates.map((m) => [m.uid, m])).values()];
      return owner && uniq.length > 0 ? { repo: r, owner, mates: uniq } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 5);

  // New in the circle (M12): arrivals within a week, introduced by what they
  // bring — the moment 200 semi-strangers stop being invisible on day one.
  const arrivals = (members ?? [])
    .filter(
      (m) => m.uid !== uid && m.joinedVia !== 'founder' && (m.joinedAt?.toMillis() ?? 0) >= weekMs,
    )
    .sort((a, b) => (b.joinedAt?.toMillis() ?? 0) - (a.joinedAt?.toMillis() ?? 0))
    .slice(0, 5);

  // Ask once, quietly, and only when there's something to match against.
  const skillsPrompt =
    canWrite && mySkills.length === 0 && (repos ?? []).some((r) => r.needs && !r.archived);

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
            <span class="stat__value">{members?.length ?? '–'}</span>
            <span class="stat__label">members</span>
          </div>
          <div class="stat">
            <span class="stat__value">
              {active.length}
              {live.length > 0 && <span class="stat__unit">/{live.length}</span>}
            </span>
            <span class="stat__label">active this week</span>
          </div>
          <div class="stat">
            <span class={unblocked > 0 ? 'stat__value stat__value--accent' : 'stat__value'}>
              {unblocked}
            </span>
            <span class="stat__label">unblocked · 7d</span>
          </div>
        </div>
      </section>

      {forYou.length > 0 && (
        <section class="card stack rise-2">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Wants what you’re good at</span>
            <span class="sectionhead__count">{forYou.length}</span>
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
          {together.map(({ repo: r, owner, mates }) => (
            <a key={r.id} class="row home__repo" href={`#/g/${gid}/repo/${r.id}`}>
              <span class="row">
                <span class={`langdot ${langClass(r.language)}`} />
                <span class="mono">{r.fullName.split('/')[1] ?? r.fullName}</span>
              </span>
              <span class="small dim">
                @{owner.login} with {mates.map((m) => `@${m.login}`).join(', ')}
              </span>
              <span class="topbar__spacer" />
              <span class="row home__faces">
                {[owner, ...mates].slice(0, 4).map((m) => (
                  <Avatar key={m.uid} src={m.avatarUrl} login={m.login} />
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
          {repos && repos.length > 0 && (
            <a class="small" href={`#/g/${gid}/repos`}>
              All repos →
            </a>
          )}
        </div>
        {repos === null ? (
          <span class="skeleton" />
        ) : repos.length === 0 ? (
          <EmptyState
            line="No repos yet — register the group’s repos and this becomes your shared window."
            action={
              <a class="pill" href={`#/g/${gid}/repos`}>
                Add repos →
              </a>
            }
          />
        ) : live.length === 0 ? (
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

      <ChecklistCard gid={gid} hasDiscord={hasDiscord} memberCount={members?.length ?? 1} />

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
          {members && <span class="sectionhead__count">{members.length}</span>}
          <span class="topbar__spacer" />
          {iAmAdmin && <Pill onClick={() => setInviteOpen(true)}>Invite people</Pill>}
          {me && <Chip tone={me.role === 'admin' ? 'accent' : 'default'}>you: {me.role}</Chip>}
        </div>
        {members === null ? (
          <span class="skeleton" />
        ) : members.length === 1 && iAmAdmin ? (
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
              {members.length} member{members.length === 1 ? '' : 's'} →
            </a>
          </div>
        )}
      </section>

      {inviteOpen && <InviteSheet gid={gid} onClose={() => setInviteOpen(false)} />}
      {skillsOpen && me && (
        <SkillsSheet
          gid={gid}
          me={me}
          myRepos={(repos ?? []).filter((r) => ownsRepo(r, me))}
          onClose={() => setSkillsOpen(false)}
        />
      )}
    </main>
  );
}
