import { computed, signal } from '@preact/signals';
import type { Unsubscribe } from 'firebase/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { clearServerError, log, noteServerError } from '../util/log';
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
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function teardown(): void {
  for (const u of unsubs) u();
  unsubs = [];
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = undefined;
}

/**
 * A denial can be a fact (removed) or a moment (listener attached while the
 * membership write was still committing — live-observed at 80s once). Before
 * declaring it a fact, re-subscribe once after a pause; the manual Try again
 * on the denied screen covers anything slower.
 */
function noteDenied(gid: string, retried: boolean): void {
  if (gid !== activeGid.value) return;
  if (!retried && !retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (gid === activeGid.value) subscribe(gid, true);
    }, 3000);
    return;
  }
  activeDenied.value = true;
}

export function retryActiveGroup(): void {
  const gid = activeGid.value;
  if (!gid) return;
  teardown();
  activeDenied.value = false;
  activeGroup.value = undefined;
  activeMembers.value = null;
  subscribe(gid, false);
}

export function setActiveGroup(gid: string | null): void {
  if (gid === activeGid.value) return;
  teardown();
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

  subscribe(gid, false);
}

function subscribe(gid: string, retriedDenied: boolean): void {
  for (const u of unsubs) u();
  unsubs = [];
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
          noteServerError(code, 'group');
          if (code === 'resource-exhausted' || code === 'unavailable') return;
          noteDenied(gid, retriedDenied);
        },
      },
    ),
    watchMembers(
      gid,
      (m) => {
        clearServerError();
        activeMembers.value = m;
      },
      (code) => {
        log('warn', `members watch: ${code}`);
        noteServerError(code, 'members');
        // A blocked or unreachable backend is not the same as being removed from
        // the circle — never claim that on its behalf.
        if (code !== 'resource-exhausted' && code !== 'unavailable') noteDenied(gid, retriedDenied);
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
