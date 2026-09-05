import { useState } from 'preact/hooks';
import { setIdeaDetails } from '../data/repos';
import { DOMAIN_TAGS, REPO_NEEDS, type Repo, type RepoNeed } from '../data/types';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';

/** Owner-only: the human framing of an idea, plus what help it wants. */
export function IdeaSheet({ gid, repo, onClose }: { gid: string; repo: Repo; onClose: () => void }) {
  const [pitch, setPitch] = useState(repo.pitch ?? '');
  const [needs, setNeeds] = useState<RepoNeed | null>(repo.needs ?? null);
  const [tags, setTags] = useState<Set<string>>(new Set(repo.domainTags ?? []));
  const [seekingOwner, setSeekingOwner] = useState(repo.seekingOwner ?? false);
  const [busy, setBusy] = useState(false);

  function toggleTag(t: string) {
    const next = new Set(tags);
    if (next.has(t)) next.delete(t);
    else if (next.size < 4) next.add(t);
    setTags(next);
  }

  async function save() {
    setBusy(true);
    try {
      await setIdeaDetails(gid, repo.id, {
        pitch: pitch.trim(),
        needs,
        domainTags: [...tags],
        seekingOwner,
      });
      toast('Idea updated');
      onClose();
    } catch {
      toast('Could not save — check your connection.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title={`The idea behind ${repo.fullName.split('/')[1]}`} onClose={onClose}>
      <div class="stack">
        <Field
          label="What’s the idea?"
          value={pitch}
          onInput={setPitch}
          multiline
          maxLength={200}
          placeholder="What if your Telegram chat saved things for you?"
          hint="One sentence a friend would understand — not the tech stack."
          autofocus
        />

        <div class="field">
          <span class="field__label">What do you want from the circle?</span>
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
          <span class="field__hint">Up to four — they’re how people browse.</span>
        </div>

        <label class="row autoshare">
          <input
            type="checkbox"
            checked={seekingOwner}
            onChange={(e) => setSeekingOwner((e.currentTarget as HTMLInputElement).checked)}
          />
          <span class="small">
            Looking for a new owner
            <span class="faint"> — you’ve moved on and someone else is welcome to take it over.</span>
          </span>
        </label>

        <Pill variant="primary" busy={busy} onClick={() => void save()}>
          Save
        </Pill>
      </div>
    </Sheet>
  );
}
