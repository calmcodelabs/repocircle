import { useState } from 'preact/hooks';
import { sessionUser } from '../auth/session';
import { createGroup } from '../data/groups';
import { myProfile } from '../data/users';
import { navigate } from '../router';
import { Field } from '../ui/Field';
import { Mark } from '../ui/Mark';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';

/** S2 — first group: create one, or paste an invite link. */
export function Onboard() {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const nameOk = name.trim().length >= LIMITS.GROUP_NAME_MIN && name.trim().length <= LIMITS.GROUP_NAME_MAX;

  async function onCreate() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) {
      toast('Still loading your profile — try again in a second.', { error: true });
      return;
    }
    setBusy(true);
    try {
      const gid = await createGroup(profile, name.trim(), desc.trim());
      toast(`${name.trim()} created`);
      navigate(`#/g/${gid}/repos`);
    } catch {
      toast('Could not create the group — check #/diag.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  function onJoin() {
    const m = link.match(/#\/join\/([^/\s]+)\/([^/\s]+)/);
    if (!m) {
      toast('That doesn’t look like a RepoCircle invite link.', { error: true });
      return;
    }
    navigate(`#/join/${m[1]}/${m[2]}`);
  }

  return (
    <div class="app onboard">
      <div class="halo" />
      <main class="stack onboard__panel">
        <div class="onboard__head">
          <Mark size={44} />
          <h1>Start your circle</h1>
          <p class="dim small">A group is the private space your circle shares.</p>
        </div>

        <section class="card stack">
          <h3>Create a group</h3>
          <Field
            label="Group name"
            value={name}
            onInput={setName}
            placeholder="CS Club Builds"
            maxLength={LIMITS.GROUP_NAME_MAX}
            autofocus
          />
          <Field
            label="Description (optional)"
            value={desc}
            onInput={setDesc}
            placeholder="What this circle is about"
            maxLength={LIMITS.GROUP_DESC_MAX}
          />
          <Pill variant="primary" disabled={!nameOk} busy={busy} onClick={() => void onCreate()}>
            Create group
          </Pill>
        </section>

        <section class="card stack">
          <h3>Have an invite link?</h3>
          <Field
            label="Paste it here"
            value={link}
            onInput={setLink}
            placeholder="https://…/#/join/…"
          />
          <Pill disabled={!link.trim()} onClick={onJoin}>
            Continue
          </Pill>
        </section>
      </main>
    </div>
  );
}
