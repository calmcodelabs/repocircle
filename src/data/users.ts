import { signal } from '@preact/signals';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
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
};

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
