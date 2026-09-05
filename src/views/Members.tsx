import { useEffect, useState } from 'preact/hooks';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Timestamp } from 'firebase/firestore';
import { sessionUser } from '../auth/session';
import { activeMembers, myMembership } from '../data/activeGroup';
import { removeMember, setAvailability, setRole } from '../data/members';
import { myProfile } from '../data/users';
import { AVAILABILITY_LABEL, ROLE_LABEL, type Availability, type AvailabilityStatus, type Member, type Role } from '../data/types';
import { InviteSheet } from './InviteManager';
import { setRepoSyncMode } from '../data/repoSync';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { StatusDot } from '../ui/StatusDot';
import { toast } from '../ui/Toast';

const STATUSES: AvailabilityStatus[] = ['free', 'heads_down', 'away', 'custom'];
const ROLES: Role[] = ['admin', 'mentor', 'member', 'guest', 'alumnus'];

function availabilityText(m: Member): string {
  const a = m.availability;
  const base = a.status === 'custom' ? a.note || 'custom' : (AVAILABILITY_LABEL[a.status] ?? 'available');
  return a.until ? `${base} until ${a.until.toDate().toLocaleDateString()}` : base;
}

/** S9 — member list with self availability + admin role/remove controls. */
export function Members({ gid }: { gid: string }) {
  const members = activeMembers.value;
  const me = myMembership.value;
  const iAmAdmin = me?.role === 'admin';
  const [editAvail, setEditAvail] = useState(false);
  const [manage, setManage] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const uid = sessionUser.value?.uid;
    if (uid)
      void updateDoc(doc(db(), `groups/${gid}/members/${uid}`), { 'checklist.visitedMembers': true }).catch(
        () => undefined,
      );
  }, [gid]);

  return (
    <main class="stack">
      <div class="row">
        <h2>Members</h2>
        {members && <span class="sectionhead__count">{members.length}</span>}
        <span class="topbar__spacer" />
        {iAmAdmin && (
          <Pill variant="primary" onClick={() => setInviteOpen(true)}>
            Invite people
          </Pill>
        )}
      </div>

      {me && (
        <section class="card stack">
          <div class="sectionhead">
            <span class="sectionhead__mark" />
            <span class="sectionhead__title">Your repos in this circle</span>
          </div>
          <div class="row wrap">
            <div class="segmented" role="group" aria-label="Repo sharing">
              <button
                class="segmented__btn"
                aria-pressed={me.repoSync?.mode === 'auto'}
                onClick={() =>
                  void setRepoSyncMode(gid, me.uid, 'auto').then(() =>
                    toast('Sharing automatically — new public repos will appear here'),
                  )
                }
              >
                Share automatically
              </button>
              <button
                class="segmented__btn"
                aria-pressed={me.repoSync?.mode !== 'auto'}
                onClick={() =>
                  void setRepoSyncMode(gid, me.uid, 'manual').then(() =>
                    toast('You’ll add repos yourself'),
                  )
                }
              >
                Choose manually
              </button>
            </div>
            <span class="topbar__spacer" />
            <a class="small" href={`#/g/${gid}/repos`}>
              Manage repos →
            </a>
          </div>
          <p class="small faint">
            {me.repoSync?.mode === 'auto'
              ? 'Your public repos are shared with this circle, including ones you create later. Remove any and it stays removed. Private repos are never accessed.'
              : 'You pick which repos this circle sees. Nothing is shared until you add it.'}
          </p>
        </section>
      )}

      {iAmAdmin && members?.length === 1 && (
        <section class="hero hero--dim stack rise">
          <span class="hero__label">It’s just you so far</span>
          <h3>Bring your circle in</h3>
          <p class="small dim">
            RepoCircle only works with people in it — share an invite link and your friends’ repos
            and asks start showing up here.
          </p>
          <div>
            <Pill variant="primary" big onClick={() => setInviteOpen(true)}>
              Create an invite link
            </Pill>
          </div>
        </section>
      )}
      {members === null && <span class="skeleton" />}
      {members?.length === 0 && <EmptyState line="Nobody here yet — share an invite link from Settings." />}
      {members?.map((m) => {
        const isMe = m.uid === sessionUser.value?.uid;
        return (
          <div key={m.uid} class="card row member">
            <Avatar src={m.avatarUrl} login={m.login} large />
            <div class="member__id">
              <div class="row">
                <span>{m.name || m.login}</span>
                {m.role !== 'member' && (
                  <Chip tone={m.role === 'admin' ? 'accent' : 'default'}>{ROLE_LABEL[m.role]}</Chip>
                )}
              </div>
              <div class="row small dim">
                <span class="mono">@{m.login}</span>
                <StatusDot tone={m.availability.status === 'free' ? 'accent' : m.availability.status === 'away' ? 'warn' : 'idle'} />
                <span>{availabilityText(m)}</span>
              </div>
            </div>
            <span class="topbar__spacer" />
            {isMe ? (
              <Pill onClick={() => setEditAvail(true)}>Availability</Pill>
            ) : iAmAdmin ? (
              <Pill variant="ghost" onClick={() => setManage(m)} ariaLabel={`Manage ${m.login}`}>
                ⋯
              </Pill>
            ) : null}
          </div>
        );
      })}

      {editAvail && me && (
        <AvailabilitySheet
          gid={gid}
          current={me.availability}
          onClose={() => setEditAvail(false)}
        />
      )}
      {manage && <ManageSheet gid={gid} target={manage} onClose={() => setManage(null)} />}
      {inviteOpen && <InviteSheet gid={gid} onClose={() => setInviteOpen(false)} />}
    </main>
  );
}

