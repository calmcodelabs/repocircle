import { useEffect, useState } from 'preact/hooks';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { activeGroup, activeSummary } from '../data/activeGroup';
import { createInvite, inviteState, inviteUrl, revokeInvite, watchInvites } from '../data/invites';
import { myProfile } from '../data/users';
import type { Invite } from '../data/types';
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

export function InviteManager({ gid, intro }: { gid: string; intro?: string }) {
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
        repoCount = (await getCountFromServer(collection(db(), `groups/${gid}/repos`))).data()
          .count;
      } catch {
        // preview count is nice-to-have; never block the invite on it
      }
      void import('firebase/firestore').then(async ({ doc, updateDoc }) => {
        await updateDoc(doc(db(), `groups/${gid}/members/${profile.uid}`), {
          'checklist.invitedSomeone': true,
        }).catch(() => undefined);
      });
      const token = await createInvite(
        gid,
        profile,
        {
          groupName: group.name,
          groupDescription: group.description ?? '',
          memberCount: activeSummary.value?.memberCount ?? 1,
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
    <div class="stack">
      {intro && <p class="small dim">{intro}</p>}
      <div class="row wrap">
        <div class="segmented" role="group" aria-label="Invite role">
          {(['member', 'guest'] as const).map((r) => (
            <button
              key={r}
              class="segmented__btn"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div class="segmented" role="group" aria-label="Expires">
          {([1, 7, 30] as const).map((d) => (
            <button
              key={d}
              class="segmented__btn"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d === 1 ? '24h' : `${d}d`}
            </button>
          ))}
        </div>
      </div>
      <Field
        label="Label (just for you)"
        value={label}
        onInput={setLabel}
        maxLength={LIMITS.INVITE_LABEL_MAX}
        placeholder="posted in club Discord"
      />
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
                {st === 'valid'
                  ? `expires ${relTime(inv.expiresAt)}`
                  : `created by @${inv.createdByLogin ?? '?'}`}
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
                    if (profile)
                      void revokeInvite(gid, profile, inv.token).then(() =>
                        toast('Invite revoked'),
                      );
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
            <p class="small dim">
              Anyone with this link can join until it expires — share it in your group’s chat.
            </p>
            <p class="mono small invite__url">{fresh}</p>
            <Pill variant="primary" onClick={() => void copyText(fresh)}>
              Copy link
            </Pill>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** The same invite manager surfaced as a modal, for Members and Home. */
export function InviteSheet({
  gid,
  onClose,
  intro,
}: {
  gid: string;
  onClose: () => void;
  intro?: string;
}) {
  return (
    <Sheet title="Invite people to this circle" onClose={onClose}>
      <InviteManager gid={gid} intro={intro} />
    </Sheet>
  );
}
