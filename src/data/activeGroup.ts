import { computed, signal } from '@preact/signals';
import type { Unsubscribe } from 'firebase/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { log } from '../util/log';
import { watchMembers } from './members';
import { resilientWatch } from './resilientWatch';
import type { Group, Member } from './types';

export const activeGid = signal<string | null>(null);
export const activeGroup = signal<Group | null | undefined>(undefined);
export const activeMembers = signal<Member[] | null>(null);
/** Set when the group listeners get permission-denied (not a member / removed). */
export const activeDenied = signal(false);

export const myMembership = computed<Member | null>(() => {
  const uid = sessionUser.value?.uid;
  return (uid && activeMembers.value?.find((m) => m.uid === uid)) || null;
});

let unsubs: Unsubscribe[] = [];

export function setActiveGroup(gid: string | null): void {
  if (gid === activeGid.value) return;
  for (const u of unsubs) u();
  unsubs = [];
  activeGid.value = gid;
  activeGroup.value = undefined;
  activeMembers.value = null;
  activeDenied.value = false;
  if (!gid) return;

  try {
    localStorage.setItem('rc.lastGid', gid);
  } catch {
    // storage denied — remembering the last group is best-effort
  }

  unsubs.push(
    resilientWatch(
      (onOk, onErr) =>
        onSnapshot(
          doc(db(), 'groups', gid),
          (snap) => {
            onOk();
            activeGroup.value = snap.exists() ? ({ id: snap.id, ...snap.data() } as Group) : null;
          },
          onErr,
        ),
      {
        onGiveUp: (code) => {
          log('warn', `group watch: ${code}`);
          activeDenied.value = true;
          activeGroup.value = null;
        },
      },
    ),
    watchMembers(
      gid,
      (m) => (activeMembers.value = m),
      (code) => {
        log('warn', `members watch: ${code}`);
        activeDenied.value = true;
      },
    ),
  );
}

export function lastGid(): string | null {
  try {
    return localStorage.getItem('rc.lastGid');
  } catch {
    return null;
  }
}
