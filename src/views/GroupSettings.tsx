import { useEffect, useState } from 'preact/hooks';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { invalidateDiscordCache, testDiscord, type DiscordConfig } from '../notify/discord';
import { collection, getCountFromServer } from 'firebase/firestore';
import { activeGroup, activeMembers, myMembership } from '../data/activeGroup';
import { updateGroupProfile } from '../data/groups';
import { createInvite, inviteState, inviteUrl, revokeInvite, watchInvites } from '../data/invites';
import { leaveGroup } from '../data/members';
import { myProfile } from '../data/users';
import type { Invite } from '../data/types';
import { navigate } from '../router';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { LIMITS } from '../util/limits';
import { relTime } from '../util/time';

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied');
  } catch {
    toast('Copy failed — long-press / right-click the link instead.', { error: true });
  }
}

export function GroupSettings({ gid }: { gid: string }) {
  const me = myMembership.value;
  const iAmAdmin = me?.role === 'admin';

  return (
    <main class="stack">
      <h2>Settings</h2>
      {iAmAdmin && <ProfileCard gid={gid} />}
      {iAmAdmin && <InvitesCard gid={gid} />}
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

function InvitesCard({ gid }: { gid: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [role, setRole] = useState<'member' | 'guest'>('member');
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => watchInvites(gid, setInvites), [gid]);

  async function onCreate() {
    const uid = sessionUser.value?.uid;
    const profile = uid ? myProfile(uid) : null;
    const group = activeGroup.value;
    if (!profile || !group) return;
    setBusy(true);
    try {
      let repoCount = 0;
      try {
        repoCount = (await getCountFromServer(collection(db(), `groups/${gid}/repos`))).data().count;
      } catch {
        // preview count is nice-to-have; never block the invite on it
      }
      const token = await createInvite(
        gid,
        profile,
        {
          groupName: group.name,
          groupDescription: group.description ?? '',
          memberCount: activeMembers.value?.length ?? 1,
          repoCount,
        },
        role,
        days,
        label.trim(),
      );
      setFresh(inviteUrl(gid, token));
      setLabel('');
    } catch {
      toast('Could not create invite.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card stack">
      <h3>Invite links</h3>
      <div class="row wrap">
        <div class="segmented" role="group" aria-label="Invite role">
          {(['member', 'guest'] as const).map((r) => (
            <button key={r} class="segmented__btn" aria-pressed={role === r} onClick={() => setRole(r)}>
              {r}
            </button>
          ))}
        </div>
        <div class="segmented" role="group" aria-label="Expires">
          {([1, 7, 30] as const).map((d) => (
            <button key={d} class="segmented__btn" aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 1 ? '24h' : `${d}d`}
            </button>
          ))}
        </div>
      </div>
      <Field label="Label (just for you)" value={label} onInput={setLabel} maxLength={LIMITS.INVITE_LABEL_MAX} placeholder="posted in club Discord" />
      <Pill variant="primary" busy={busy} onClick={() => void onCreate()}>
        Create invite link
      </Pill>

      {invites === null && <span class="skeleton" />}
      {invites?.length === 0 && <EmptyState line="No invites yet — create the first one above." />}
      {invites?.map((inv) => {
        const st = inviteState(inv);
        return (
          <div key={inv.token} class="row invite">
            <div class="invite__meta">
              <div class="row">
                <span class="small">{inv.label || 'unlabeled'}</span>
                <Chip tone={inv.role === 'guest' ? 'default' : 'accent'}>{inv.role}</Chip>
                {st !== 'valid' && <Chip tone="danger">{st}</Chip>}
              </div>
              <span class="small faint">
                {st === 'valid' ? `expires ${relTime(inv.expiresAt)}` : `created by @${inv.createdByLogin ?? '?'}`}
              </span>
            </div>
            <span class="topbar__spacer" />
            {st === 'valid' && (
              <>
                <Pill onClick={() => void copyText(inviteUrl(gid, inv.token))}>Copy</Pill>
                <Pill
                  variant="ghost"
                  onClick={() => {
                    const uid = sessionUser.value?.uid;
                    const profile = uid ? myProfile(uid) : null;
                    if (profile) void revokeInvite(gid, profile, inv.token).then(() => toast('Invite revoked'));
                  }}
                >
                  Revoke
                </Pill>
              </>
            )}
          </div>
        );
      })}

      {fresh && (
        <Sheet title="Invite link ready" onClose={() => setFresh(null)}>
          <div class="stack">
            <p class="small dim">Anyone with this link can join until it expires — share it in your group’s chat.</p>
            <p class="mono small invite__url">{fresh}</p>
            <Pill variant="primary" onClick={() => void copyText(fresh)}>
              Copy link
            </Pill>
          </div>
        </Sheet>
      )}
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
