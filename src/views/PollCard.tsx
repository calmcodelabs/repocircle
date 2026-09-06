import { useEffect, useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { myMembership } from '../data/activeGroup';
import { castVote, closePoll, totalVotes, watchMyVote, watchOpenPoll } from '../data/polls';
import { canWriteRole, type Poll } from '../data/types';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';

/**
 * M19 — a poll (ADR-024). The circle deciding something together: which
 * workshop, when to demo. Never a rating — the options are things to do, not
 * people or their work.
 *
 * Results appear only once your own vote is in. That is not coyness: seeing
 * the running total first is how a poll stops measuring what people think and
 * starts measuring what they think everyone else thinks.
 */
export function PollCard({ gid }: { gid: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;
  const canWrite = canWriteRole(myMembership.value);
  const iAmAdmin = myMembership.value?.role === 'admin';

  useEffect(() => watchOpenPoll(gid, setPoll), [gid]);
  useEffect(() => {
    if (!poll || !uid) return;
    return watchMyVote(gid, poll.id, uid, (v) => setMyVote(v?.optionKey ?? null));
  }, [gid, poll?.id, uid]);

  if (!poll) return null;
  const total = totalVotes(poll);
  const voted = myVote !== null;
  const keys = Object.keys(poll.options);

  async function vote(key: string) {
    if (!uid || !poll) return;
    setBusy(true);
    try {
      await castVote(gid, poll.id, uid, key, myVote);
    } catch {
      toast('Could not record that vote.', { error: true });
    }
    setBusy(false);
  }

  return (
    <section class="card stack rise-2">
      <div class="sectionhead">
        <span class="sectionhead__mark" />
        <span class="sectionhead__title">Deciding together</span>
        <span class="topbar__spacer" />
        {(iAmAdmin || poll.authorUid === uid) && (
          <Pill
            variant="ghost"
            onClick={() =>
              void closePoll(gid, poll.id)
                .then(() => toast('Closed'))
                .catch(() => toast('Could not close it.', { error: true }))
            }
          >
            Close
          </Pill>
        )}
      </div>
      <strong>{poll.question}</strong>
      {keys.map((k) => {
        const o = poll.options[k]!;
        const pct = voted && total > 0 ? Math.round(((o.count ?? 0) / total) * 100) : 0;
        return (
          <button
            key={k}
            class={`poll__opt ${myVote === k ? 'poll__opt--mine' : ''}`}
            disabled={!canWrite || busy}
            aria-pressed={myVote === k}
            onClick={() => void vote(k)}
          >
            {voted && <span class="poll__bar" style={{ width: `${pct}%` }} aria-hidden="true" />}
            <span class="poll__label">{o.label}</span>
            {voted && <span class="small faint poll__pct">{pct}%</span>}
          </button>
        );
      })}
      <span class="small faint">
        {/* Class G: "no votes yet" and "you haven't voted yet" are different facts. */}
        {voted
          ? `${total} ${total === 1 ? 'vote' : 'votes'} · tap another option to change yours`
          : canWrite
            ? 'Pick one to see where the circle landed.'
            : 'Guests can see the question but not vote.'}
      </span>
    </section>
  );
}
