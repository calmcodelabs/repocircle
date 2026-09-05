import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { myMembership } from '../data/activeGroup';
import { claimAsk, deleteAsk, reopenAsk, resolveAsk, unclaimAsk, watchAsk, watchClaims } from '../data/asks';
import { myProfile } from '../data/users';
import type { Ask, AskClaim } from '../data/types';
import { notifyDiscord } from '../notify/discord';
import { navigate } from '../router';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { StatusDot } from '../ui/StatusDot';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';
import { relTime } from '../util/time';

/** S6 — full ask: claims with notes, resolve/reopen/delete by author or admin. */
export function AskDetail({ gid, askId }: { gid: string; askId: string }) {
  const [ask, setAsk] = useState<Ask | null | undefined>(undefined);
  const [claims, setClaims] = useState<AskClaim[]>([]);
  const [claimNote, setClaimNote] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const uid = sessionUser.value?.uid;
  const me = myMembership.value;
  const canWrite = !!me && me.role !== 'guest' && me.role !== 'alumnus';
  const isAuthor = !!ask && ask.authorUid === uid;
  const isAdmin = me?.role === 'admin';
  const iClaimed = !!uid && claims.some((c) => c.uid === uid);

  useEffect(() => watchAsk(gid, askId, setAsk), [gid, askId]);
  useEffect(() => watchClaims(gid, askId, setClaims), [gid, askId]);

  if (ask === undefined) return <span class="skeleton" />;
  if (ask === null)
    return <EmptyState line="This ask is gone — resolved and tidied, or deleted." action={<a href={`#/g/${gid}`}>Home</a>} />;

  async function doClaim() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !ask) return;
    setBusy(true);
    try {
      await claimAsk(gid, ask, profile, claimNote);
      toast(`You’re on it — @${ask.authorLogin} will see your claim`);
      notifyDiscord(gid, 'postClaims', {
        title: `🤝 @${profile.login} claimed: ${ask.title}`,
        path: `#/g/${gid}/ask/${ask.id}`,
      });
      setClaiming(false);
      setClaimNote('');
    } catch {
      toast('Claiming failed.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function doResolve() {
    if (!ask) return;
    setBusy(true);
    try {
      await resolveAsk(gid, ask.id);
      toast('Resolved — one more unblocked 🎉');
      notifyDiscord(gid, 'postClaims', { title: `✅ Resolved: ${ask.title}`, path: `#/g/${gid}/ask/${ask.id}` });
    } catch {
      toast('Resolving failed.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="stack">
      <section class="card stack">
        <div class="row">
          <StatusDot tone={ask.kind === 'stuck' ? 'warn' : ask.state === 'resolved' ? 'accent' : 'accent'} />
          <Chip tone={ask.kind === 'stuck' ? 'warn' : 'default'}>{ask.kind}</Chip>
          <Chip tone={ask.state === 'resolved' ? 'accent' : ask.state === 'claimed' ? 'default' : 'warn'}>
            {ask.state}
          </Chip>
          <span class="topbar__spacer" />
          <span class="small faint">{relTime(ask.createdAt)}</span>
        </div>
        <h2>{ask.title}</h2>
        {ask.detail && <p class="dim">{ask.detail}</p>}
        <div class="row wrap">
          {ask.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
          {ask.repoId && (
            <a class="small" href={`#/g/${gid}/repo/${ask.repoId}`}>
              view repo →
            </a>
          )}
          {ask.pairingUrl && (
            <a class="small" href={ask.pairingUrl} target="_blank" rel="noopener noreferrer nofollow">
              pair here ↗
            </a>
          )}
        </div>
        <div class="row small dim">
          <Avatar login={ask.authorLogin} src={ask.authorAvatarUrl} />
          <span>@{ask.authorLogin} asked</span>
        </div>
      </section>

      <section class="card stack">
        <div class="label">Claims</div>
        {claims.length === 0 && <EmptyState line={ask.state === 'resolved' ? 'Resolved without a claim.' : 'Nobody yet — be the one.'} />}
        {claims.map((c) => (
          <div key={c.uid} class="row">
            <Avatar login={c.login} src={c.avatarUrl} />
            <div class="small">
              <div>@{c.login}</div>
              {c.note && <div class="dim">{c.note}</div>}
            </div>
            <span class="topbar__spacer" />
            <span class="small faint">{relTime(c.claimedAt)}</span>
          </div>
        ))}

        {canWrite && ask.state !== 'resolved' && !iClaimed && !claiming && !isAuthor && (
          <Pill variant="primary" onClick={() => setClaiming(true)}>
            Claim this
          </Pill>
        )}
        {claiming && (
          <div class="stack">
            <Field
              label="Add a note (optional)"
              value={claimNote}
              onInput={setClaimNote}
              maxLength={LIMITS.CLAIM_NOTE_MAX}
              placeholder="on it tonight — ping me on Discord"
              autofocus
            />
            <div class="row">
              <Pill variant="primary" busy={busy} onClick={() => void doClaim()}>
                Claim
              </Pill>
              <Pill variant="ghost" onClick={() => setClaiming(false)}>
                Cancel
              </Pill>
            </div>
          </div>
        )}
        {iClaimed && ask.state !== 'resolved' && (
          <Pill variant="ghost" busy={busy} onClick={() => void unclaimAsk(gid, ask, uid!).then(() => toast('Unclaimed'))}>
            Unclaim
          </Pill>
        )}
      </section>

      {(isAuthor || isAdmin) && (
        <section class="card stack">
          <div class="label">{isAuthor ? 'Your ask' : 'Moderation'}</div>
          <div class="row wrap">
            {ask.state !== 'resolved' ? (
              <Pill variant="primary" busy={busy} onClick={() => void doResolve()}>
                Mark resolved
              </Pill>
            ) : (
              isAuthor && (
                <Pill busy={busy} onClick={() => void reopenAsk(gid, ask.id).then(() => toast('Reopened'))}>
                  Reopen
                </Pill>
              )
            )}
            {confirmDelete ? (
              <Pill variant="danger" busy={busy} onClick={() => void deleteAsk(gid, ask.id).then(() => navigate(`#/g/${gid}`))}>
                Really delete
              </Pill>
            ) : (
              <Pill variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Pill>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
