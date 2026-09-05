import { useEffect, useState } from 'preact/hooks';
import { escalateToPublicRepo, sessionUser } from '../auth/session';
import { decideCollabRequest, watchMyRequests, watchOwnerInbox, type CollabRequest } from '../data/collabs';
import { myProfile } from '../data/users';
import { GhError } from '../github/client';
import { closeIssueWithComment, inviteCollaborator } from '../github/repos';
import { hasPublicRepoScope } from './CollabSheet';
import { notifyDiscord } from '../notify/discord';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import { log } from '../util/log';

const STATE_TONE = { pending: 'warn', accepted: 'accent', declined: 'default', cancelled: 'default' } as const;

/** GroupHome card: requests awaiting my decision + my own recent requests. */
export function CollabInbox({ gid }: { gid: string }) {
  const uid = sessionUser.value?.uid;
  const [inbox, setInbox] = useState<CollabRequest[]>([]);
  const [mine, setMine] = useState<CollabRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => (uid ? watchOwnerInbox(gid, uid, setInbox) : undefined), [gid, uid]);
  useEffect(() => (uid ? watchMyRequests(gid, uid, setMine) : undefined), [gid, uid]);

  const mineVisible = mine.filter((r) => r.state !== 'cancelled').slice(0, 5);
  if (inbox.length === 0 && mineVisible.length === 0) return null;

  async function decide(req: CollabRequest, state: 'accepted' | 'declined') {
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    if (state === 'accepted' && !hasPublicRepoScope()) {
      const ok = await escalateToPublicRepo();
      if (!ok) {
        toast('GitHub permission needed to send the invitation.', { error: true });
        return;
      }
    }
    setBusyId(req.id);
    try {
      await decideCollabRequest(gid, profile, req.id, state);
      try {
        if (state === 'accepted') {
          await inviteCollaborator(req.repoFullName, req.requesterLogin);
          if (req.githubIssueNumber)
            await closeIssueWithComment(
              req.repoFullName,
              req.githubIssueNumber,
              `@${req.requesterLogin} invited as a collaborator — check your GitHub notifications. _(via RepoCircle)_`,
            );
          toast(`Invitation sent to @${req.requesterLogin}`);
          notifyDiscord(gid, 'postCollabs', {
            title: `@${req.requesterLogin} is now a collaborator on ${req.repoFullName.split('/')[1]}`,
          });
        } else {
          if (req.githubIssueNumber)
            await closeIssueWithComment(
              req.repoFullName,
              req.githubIssueNumber,
              `Thanks for the interest — not taking collaborators on this one right now. _(via RepoCircle)_`,
            );
          toast('Request declined politely');
        }
      } catch (e) {
        log('warn', `github side of decision failed: ${e instanceof GhError ? e.kind : '?'}`);
        toast(
          state === 'accepted'
            ? 'Decision saved, but the GitHub invitation failed — send it manually from repo settings.'
            : 'Decision saved; closing the GitHub issue failed (harmless).',
          { error: true },
        );
      }
    } catch {
      toast('Could not record the decision.', { error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section class="card stack">
      <div class="label">Collab requests</div>
      {inbox.map((req) => (
        <div key={req.id} class="stack collab">
          <div class="row">
            <Avatar login={req.requesterLogin} src={`https://avatars.githubusercontent.com/${req.requesterLogin}`} />
            <span class="small">
              <b>@{req.requesterLogin}</b> → <span class="mono">{req.repoFullName.split('/')[1]}</span>
            </span>
            <span class="topbar__spacer" />
            {req.githubIssueNumber && (
              <a
                class="small"
                href={`https://github.com/${req.repoFullName}/issues/${req.githubIssueNumber}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                issue #{req.githubIssueNumber} ↗
              </a>
            )}
          </div>
          <p class="small dim collab__note">{req.note}</p>
          <div class="row">
            <Pill variant="primary" busy={busyId === req.id} onClick={() => void decide(req, 'accepted')}>
              Accept
            </Pill>
            <Pill variant="ghost" busy={busyId === req.id} onClick={() => void decide(req, 'declined')}>
              Decline
            </Pill>
          </div>
        </div>
      ))}
      {mineVisible.map((req) => (
        <div key={req.id} class="row collab">
          <span class="small dim">
            Your request → <span class="mono">{req.repoFullName.split('/')[1]}</span>
          </span>
          <span class="topbar__spacer" />
          <Chip tone={STATE_TONE[req.state]}>{req.state}</Chip>
        </div>
      ))}
    </section>
  );
}
