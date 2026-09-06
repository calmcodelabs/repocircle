import { useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { postAnnouncement } from '../data/announcements';
import { myProfile } from '../data/users';
import { Sheet } from '../ui/Sheet';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';

const MAX = 280;

/** M17 — admin-only. Short on purpose: this is a notice, not a post. */
export function AnnouncementComposer({ gid, onClose }: { gid: string; onClose: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = sessionUser.value?.uid;

  async function post() {
    const profile = uid ? myProfile(uid) : null;
    if (!profile || !body.trim()) return;
    setBusy(true);
    try {
      await postAnnouncement(gid, profile, body);
      toast('Announced to the circle');
      onClose();
    } catch {
      toast('Could not post that — check your connection.', { error: true });
      setBusy(false);
    }
  }

  return (
    <Sheet title="Tell the circle" onClose={onClose}>
      <div class="stack">
        <textarea
          class="input"
          rows={4}
          maxLength={MAX}
          placeholder="Demo day is Thursday at 6. Bring whatever state it's in."
          value={body}
          onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
        />
        <div class="row">
          <span class="small faint">
            {body.length}/{MAX} · everyone sees this until they dismiss it
          </span>
          <span class="topbar__spacer" />
          <Pill variant="primary" busy={busy} onClick={() => void post()}>
            Announce
          </Pill>
        </div>
      </div>
    </Sheet>
  );
}
