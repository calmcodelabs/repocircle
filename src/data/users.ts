import { signal } from '@preact/signals';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { log } from '../util/log';
import type { MyProfile } from './types';

export type UserDoc = {
  githubId: number;
  login: string;
  name: string;
  avatarUrl: string;
  scopesGranted: string[];
  groupIds: string[];
  checklist: Record<string, boolean>;
  /** Watermark for the away-inbox: items newer than this are "new". */
  lastSeenAt?: Timestamp | null;
  /** M18 — per-circle inbox level. Absent means 'all'. */
  circlePrefs?: Record<string, CirclePref>;
};

/**
 * M18 — exactly three options, which is what Slack landed on after finding
 * that more of them made people feel less in control rather than more.
 * With no push to send, "notifications" here means what the away-inbox shows,
 * so muting a circle is also the cheapest thing you can do: its queries are
 * skipped entirely rather than fetched and filtered.
 */
export type CirclePref = 'all' | 'mentions' | 'mute';

export async function setCirclePref(uid: string, gid: string, pref: CirclePref): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { [`circlePrefs.${gid}`]: pref });
}

/**
 * Advance the away-inbox watermark. Throttled hard: once an hour is plenty, and
 * the throttle lives in localStorage so reloads don't burn writes.
 */
export function markSeen(uid: string): void {
  const key = 'rc.lastSeenWrite';
  try {
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 3_600_000) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // storage denied — write anyway, it's one doc
  }
  void updateDoc(doc(db(), 'users', uid), { lastSeenAt: serverTimestamp() }).catch(() => undefined);
}

/** Live copy of users/{me}. null = loaded-but-missing or signed out; undefined = loading. */
export const myUserDoc = signal<UserDoc | null | undefined>(undefined);

let unsub: Unsubscribe | null = null;

export function startMyUserWatch(uid: string): void {
  stopMyUserWatch();
  myUserDoc.value = undefined;
  unsub = onSnapshot(
    doc(db(), 'users', uid),
    (snap) => {
      myUserDoc.value = (snap.data() as UserDoc | undefined) ?? null;
    },
    (err) => {
      log('error', `users watch: ${err.code}`);
      myUserDoc.value = null;
    },
  );
}

export function stopMyUserWatch(): void {
  unsub?.();
  unsub = null;
  myUserDoc.value = null;
}

export function myProfile(uid: string): MyProfile | null {
  const u = myUserDoc.value;
  if (!u) return null;
  return { uid, login: u.login, name: u.name, avatarUrl: u.avatarUrl };
}