function AvailabilitySheet({ gid, current, onClose }: { gid: string; current: Availability; onClose: () => void }) {
  const [status, setStatus] = useState<AvailabilityStatus>(current.status);
  const [note, setNote] = useState(current.note ?? '');
  const [until, setUntil] = useState(current.until ? current.until.toDate().toISOString().slice(0, 10) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const uid = sessionUser.value?.uid;
    if (!uid) return;
    setBusy(true);
    const availability: Availability = {
      status,
      ...(status === 'custom' && note.trim() ? { note: note.trim().slice(0, 60) } : {}),
      ...(until ? { until: Timestamp.fromDate(new Date(`${until}T23:59:59`)) } : {}),
    };
    try {
      await setAvailability(gid, uid, availability);
      void updateDoc(doc(db(), `groups/${gid}/members/${uid}`), { 'checklist.setAvailability': true }).catch(
        () => undefined,
      );
      toast('Availability updated');
      onClose();
    } catch {
      toast('Could not save availability.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="Your availability" onClose={onClose}>
      <div class="stack">
        <div class="segmented" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button key={s} class="segmented__btn" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {AVAILABILITY_LABEL[s]}
            </button>
          ))}
        </div>
        {status === 'custom' && (
          <Field label="Say it your way" value={note} onInput={setNote} maxLength={60} placeholder="pairing Fridays only" />
        )}
        <label class="field">
          <span class="field__label">Until (optional)</span>
          <input class="field__input" type="date" value={until} onInput={(e) => setUntil((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <Pill variant="primary" busy={busy} onClick={() => void save()}>
          Save
        </Pill>
      </div>
    </Sheet>
  );
}

function ManageSheet({ gid, target, onClose }: { gid: string; target: Member; onClose: () => void }) {
  const [role, setRoleSel] = useState<Role>(target.role);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  async function applyRole() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    try {
      await setRole(gid, profile, target, role);
      toast(`@${target.login} is now ${ROLE_LABEL[role]}`);
      onClose();
    } catch {
      toast('Role change failed.', { error: true });
      setBusy(false);
    }
  }

  async function doRemove() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    try {
      await removeMember(gid, profile, target);
      toast(`@${target.login} removed`);
      onClose();
    } catch {
      toast('Removal failed.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title={`@${target.login}`} onClose={onClose}>
      <div class="stack">
        <div class="field">
          <span class="field__label">Role</span>
          <div class="segmented" role="group" aria-label="Role">
            {ROLES.map((r) => (
              <button key={r} class="segmented__btn" aria-pressed={role === r} onClick={() => setRoleSel(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <span class="field__hint">guest and alumnus are read-only roles</span>
        </div>
        <Pill variant="primary" busy={busy} disabled={role === target.role} onClick={() => void applyRole()}>
          Change role
        </Pill>
        <hr class="rule" />
        {confirmRemove ? (
          <div class="stack">
            <p class="small dim">
              Remove @{target.login} from the group? Their posts stay (anonymization happens only
              when someone leaves by choice). They can rejoin with a fresh invite.
            </p>
            <Pill variant="danger" busy={busy} onClick={() => void doRemove()}>
              Yes, remove @{target.login}
            </Pill>
          </div>
        ) : (
          <Pill variant="danger" onClick={() => setConfirmRemove(true)}>
            Remove from group
          </Pill>
        )}
      </div>
    </Sheet>
  );
}
