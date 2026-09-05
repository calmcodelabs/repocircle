import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import { updateGroupProfile } from '../data/groups';
import { createInvite, inviteState, inviteUrl, revokeInvite, watchInvites } from '../data/invites';
import { leaveGroup } from '../data/members';
import { myProfile } from '../data/users';
import type { Invite } from '../data/types';
import { navigate } from '../router';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';
import { relTime } from '../util/time';

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied');
  } catch {
    toast('Copy failed — long-press / right-click the link instead.', { error: true });
  }
}

export function GroupSettings({ gid }: { gid: string }) {
  const me = myMembership.value;
  const iAmAdmin = me?.role === 'admin';

  return (
    <main class="stack">
      <h2>Settings</h2>
      {iAmAdmin && <ProfileCard gid={gid} />}
      {iAmAdmin && <InvitesCard gid={gid} />}
      <LeaveCard gid={gid} />
      {!iAmAdmin && (
        <p class="small faint">Group profile and invites are managed by admins.</p>
      )}
    </main>
  );
}

function ProfileCard({ gid }: { gid: string }) {
  const g = activeGroup.value;
  const [name, setName] = useState(g?.name ?? '');
  const [desc, setDesc] = useState(g?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty && g) {
      setName(g.name);
      setDesc(g.description);
    }
  }, [g, dirty]);

  const nameOk = name.trim().length >= LIMITS.GROUP_NAME_MIN;

  async function save() {
    setBusy(true);
    try {
      await updateGroupProfile(gid, name.trim(), desc.trim());
      toast('Group updated');
      setDirty(false);
    } catch {
      toast('Saving failed.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Profile</h3>
      <Field label="Name" value={name} onInput={(v) => { setName(v); setDirty(true); }} maxLength={LIMITS.GROUP_NAME_MAX} />
      <Field label="Description" value={desc} onInput={(v) => { setDesc(v); setDirty(true); }} maxLength={LIMITS.GROUP_DESC_MAX} />
      <Pill variant="primary" disabled={!nameOk || !dirty} busy={busy} onClick={() => void save()}>
        Save
      </Pill>
    </section>
  );
}

function InvitesCard({ gid }: { gid: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [role, setRole] = useState<'member' | 'guest'>('member');
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => watchInvites(gid, setInvites), [gid]);

  async function onCreate() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    const groupName = activeGroup.value?.name;
    if (!profile || !groupName) return;
    setBusy(true);
    try {
      const token = await createInvite(gid, profile, groupName, role, days, label.trim());
      setFresh(inviteUrl(gid, token));
      setLabel('');
    } catch {
      toast('Could not create invite.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Invite links</h3>
      <div class="row wrap">
        <div class="segmented" role="group" aria-label="Invite role">
          {(['member', 'guest'] as const).map((r) => (
            <button key={r} class="segmented__btn" aria-pressed={role === r} onClick={() => setRole(r)}>
              {r}
            </button>
          ))}
        </div>
        <div class="segmented" role="group" aria-label="Expires">
          {([1, 7, 30] as const).map((d) => (
            <button key={d} class="segmented__btn" aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 1 ? '24h' : `${d}d`}
            </button>
          ))}
        </div>
      </div>
      <Field label="Label (just for you)" value={label} onInput={setLabel} maxLength={LIMITS.INVITE_LABEL_MAX} placeholder="posted in club Discord" />
      <Pill variant="primary" busy={busy} onClick={() => void onCreate()}>
        Create invite link
      </Pill>

      {invites === null && <span class="skeleton" />}
      {invites?.length === 0 && <EmptyState line="No invites yet — create the first one above." />}
      {invites?.map((inv) => {
        const st = inviteState(inv);
        return (
          <div key={inv.token} class="row invite">
            <div class="invite__meta">
              <div class="row">
                <span class="small">{inv.label || 'unlabeled'}</span>
                <Chip tone={inv.role === 'guest' ? 'default' : 'accent'}>{inv.role}</Chip>
                {st !== 'valid' && <Chip tone="danger">{st}</Chip>}
              </div>
              <span class="small faint">
                {st === 'valid' ? `expires ${relTime(inv.expiresAt)}` : `created by @${inv.createdByLogin ?? '?'}`}
              </span>
            </div>
            <span class="topbar__spacer" />
            {st === 'valid' && (
              <>
                <Pill onClick={() => void copyText(inviteUrl(gid, inv.token))}>Copy</Pill>
                <Pill
                  variant="ghost"
                  onClick={() => {
                    const uid = sessionUser.value?.uid;
                    const profile = uid ? myProfile(uid) : null;
                    if (profile) void revokeInvite(gid, profile, inv.token).then(() => toast('Invite revoked'));
                  }}
                >
                  Revoke
                </Pill>
              </>
            )}
          </div>
        );
      })}

      {fresh && (
        <Sheet title="Invite link ready" onClose={() => setFresh(null)}>
          <div class="stack">
            <p class="small dim">Anyone with this link can join until it expires — share it in your group’s chat.</p>
            <p class="mono small invite__url">{fresh}</p>
            <Pill variant="primary" onClick={() => void copyText(fresh)}>
              Copy link
            </Pill>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function LeaveCard({ gid }: { gid: string }) {
  const me = myMembership.value;
  const members = activeMembers.value ?? [];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const admins = members.filter((m) => m.role === 'admin');
  const lastAdminWithOthers = me?.role === 'admin' && admins.length === 1 && members.length > 1;

  async function onLeave() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    try {
      await leaveGroup(gid, profile);
      toast('You left the group');
      navigate('#/');
    } catch {
      toast('Leaving failed — check #/diag.', { error: true });
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Leave group</h3>
      {lastAdminWithOthers ? (
        <p class="small dim">
          You’re the only admin. Promote another member first (Members → ⋯ → role), then you can
          leave.
        </p>
      ) : (
        <p class="small dim">
          Your posts stay but are anonymized (“left the group”). Rejoining needs a fresh invite.
          {members.length === 1 && ' You’re the last member — the group becomes unreachable.'}
        </p>
      )}
      {confirming ? (
        <Pill variant="danger" busy={busy} disabled={lastAdminWithOthers} onClick={() => void onLeave()}>
          Yes, leave {activeGroup.value?.name ?? 'this group'}
        </Pill>
      ) : (
        <Pill variant="danger" disabled={lastAdminWithOthers} onClick={() => setConfirming(true)}>
          Leave group…
        </Pill>
      )}
    </section>
  );
}
