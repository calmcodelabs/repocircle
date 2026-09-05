import { useEffect, useState } from 'preact/hooks';
import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import { watchRepos } from '../data/repos';
import type { Repo } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pill } from '../ui/Pill';
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
      <section class="home__head">
        {g === undefined ? (
          <span class="skeleton" />
        ) : (
          <>
            <h2>{g?.name}</h2>
            {g?.description && <p class="dim small">{g.description}</p>}
          </>
        )}
      </section>

      <section class="card stack">
        <div class="row">
          <div class="label">Active this week</div>
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

      <section class="card">
        <div class="label">Needs help right now</div>
        <EmptyState
          line="Asks and stuck flags land in M5 — the core loop of RepoCircle."
          action={
            <Pill disabled ariaLabel="Post an ask (arrives with M5)">
              + Ask · M5
            </Pill>
          }
        />
      </section>

      <section class="card stack">
        <div class="row">
          <div class="label">Members</div>
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
