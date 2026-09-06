import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { audit } from './audit';
import { randomToken } from './ids';
import type { MyProfile } from './types';

/**
 * M17 — announcements. A circle had no way to say anything to itself: every
 * other surface belongs to a repo, an idea or an ask. Admin-only, append-only
 * (correcting one means posting again — it was a statement made at a moment),
 * and Home reads exactly one of them.
 */
export type Announcement = {
  id: string;
  body: string;
  authorUid: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  createdAt: Timestamp | null;
  v: 1;
};

const toAnnouncement = (d: { id: string; data: () => unknown }): Announcement => ({
  id: d.id,
  ...(d.data() as Omit<Announcement, 'id'>),
});

/** One document: the current announcement, or null when there has never been one. */
export function watchLatestAnnouncement(
  gid: string,
  cb: (a: Announcement | null) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db(), `groups/${gid}/announcements`), orderBy('createdAt', 'desc'), limit(1)),
    (snap) => cb(snap.empty ? null : toAnnouncement(snap.docs[0]!)),
    () => cb(null),
  );
}

/** History, read only when someone opens it. */
export async function fetchAnnouncements(gid: string, max = 10): Promise<Announcement[]> {
  const snap = await getDocs(
    query(
      collection(db(), `groups/${gid}/announcements`),
      orderBy('createdAt', 'desc'),
      limit(max),
    ),
  );
  return snap.docs.map(toAnnouncement);
}

export async function postAnnouncement(
  gid: string,
  profile: MyProfile,
  body: string,
): Promise<void> {
  const id = randomToken(16);
  await setDoc(doc(db(), `groups/${gid}/announcements/${id}`), {
    body: body.trim().slice(0, 280),
    authorUid: profile.uid,
    authorLogin: profile.login,
    authorAvatarUrl: profile.avatarUrl,
    createdAt: serverTimestamp(),
    v: 1,
  });
  audit(gid, profile, 'announcement_posted', 'announcement', id);
}

export async function deleteAnnouncement(gid: string, id: string): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/announcements/${id}`));
}
