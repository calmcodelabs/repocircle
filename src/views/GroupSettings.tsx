import { useEffect, useState } from 'preact/hooks';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { invalidateDiscordCache, testDiscord, type DiscordConfig } from '../notify/discord';
import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import { updateGroupProfile } from '../data/groups';
import { InviteManager } from './InviteManager';
import { leaveGroup } from '../data/members';
import { myProfile } from '../data/users';
import { navigate } from '../router';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';


export function GroupSettings({ gid }: { gid: string }) {
  const me = myMembership.value;
  const iAmAdmin = me?.role === 'admin';

  return (
    <main class="stack">
      <h2>Settings</h2>
      {iAmAdmin && <ProfileCard gid={gid} />}
      {iAmAdmin && (
        <section class="card stack">
          <h3>Invite links</h3>
          <InviteManager gid={gid} />
        </section>
      )}
      {iAmAdmin && <DiscordCard gid={gid} />}
      <LeaveCard gid={gid} />
      {!iAmAdmin && (
        <p class="small faint">Group profile and invites are managed by admins.</p>
      )}
    </main>
  );
}

function ProfileCard({ gid }: { gid: string }) {
  const g = activeGroup.value;
  const [name, setName] = useState(g?.name ?? '');
  const [desc, setDesc] = useState(g?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty && g) {
      setName(g.name);
      setDesc(g.description);
    }
  }, [g, dirty]);

  const nameOk = name.trim().length >= LIMITS.GROUP_NAME_MIN;

  async function save() {
    setBusy(true);
    try {
      await updateGroupProfile(gid, name.trim(), desc.trim());
      toast('Group updated');
      setDirty(false);
    } catch {
      toast('Saving failed.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Profile</h3>
      <Field label="Name" value={name} onInput={(v) => { setName(v); setDirty(true); }} maxLength={LIMITS.GROUP_NAME_MAX} />
      <Field label="Description" value={desc} onInput={(v) => { setDesc(v); setDirty(true); }} maxLength={LIMITS.GROUP_DESC_MAX} />
      <Pill variant="primary" disabled={!nameOk || !dirty} busy={busy} onClick={() => void save()}>
        Save
      </Pill>
    </section>
  );
}


const TOGGLES: Array<{ key: 'postAsks' | 'postClaims' | 'postCollabs' | 'postShipped'; label: string }> = [
  { key: 'postAsks', label: 'New asks & stuck flags' },
  { key: 'postClaims', label: 'Claims & resolutions' },
  { key: 'postCollabs', label: 'Collab requests & decisions' },
  { key: 'postShipped', label: 'Shipped things (releases — Phase 2)' },
];

function DiscordCard({ gid }: { gid: string }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>({
    postAsks: true,
    postClaims: true,
    postCollabs: true,
    postShipped: true,
  });
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getDoc(doc(db(), `groups/${gid}/integrations/discord`)).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as DiscordConfig;
      setUrl(d.webhookUrl);
      setLabel(d.channelLabel ?? '');
      setFlags({
        postAsks: d.postAsks,
        postClaims: d.postClaims,
        postCollabs: d.postCollabs,
        postShipped: d.postShipped,
      });
      setExists(true);
    });
  }, [gid]);

  const urlOk = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_.-]+$/.test(url.trim());

  async function save() {
    const uid = sessionUser.value?.uid;
    if (!uid) return;
    setBusy(true);
    try {
      await setDoc(doc(db(), `groups/${gid}/integrations/discord`), {
        webhookUrl: url.trim(),
        channelLabel: label.trim(),
        postAsks: flags.postAsks,
        postClaims: flags.postClaims,
        postCollabs: flags.postCollabs,
        postShipped: flags.postShipped,
        configuredBy: uid,
        updatedAt: serverTimestamp(),
        v: 1,
      });
      invalidateDiscordCache(gid);
      setExists(true);
      toast('Discord connected');
      void updateMyChecklist(gid, uid);
    } catch {
      toast('Saving failed — is the webhook URL exactly as Discord gave it?', { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteDoc(doc(db(), `groups/${gid}/integrations/discord`));
      invalidateDiscordCache(gid);
      setExists(false);
      setUrl('');
      toast('Discord disconnected');
    } catch {
      toast('Removing failed.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Discord</h3>
      <p class="small dim">
        Server → channel ⚙ → Integrations → Webhooks → New Webhook → copy URL. Asks, claims and
        collab requests will post there with links back here. Any member’s app can post through
        it — treat it like the channel is group-writable (it already is).
      </p>
      <Field
        label="Webhook URL"
        value={url}
        onInput={setUrl}
        placeholder="https://discord.com/api/webhooks/…"
        error={url && !urlOk ? 'That doesn’t look like a Discord webhook URL.' : undefined}
      />
      <Field label="Channel label (just for you)" value={label} onInput={setLabel} maxLength={60} placeholder="#dev-help" />
      <div class="stack">
        {TOGGLES.map((t) => (
          <label key={t.key} class="row small">
            <input
              type="checkbox"
              checked={flags[t.key]}
              onChange={(e) => setFlags({ ...flags, [t.key]: (e.currentTarget as HTMLInputElement).checked })}
            />
            {t.label}
          </label>
        ))}
      </div>
      <div class="row wrap">
        <Pill variant="primary" busy={busy} disabled={!urlOk} onClick={() => void save()}>
          {exists ? 'Save' : 'Connect'}
        </Pill>
        <Pill
          disabled={!urlOk}
          busy={busy}
          onClick={() =>
            void testDiscord(url.trim()).then((ok) =>
              ok ? toast('Test post sent — check the channel') : toast('Discord rejected the test post.', { error: true }),
            )
          }
        >
          Send test post
        </Pill>
        {exists && (
          <Pill variant="danger" busy={busy} onClick={() => void remove()}>
            Disconnect
          </Pill>
        )}
      </div>
    </section>
  );
}

async function updateMyChecklist(gid: string, uid: string): Promise<void> {
  const { updateDoc: upd } = await import('firebase/firestore');
  await upd(doc(db(), `groups/${gid}/members/${uid}`), { 'checklist.connectedChat': true }).catch(() => undefined);
}

function LeaveCard({ gid }: { gid: string }) {
  const me = myMembership.value;
  const members = activeMembers.value ?? [];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const admins = members.filter((m) => m.role === 'admin');
  const lastAdminWithOthers = me?.role === 'admin' && admins.length === 1 && members.length > 1;

  async function onLeave() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    if (!profile) return;
    setBusy(true);
    try {
      await leaveGroup(gid, profile);
      toast('You left the group');
      navigate('#/');
    } catch {
      toast('Leaving failed — check #/diag.', { error: true });
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Leave group</h3>
      {lastAdminWithOthers ? (
        <p class="small dim">
          You’re the only admin. Promote another member first (Members → ⋯ → role), then you can
          leave.
        </p>
      ) : (
        <p class="small dim">
          Your posts stay but are anonymized (“left the group”). Rejoining needs a fresh invite.
          {members.length === 1 && ' You’re the last member — the group becomes unreachable.'}
        </p>
      )}
      {confirming ? (
        <Pill variant="danger" busy={busy} disabled={lastAdminWithOthers} onClick={() => void onLeave()}>
          Yes, leave {activeGroup.value?.name ?? 'this group'}
        </Pill>
      ) : (
        <Pill variant="danger" disabled={lastAdminWithOthers} onClick={() => setConfirming(true)}>
          Leave group…
        </Pill>
      )}
    </section>
  );
}
