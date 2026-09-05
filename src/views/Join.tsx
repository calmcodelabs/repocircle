import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { getInvite, inviteState, type InviteState } from '../data/invites';
import { joinViaInvite } from '../data/members';
import { myProfile, myUserDoc } from '../data/users';
import { navigate } from '../router';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Mark } from '../ui/Mark';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import type { Invite } from '../data/types';

const STATE_LINE: Record<Exclude<InviteState, 'valid'>, string> = {
  missing: 'This invite link doesn’t exist — ask for a fresh one.',
  expired: 'This invite has expired — ask for a fresh link.',
  revoked: 'This invite was revoked — ask for a fresh link.',
};

/** #/join/:gid/:token — greet, validate, join. */
export function Join({ gid, token }: { gid: string; token: string }) {
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const alreadyIn = myUserDoc.value?.groupIds.includes(gid) ?? false;

  useEffect(() => {
    let alive = true;
    void getInvite(gid, token).then((inv) => {
      if (alive) setInvite(inv);
    });
    return () => {
      alive = false;
    };
  }, [gid, token]);

  useEffect(() => {
    if (alreadyIn) navigate(`#/g/${gid}`);
  }, [alreadyIn, gid]);

  async function onJoin() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !invite) return;
    setBusy(true);
    try {
      await joinViaInvite(gid, invite, profile);
      toast(`Welcome to ${invite.groupName ?? 'the group'}`);
      navigate(`#/g/${gid}`);
    } catch {
      toast('Joining failed — the invite may have just expired. Check #/diag.', { error: true });
      setBusy(false);
    }
  }

  if (invite === undefined) {
    return (
      <div class="app join">
        <div class="stack join__panel">
          <span class="skeleton" />
          <span class="skeleton" />
        </div>
      </div>
    );
  }

  const state = inviteState(invite);

  return (
    <div class="app join">
      <div class="halo" />
      <main class="join__panel">
        <Mark size={44} />
        {state === 'valid' && invite ? (
          <div class="card stack join__card">
            <div class="row">
              {invite.createdByLogin && <Avatar login={invite.createdByLogin} />}
              <p>
                <b>{invite.createdByLogin ?? 'Someone'}</b> invited you to
              </p>
            </div>
            <h2>{invite.groupName ?? 'a RepoCircle group'}</h2>
            <div class="row">
              <span class="small dim">You’ll join as</span>
              <Chip tone={invite.role === 'guest' ? 'default' : 'accent'}>{invite.role}</Chip>
            </div>
            <Pill variant="primary" big busy={busy} onClick={() => void onJoin()}>
              Join group
            </Pill>
          </div>
        ) : (
          <EmptyState line={STATE_LINE[state as Exclude<InviteState, 'valid'>]} action={<a href="#/">Go home</a>} />
        )}
      </main>
    </div>
  );
}
