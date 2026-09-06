import { useEffect, useMemo, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { myMembership } from '../data/activeGroup';
import { cancelSession, rsvp, unrsvp, watchRsvps, watchUpcomingSessions } from '../data/sessions';
import { myProfile } from '../data/users';
import { canWriteRole, type RepoInterest, type Session } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import { buildIcs, downloadIcs } from '../util/ics';
import { relTime } from '../util/time';

/**
 * M19 — Coming up (ADR-023). The co-working ritual a cohort actually has:
 * someone says when they will be building, and other people say they will be
 * there. RSVPs land in the host's away-inbox for free, because they are
 * `interests` documents like every other raised hand.
 *
 * Reminders are visit-time only. Sending one needs a server, which is the
 * Phase-3 Worker; a calendar file needs nothing, so that is what ships.
 */
function SessionRow({ gid, session }: { gid: string; session: Session }) {
  const [rsvps, setRsvps] = useState<RepoInterest[]>([]);
  const uid = sessionUser.value?.uid;
  const canWrite = canWriteRole(myMembership.value);
  const iAmHost = session.hostUid === uid;
  const iAmAdmin = myMembership.value?.role === 'admin';

  useEffect(() => watchRsvps(gid, session.id, setRsvps), [gid, session.id]);
  const going = useMemo(() => rsvps.some((r) => r.uid === uid), [rsvps, uid]);

  async function toggle() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    try {
      if (going) await unrsvp(gid, session.id, profile.uid);
      else await rsvp(gid, session, profile);
    } catch {
      toast('Could not change that.', { error: true });
    }
  }

  const starts = session.startsAt.toDate();
  return (
    <div class={`stack session ${session.cancelled ? 'session--off' : ''}`}>
      <div class="row">
        <span class="session__when">{starts.toLocaleString()}</span>
        <span class="topbar__spacer" />
        {session.cancelled ? (
          <Chip tone="warn">cancelled</Chip>
        ) : (
          <span class="small faint">{relTime(session.startsAt)}</span>
        )}
      </div>
      <div class="row">
        <strong>{session.title}</strong>
        <span class="topbar__spacer" />
        <span class="small faint">@{session.hostLogin}</span>
      </div>
      {session.detail && <span class="small dim">{session.detail}</span>}
      {session.url && (
        <a class="small" href={session.url} target="_blank" rel="noopener noreferrer nofollow">
          Where it happens →
        </a>
      )}
      <div class="row session__acts">
        <span class="row home__faces">
          {rsvps.slice(0, 5).map((r) => (
            <Avatar key={r.uid} login={r.login} src={r.avatarUrl} />
          ))}
        </span>
        {/* Who is coming, named — never a score on anybody (ADR-019). */}
        {rsvps.length > 0 && <span class="small faint">{rsvps.length} coming</span>}
        <span class="topbar__spacer" />
        <Pill
          variant="ghost"
          onClick={() =>
            downloadIcs(
              `${session.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`,
              buildIcs([
                {
                  uid: session.id,
                  title: session.title,
                  description: session.detail,
                  url: session.url,
                  startsAt: starts,
                  durationMin: session.durationMin,
                },
              ]),
            )
          }
        >
          Add to calendar
        </Pill>
        {canWrite && !session.cancelled && !iAmHost && (
          <Pill variant={going ? 'ghost' : 'primary'} onClick={() => void toggle()}>
            {going ? 'Not coming' : "I'll be there"}
          </Pill>
        )}
        {(iAmHost || iAmAdmin) && !session.cancelled && (
          <Pill
            variant="ghost"
            onClick={() =>
              void cancelSession(gid, session.id)
                .then(() => toast('Cancelled — everyone who RSVPd will see it'))
                .catch(() => toast('Could not cancel that.', { error: true }))
            }
          >
            Cancel
          </Pill>
        )}
      </div>
    </div>
  );
}

export function ComingUp({ gid }: { gid: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => watchUpcomingSessions(gid, setSessions), [gid]);
  if (sessions.length === 0) return null;
  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Coming up</span>
        <span class="sectionhead__count">{sessions.length}</span>
        <span class="topbar__spacer" />
        <Pill
          variant="ghost"
          onClick={() =>
            downloadIcs(
              'repocircle-sessions.ics',
              buildIcs(
                sessions.map((s) => ({
                  uid: s.id,
                  title: s.title,
                  description: s.detail,
                  url: s.url,
                  startsAt: s.startsAt.toDate(),
                  durationMin: s.durationMin,
                })),
              ),
            )
          }
        >
          All to calendar
        </Pill>
      </div>
      {sessions.map((s) => (
        <SessionRow key={s.id} gid={gid} session={s} />
      ))}
    </section>
  );
}
