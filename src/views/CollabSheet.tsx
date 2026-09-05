import { useState } from 'preact/hooks';
import { escalateToPublicRepo, sessionUser } from '../auth/session';
import { attachIssueNumber, createCollabRequest } from '../data/collabs';
import { myProfile, myUserDoc } from '../data/users';
import type { Repo } from '../data/types';
import { GhError } from '../github/client';
import { createCollabIssue } from '../github/repos';
import { notifyDiscord } from '../notify/discord';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';
import { log } from '../util/log';

export function hasPublicRepoScope(): boolean {
  return myUserDoc.value?.scopesGranted.includes('public_repo') ?? false;
}

/** S8 — request to collaborate: escalate scope if needed → GitHub issue → doc. */
export function CollabSheet({ gid, repo, onClose }: { gid: string; repo: Repo; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsScope, setNeedsScope] = useState(!hasPublicRepoScope());

  async function grantScope() {
    setBusy(true);
    const ok = await escalateToPublicRepo();
    setBusy(false);
    if (ok) setNeedsScope(false);
    else toast('GitHub didn’t grant the permission — try again.', { error: true });
  }

  async function submit() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    let reqId: string | null = null;
    try {
      reqId = await createCollabRequest(gid, profile, repo, note.trim());
      const backlink = `${location.origin}${location.pathname}#/g/${gid}/repo/${repo.id}`;
      const issue = await createCollabIssue(repo.fullName, profile.login, note.trim(), backlink);
      await attachIssueNumber(gid, reqId, issue.number);
      toast(`Request sent — issue #${issue.number} opened on ${repo.fullName}`);
      notifyDiscord(gid, 'postCollabs', {
        title: `@${profile.login} asked to collaborate on ${repo.fullName.split('/')[1]}`,
        path: `#/g/${gid}/repo/${repo.id}`,
      });
      onClose();
    } catch (e) {
      log('warn', `collab request failed: ${e instanceof GhError ? e.kind : 'firestore'}`);
      if (reqId) {
        // Doc exists but the GitHub issue didn't happen — honest partial state.
        toast('Request saved, but opening the GitHub issue failed. The owner will still see it here.', { error: true });
        onClose();
      } else {
        toast(e instanceof GhError ? e.message : 'Could not send the request.', { error: true });
        setBusy(false);
      }
    }
  }

  return (
    <Sheet title={`Collaborate on ${repo.fullName.split('/')[1]}`} onClose={onClose}>
      <div class="stack">
        {needsScope ? (
          <>
            <p class="small dim">
              To open the request issue on GitHub, RepoCircle needs the{' '}
              <span class="mono">public_repo</span> permission — it’s requested only now that you
              first need it, and never includes private repos.
            </p>
            <Pill variant="primary" busy={busy} onClick={() => void grantScope()}>
              Allow on GitHub
            </Pill>
          </>
        ) : (
          <>
            <Field
              label="Note to the owner"
              value={note}
              onInput={setNote}
              multiline
              maxLength={LIMITS.COLLAB_NOTE_MAX}
              placeholder="What would you like to help with?"
              autofocus
            />
            <p class="small faint">
              Opens a public issue on the repo and pings the owner here. They accept or decline;
              accepting sends you a real GitHub collaborator invitation.
            </p>
            <Pill variant="primary" busy={busy} disabled={note.trim().length === 0} onClick={() => void submit()}>
              Send request
            </Pill>
          </>
        )}
      </div>
    </Sheet>
  );
}
