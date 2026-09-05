import { useState } from 'preact/hooks';
import { sessionUser, signOutApp } from '../auth/session';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { createGroup } from '../data/groups';
import { myProfile, myUserDoc } from '../data/users';
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
      toast('Your profile is still loading — give it a second, then try again.', { error: true });
      return;
    }
    setBusy(true);
    try {
      const gid = await createGroup(profile, name.trim(), desc.trim());
      toast(`${name.trim()} created`);
      navigate(`#/g/${gid}/repos`);
    } catch (e) {
      toast(
        (e as Error)?.message === 'group-not-persisted'
          ? 'The circle didn’t save — you may be offline. Check your connection and try again.'
          : 'Could not create the circle — check #/diag.',
        { error: true },
      );
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

  const u = sessionUser.value;
  const login = myUserDoc.value?.login ?? u?.displayName ?? 'you';

  return (
    <div class="app onboard">
      <div class="halo" />
      <header class="topbar">
        <Mark />
        <strong>RepoCircle</strong>
        <span class="topbar__spacer" />
        {u && (
          <div class="row small dim">
            <Avatar src={u.photoURL ?? undefined} login={login} />
            <span class="onboard__who">{login}</span>
            <button class="signin__link" onClick={() => void signOutApp()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main class="stack onboard__panel">
        <div class="onboard__head rise">
          <h1>
            Start your <span class="tint">circle</span>.
          </h1>
          <p class="lead">A group is the private space your circle shares.</p>
        </div>

        <section class="card stack rise-2">
          <div class="row">
            <span class="tile tile--accent">
              <Icon name="plus" />
            </span>
            <h3>Create a group</h3>
          </div>
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

        <section class="card stack rise-3">
          <div class="row">
            <span class="tile">
              <Icon name="arrow-right" />
            </span>
            <h3>Have an invite link?</h3>
          </div>
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
