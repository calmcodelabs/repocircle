import { useEffect, useState } from 'preact/hooks';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { getInvite, inviteState, type InviteState } from '../data/invites';
import { joinViaInvite } from '../data/members';
import { myProfile } from '../data/users';
import { navigate } from '../router';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
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
  const uid = sessionUser.value?.uid;

  useEffect(() => {
    let alive = true;
    void getInvite(gid, token).then((inv) => {
      if (alive) setInvite(inv);
    });
    return () => {
      alive = false;
    };
  }, [gid, token]);

  // Membership truth lives in the member doc, not in users/{me}.groupIds — a
  // removed member's mirror still lists the gid (admins can't write other
  // people's user docs), and the old mirror-based redirect turned their fresh
  // invite into a dead end. Ask the server; only a doc that exists redirects.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void getDocFromServer(doc(db(), `groups/${gid}/members/${uid}`))
      .then((snap) => {
        if (alive && snap.exists()) navigate(`#/g/${gid}`);
      })
      .catch(() => undefined); // denied ⇒ not a member — stay and offer the join
    return () => {
      alive = false;
    };
  }, [gid, uid]);

  async function onJoin() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!invite) return;
    if (!profile) {
      toast('Your profile is still loading — give it a second, then try again.', { error: true });
      return;
    }
    setBusy(true);
    try {
      await joinViaInvite(gid, invite, profile);
      toast(`Welcome to ${invite.groupName ?? 'the group'}`);
      navigate(`#/g/${gid}`);
    } catch (e) {
      toast(
        (e as Error)?.message === 'join-not-persisted'
          ? 'That didn’t save — check your connection and tap Join again.'
          : 'Joining failed — the invite may have just expired.',
        { error: true },
      );
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
          <>
            <div class="hero hero--dim stack join__card rise">
              <div class="row">
                {invite.createdByLogin && <Avatar login={invite.createdByLogin} />}
                <p class="small dim">
                  <b>@{invite.createdByLogin ?? 'Someone'}</b> invited you to
                </p>
              </div>
              <h2>{invite.groupName ?? 'a RepoCircle circle'}</h2>
              {invite.groupDescription && <p class="lead join__desc">{invite.groupDescription}</p>}
              {(invite.memberCount || invite.repoCount) && (
                <div class="stats stats--divided join__stats">
                  <div class="stat">
                    <span class="stat__value">{invite.memberCount ?? '–'}</span>
                    <span class="stat__label">
                      {invite.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <div class="stat">
                    <span class="stat__value">{invite.repoCount ?? '–'}</span>
                    <span class="stat__label">{invite.repoCount === 1 ? 'repo' : 'repos'}</span>
                  </div>
                </div>
              )}
              <div class="row join__role">
                <span class="small dim">You’ll join as</span>
                <Chip tone={invite.role === 'guest' ? 'default' : 'accent'}>{invite.role}</Chip>
              </div>
              <Pill variant="primary" big busy={busy} onClick={() => void onJoin()}>
                Join circle
              </Pill>
            </div>

            <section class="card stack join__what rise-2">
              <span class="hero__label">New here? This is RepoCircle</span>
              <div class="row join__point">
                <span class="tile tile--accent">
                  <Icon name="repo" />
                </span>
                <span class="small dim">
                  See every repo your circle is building, with real GitHub activity — no digging
                  through timelines.
                </span>
              </div>
              <div class="row join__point">
                <span class="tile tile--accent">
                  <Icon name="handshake" />
                </span>
                <span class="small dim">
                  Ask for a hand, or jump in on someone else’s work — one tap to request
                  collaborator access on GitHub.
                </span>
              </div>
              <div class="row join__point">
                <span class="tile">
                  <Icon name="users" />
                </span>
                <span class="small dim">
                  Private to this circle. Reads public repos only, and there are no scores, rankings
                  or leaderboards — anywhere.
                </span>
              </div>
            </section>
          </>
        ) : (
          <EmptyState
            line={STATE_LINE[state as Exclude<InviteState, 'valid'>]}
            action={<a href="#/">Go home</a>}
          />
        )}
      </main>
    </div>
  );
}
