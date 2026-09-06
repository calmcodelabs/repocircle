import { useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { createPoll } from '../data/polls';
import { myProfile } from '../data/users';
import { Sheet } from '../ui/Sheet';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';

/**
 * M19 — a poll decides a question (ADR-024). The framing here is the guardrail:
 * rules cannot tell a decision from a rating, so the composer asks for one and
 * says plainly what this is not for.
 */
export function PollComposer({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length >= 4 && filled.length >= 2;

  async function create() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !ready) return;
    setBusy(true);
    try {
      await createPoll(gid, profile, question, options);
      toast('Asked — the circle can vote now');
      onClose();
    } catch {
      toast('Could not create that poll.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="What should we decide?" onClose={onClose}>
      <div class="stack">
        <input
          class="input"
          placeholder="Which workshop should we run next?"
          maxLength={120}
          value={question}
          onInput={(e) => setQuestion((e.target as HTMLInputElement).value)}
        />
        {options.map((o, i) => (
          <input
            key={i}
            class="input"
            placeholder={`Option ${i + 1}`}
            maxLength={60}
            value={o}
            onInput={(e) =>
              setOptions(
                options.map((x, n) => (n === i ? (e.target as HTMLInputElement).value : x)),
              )
            }
          />
        ))}
        {options.length < 5 && (
          <Pill onClick={() => setOptions([...options, ''])}>Add an option</Pill>
        )}
        <span class="small faint">
          For choosing what the circle does next — not for ranking people or their projects.
          Everyone sees the result once they have voted.
        </span>
        <div class="row">
          <span class="topbar__spacer" />
          <Pill variant="primary" busy={busy} disabled={!ready} onClick={() => void create()}>
            Ask the circle
          </Pill>
        </div>
      </div>
    </Sheet>
  );
}
