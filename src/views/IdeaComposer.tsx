import { useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { addIdea } from '../data/ideas';
import { myProfile } from '../data/users';
import { DOMAIN_TAGS, REPO_NEEDS, type RepoNeed } from '../data/types';
import { navigate } from '../router';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { notifyDiscord } from '../notify/discord';

/** M15 — pitch an idea before any code exists. */
export function IdeaComposer({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [detail, setDetail] = useState('');
  const [needs, setNeeds] = useState<RepoNeed | null>('anything');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleTag(t: string) {
    const next = new Set(tags);
    if (next.has(t)) next.delete(t);
    else if (next.size < 4) next.add(t);
    setTags(next);
  }

  async function post() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    if (title.trim().length < 4) {
      setError('Give it a name — four characters or more.');
      return;
    }
    if (pitch.trim().length < 4) {
      setError('The one-line pitch is the whole point — what is it?');
      return;
    }
    setBusy(true);
    try {
      const id = await addIdea(gid, profile, {
        title,
        pitch,
        detail,
        domainTags: [...tags],
        needs,
      });
      toast('Idea pitched — the circle can see it now');
      notifyDiscord(gid, 'postClaims', {
        title: `@${profile.login} pitched an idea: ${title.trim()}`,
        description: pitch.trim().slice(0, 160),
        path: `#/g/${gid}/idea/${id}`,
      });
      onClose();
      navigate(`#/g/${gid}/idea/${id}`);
    } catch {
      toast('Could not post the idea — check your connection.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="Pitch an idea" onClose={onClose}>
      <div class="stack">
        <Field
          label="Name it"
          value={title}
          onInput={setTitle}
          maxLength={80}
          placeholder="Voice notes to Notion"
          autofocus
        />
        <Field
          label="The pitch"
          value={pitch}
          onInput={setPitch}
          multiline
          maxLength={200}
          placeholder="What if rambling voice memos became structured notes?"
          hint="One sentence a friend would understand. No repo needed — that comes later."
        />
        <Field
          label="More, if it helps (optional)"
          value={detail}
          onInput={setDetail}
          multiline
          maxLength={1000}
          placeholder="Rough shape, links, what sparked it"
        />
        <div class="field">
          <span class="field__label">What would help it grow?</span>
          <div class="row wrap">
            {REPO_NEEDS.map((n) => (
              <button
                key={n.key}
                class={`chip ${needs === n.key ? 'chip--accent' : ''}`}
                aria-pressed={needs === n.key}
                onClick={() => setNeeds(needs === n.key ? null : n.key)}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          <span class="field__label">Tags</span>
          <div class="row wrap">
            {DOMAIN_TAGS.map((t) => (
              <button
                key={t}
                class={`chip ${tags.has(t) ? 'chip--accent' : ''}`}
                aria-pressed={tags.has(t)}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {error && <span class="field__hint field__hint--error">{error}</span>}
        <Pill variant="primary" busy={busy} onClick={() => void post()}>
          Pitch it
        </Pill>
      </div>
    </Sheet>
  );
}
