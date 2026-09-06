import { useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { createSession } from '../data/sessions';
import { myProfile } from '../data/users';
import { Sheet } from '../ui/Sheet';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';

/** M19 — "working on this Saturday, join me". Anyone who can write may call one. */
export function SessionComposer({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('60');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;

  const startsAt = when ? new Date(when) : null;
  const validUrl = !url.trim() || url.trim().startsWith('https://');
  const ready =
    title.trim().length >= 3 && startsAt !== null && !Number.isNaN(startsAt.getTime()) && validUrl;

  async function create() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !ready || !startsAt) return;
    setBusy(true);
    try {
      await createSession(gid, profile, {
        title,
        detail,
        startsAt,
        durationMin: Number(duration) || 60,
        url: url.trim() || null,
      });
      toast('Scheduled — it shows in Coming up');
      onClose();
    } catch {
      toast('Could not schedule that.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="Call a session" onClose={onClose}>
      <div class="stack">
        <input
          class="input"
          placeholder="Saturday build session"
          maxLength={80}
          value={title}
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        />
        <textarea
          class="input"
          rows={2}
          maxLength={500}
          placeholder="What you'll be working on, and who it's for."
          value={detail}
          onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)}
        />
        <label class="small dim" for="session-when">
          When
        </label>
        <input
          id="session-when"
          class="input"
          type="datetime-local"
          value={when}
          onInput={(e) => setWhen((e.target as HTMLInputElement).value)}
        />
        <label class="small dim" for="session-mins">
          Minutes
        </label>
        <input
          id="session-mins"
          class="input"
          type="number"
          min="15"
          max="480"
          value={duration}
          onInput={(e) => setDuration((e.target as HTMLInputElement).value)}
        />
        <input
          class="input"
          placeholder="https://… (call link, optional)"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        />
        {!validUrl && <span class="small warn">A link has to start with https://</span>}
        <div class="row">
          <span class="small faint">Everyone in the circle can see it and say they're coming.</span>
          <span class="topbar__spacer" />
          <Pill variant="primary" busy={busy} disabled={!ready} onClick={() => void create()}>
            Schedule
          </Pill>
        </div>
      </div>
    </Sheet>
  );
}
