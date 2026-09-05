import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { myMembership } from '../data/activeGroup';
import { addInterest, removeInterest, watchInterests } from '../data/repos';
import { myProfile } from '../data/users';
import type { Repo, RepoInterest } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { toast } from '../ui/Toast';

/**
 * The light signal: "this looks good, I'd help." Deliberately one tap — the
 * collaborator request (which opens a GitHub issue) is far too heavy for the
 * moment someone first likes an idea.
 */
export function InterestButton({ gid, repo }: { gid: string; repo: Repo }) {
  const [interests, setInterests] = useState<RepoInterest[]>([]);
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;
  const me = myMembership.value;
  const canWrite = !!me && me.role !== 'guest' && me.role !== 'alumnus';
  const mine = !!uid && interests.some((i) => i.uid === uid);
  const isOwner = repo.ownerUid === uid;

  useEffect(() => watchInterests(gid, repo.id, setInterests), [gid, repo.id]);

  async function toggle() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    try {
      if (mine) await removeInterest(gid, repo.id, profile.uid, interests.length);
      else {
        await addInterest(gid, repo.id, profile, interests.length);
        toast(`@${repo.githubOwnerLogin} will see you’re interested`);
      }
    } catch {
      toast('Could not save that — check your connection.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="row interest">
      {interests.length > 0 && (
        <span class="row interest__faces">
          {interests.slice(0, 5).map((i) => (
            <Avatar key={i.uid} login={i.login} src={i.avatarUrl} />
          ))}
          <span class="small faint">
            {interests.length} interested
            {isOwner && interests.length > 0 ? ' — invite them from the card menu' : ''}
          </span>
        </span>
      )}
      <span class="topbar__spacer" />
      {canWrite && !isOwner && (
        <button
          class={`chip ${mine ? 'chip--accent' : ''} interest__btn`}
          aria-pressed={mine}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {mine ? 'Interested' : 'I’m interested'}
        </button>
      )}
    </div>
  );
}
