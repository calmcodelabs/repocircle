import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pill } from '../ui/Pill';

/** Group Home, M1 edition: real tenancy, honest placeholders for M2/M3/M5 blocks. */
export function GroupHome({ gid }: { gid: string }) {
  const g = activeGroup.value;
  const members = activeMembers.value;
  const me = myMembership.value;

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

      <section class="card">
        <div class="label">Active this week</div>
        <EmptyState
          line="Register the group’s repos — activity sparklines light this up in M3."
          action={
            <a class="pill" href={`#/g/${gid}/repos`}>
              Add repos →
            </a>
          }
        />
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
