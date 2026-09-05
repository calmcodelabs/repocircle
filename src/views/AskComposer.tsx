import { useEffect, useState } from 'preact/hooks';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { activeGroup } from '../data/activeGroup';
import { createAsk } from '../data/asks';
import { DEFAULT_ASK_TAGS } from '../data/groups';
import { myProfile } from '../data/users';
import type { AskKind, Repo } from '../data/types';
import { notifyDiscord } from '../notify/discord';
import { navigate } from '../router';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';

/** S5 — post an ask or flag being stuck. */
export function AskComposer({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  useEffect(() => {
    void getDocs(collection(db(), `groups/${gid}/repos`)).then((snap) =>
      setRepos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Repo, 'id'>) }))),
    );
  }, [gid]);
  const [kind, setKind] = useState<AskKind>('ask');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [repoId, setRepoId] = useState('');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [pairingUrl, setPairingUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const tagChoices = activeGroup.value?.settings.askTags?.length
    ? activeGroup.value.settings.askTags
    : DEFAULT_ASK_TAGS;
  const titleOk = title.trim().length >= LIMITS.TITLE_MIN;
  const pairingOk = !pairingUrl.trim() || pairingUrl.trim().startsWith('https://');

  function toggleTag(t: string) {
    const next = new Set(tags);
    if (next.has(t)) next.delete(t);
    else if (next.size < LIMITS.TAGS_MAX) next.add(t);
    setTags(next);
  }

  async function submit() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    try {
      const id = await createAsk(gid, profile, {
        kind,
        title: title.trim(),
        detail: kind === 'ask' ? detail.trim() || undefined : undefined,
        tags: [...tags],
        repoId: repoId || null,
        pairingUrl: pairingUrl.trim() || null,
      });
      toast(kind === 'stuck' ? 'Stuck flag is up — hang in there' : 'Ask posted');
      notifyDiscord(gid, 'postAsks', {
        title:
          kind === 'stuck'
            ? `@${profile.login} is stuck: ${title.trim()}`
            : `Ask from @${profile.login}: ${title.trim()}`,
        description: kind === 'ask' && detail.trim() ? detail.trim().slice(0, 180) : undefined,
        path: `#/g/${gid}/ask/${id}`,
      });
      onClose();
      navigate(`#/g/${gid}/ask/${id}`);
    } catch {
      toast('Posting failed — check #/diag.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title={kind === 'ask' ? 'Post an ask' : 'Flag that you’re stuck'} onClose={onClose}>
      <div class="stack">
        <div class="segmented" role="group" aria-label="Kind">
          <button class="segmented__btn" aria-pressed={kind === 'ask'} onClick={() => setKind('ask')}>
            Ask
          </button>
          <button class="segmented__btn" aria-pressed={kind === 'stuck'} onClick={() => setKind('stuck')}>
            Stuck
          </button>
        </div>
        <Field
          label={kind === 'ask' ? 'What do you need?' : 'What are you stuck on?'}
          value={title}
          onInput={setTitle}
          maxLength={LIMITS.TITLE_MAX}
          placeholder={kind === 'ask' ? 'Review my auth PR' : 'Docker networking, containers can’t talk'}
          autofocus
        />
        {kind === 'ask' && (
          <Field
            label="One more line (optional)"
            value={detail}
            onInput={setDetail}
            multiline
            maxLength={LIMITS.DETAIL_MAX}
            placeholder="Context, links, what you tried"
          />
        )}
        <label class="field">
          <span class="field__label">Repo (optional)</span>
          <select
            class="field__input"
            value={repoId}
            onInput={(e) => setRepoId((e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">— none —</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </label>
        <div class="field">
          <span class="field__label">Tags</span>
          <div class="row wrap">
            {tagChoices.map((t) => (
              <button key={t} class={`chip ${tags.has(t) ? 'chip--accent' : ''}`} onClick={() => toggleTag(t)} aria-pressed={tags.has(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Pairing link (optional)"
          value={pairingUrl}
          onInput={setPairingUrl}
          placeholder="https:// Live Share, Codespaces, meet…"
          error={pairingOk ? undefined : 'Must be an https:// link'}
        />
        <Pill variant="primary" big busy={busy} disabled={!titleOk || !pairingOk} onClick={() => void submit()}>
          {kind === 'ask' ? 'Post ask' : 'Raise the flag'}
        </Pill>
      </div>
    </Sheet>
  );
}
