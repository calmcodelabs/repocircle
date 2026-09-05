import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import { claimAsk, unblockedThisWeek, watchMyAsks, watchMyClaims, watchNeedsHelp } from '../data/asks';
import { watchRepos } from '../data/repos';
import { myProfile } from '../data/users';
import type { Ask, Repo } from '../data/types';
import { toast } from '../ui/Toast';
import { notifyDiscord } from '../notify/discord';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pill } from '../ui/Pill';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ChecklistCard } from './ChecklistCard';
import { CollabInbox } from './CollabInbox';
import { sparkSeries } from '../poll/engine';
import { Spark } from '../ui/Spark';
import { langClass } from '../util/lang';
import { log } from '../util/log';
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
  const uid = sessionUser.value?.uid;
  const canWrite = !!me && me.role !== 'guest' && me.role !== 'alumnus';

  useEffect(
    () =>
      watchNeedsHelp(gid, setNeedsHelp, (code) => {
        log('warn', `asks watch: ${code}`);
      }),
    [gid],
  );
  useEffect(() => (uid ? watchMyAsks(gid, uid, setMyAsks) : undefined), [gid, uid]);
  useEffect(() => (uid ? watchMyClaims(gid, uid, setMyClaims) : undefined), [gid, uid]);
  useEffect(() => {
    void unblockedThisWeek(gid).then(setUnblocked).catch(() => undefined);
  }, [gid, needsHelp]);
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
      notifyDiscord(gid, 'postClaims', { title: `🤝 @${profile.login} claimed: ${ask.title}`, path: `#/g/${gid}/ask/${ask.id}` });
    } catch {
      toast('Claiming failed.', { error: true });
    }
  }

  useEffect(
    () =>
      watchRepos(gid, setRepos, (code) => {
        log('warn', `home repos watch: ${code}`);
      }),
    [gid],
  );

  const live = repos?.filter((r) => !r.archived && r.status !== 'paused' && r.status !== 'done') ?? [];
  const weekMs = Date.now() - 7 * 86_400_000;
  const active = live.filter((r) => (r.lastEventAt?.toMillis() ?? 0) >= weekMs);

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
            <span class={unblocked > 0 ? 'stat__value stat__value--accent' : 'stat__value'}>{unblocked}</span>
            <span class="stat__label">unblocked · 7d</span>
          </div>
        </div>
      </section>

      <section class="card stack rise-2">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">Active this week</span>
          {active.length > 0 && <span class="sectionhead__count">{active.length}</span>}
          <span class="topbar__spacer" />
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
                <span class="row">
                  <Spark series={sparkSeries(r.daily)} />
                  {r.lastEventAt && <span class="small faint">{relTime(r.lastEventAt)}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <ChecklistCard gid={gid} hasDiscord={hasDiscord} />

      <CollabInbox gid={gid} />

      <section class="card stack rise-3">
        <div class="sectionhead">
          <span class={needsHelp?.some((a) => a.kind === 'stuck') ? 'sectionhead__mark sectionhead__mark--warn' : 'sectionhead__mark'} />
          <span class="sectionhead__title">Needs help right now</span>
          {needsHelp && needsHelp.length > 0 && <span class="sectionhead__count">{needsHelp.length}</span>}
        </div>
        {needsHelp === null && <span class="skeleton" />}
        {needsHelp?.length === 0 && (
          <EmptyState icon="🙋" line="No asks yet — post the first one with the + button." />
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

      <section class="card stack rise-3">
        <div class="sectionhead">
          <span class="sectionhead__mark" />
          <span class="sectionhead__title">Your activity</span>
        </div>
        {myAsks.length === 0 && myClaims.length === 0 && (
          <EmptyState line="Asks you post and claims you make show up here." />
        )}
        {myAsks.slice(0, 5).map((a) => (
          <a key={a.id} class="row home__repo" href={`#/g/${gid}/ask/${a.id}`}>
            <span class="small">you asked: {a.title}</span>
            <span class="topbar__spacer" />
            <Chip tone={a.state === 'resolved' ? 'accent' : a.state === 'claimed' ? 'default' : 'warn'}>{a.state}</Chip>
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
          {me && <Chip tone={me.role === 'admin' ? 'accent' : 'default'}>you: {me.role}</Chip>}
        </div>
        {members === null ? (
          <span class="skeleton" />
        ) : (
          <div class="row home__avatars">
            {members.slice(0, 8).map((m) => (
              <Avatar key={m.uid} src={m.avatarUrl} login={m.login} />
            ))}
            <a class="small" href={`#/g/${gid}/members`}>
              {members.length} member{members.length === 1 ? '' : 's'} →
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
