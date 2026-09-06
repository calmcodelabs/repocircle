import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { Unsubscribe } from 'firebase/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { sessionUser } from '../auth/session';
import { clearServerError, log, noteServerError } from '../util/log';
import { watchMembers } from './members';
import { resilientWatch } from './resilientWatch';
import { watchSummary } from './summary';
import type { CircleSummary, Group, Member } from './types';

export const activeGid = signal<string | null>(null);
export const activeGroup = signal<Group | null | undefined>(undefined);
/** Counts for the whole circle in one document (M16, ADR-021). */
export const activeSummary = signal<CircleSummary | null>(null);
/** Set when the group listeners get permission-denied (not a member / removed). */
export const activeDenied = signal(false);

/**
 * My own membership, read as one document rather than sifted out of the whole
 * member list. Every group-scoped page needs it (it decides what I may do), and
 * paying two hundred reads for one document was most of what made Home
 * expensive — see SCALING.md.
 */
export const myMembership = signal<Member | null>(null);

/**
 * The full member list. Opt-in (see useCircleMembers) because most pages never
 * need it: Home shows eight faces and Repos shows none, while the member and
 * settings screens genuinely work with everybody.
 */
export const activeMembers = signal<Member[] | null>(null);

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
  myMembership.value = null;
  subscribe(gid, false);
}

export function setActiveGroup(gid: string | null): void {
  if (gid === activeGid.value) return;
  teardown();
  activeGid.value = gid;
  activeGroup.value = undefined;
  activeSummary.value = null;
  activeMembers.value = null;
  myMembership.value = null;
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
  const uid = sessionUser.value?.uid;

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
  );

  if (uid) {
    unsubs.push(
      resilientWatch(
        (onOk, onErr) =>
          onSnapshot(
            doc(db(), `groups/${gid}/members/${uid}`),
            (snap) => {
              onOk();
              clearServerError();
              myMembership.value = snap.exists()
                ? ({ uid: snap.id, ...snap.data() } as Member)
                : null;
            },
            onErr,
          ),
        {
          onGiveUp: (code) => {
            log('warn', `membership watch: ${code}`);
            noteServerError(code, 'membership');
            // A blocked or unreachable backend is not the same as being removed
            // from the circle — never claim that on its behalf.
            if (code !== 'resource-exhausted' && code !== 'unavailable') {
              noteDenied(gid, retriedDenied);
            }
          },
        },
      ),
    );
  }

  unsubs.push(
    watchSummary(
      gid,
      (s) => {
        activeSummary.value = s;
      },
      (code) => {
        // Counts going missing is a cosmetic loss, never a denial verdict: the
        // membership watch above is the only thing that decides that.
        log('warn', `summary watch: ${code}`);
      },
    ),
  );
}

/**
 * Subscribe to the whole member list for as long as this view is mounted.
 * Deliberately explicit: reading every member is the single most expensive
 * thing a page can do, so a page pays for it only by asking.
 */
export function useCircleMembers(gid: string): Member[] | null {
  useEffect(() => {
    let alive = true;
    const un = watchMembers(
      gid,
      (m) => {
        if (alive) activeMembers.value = m;
      },
      (code) => log('warn', `members watch: ${code}`),
    );
    return () => {
      alive = false;
      un();
      activeMembers.value = null;
    };
  }, [gid]);
  return activeMembers.value;
}

export function lastGid(): string | null {
  try {
    return localStorage.getItem('rc.lastGid');
  } catch {
    return null;
  }
}
