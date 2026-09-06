import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { randomToken } from './ids';
import type { MyProfile, RepoInterest, Session } from './types';

/**
 * M19 — gatherings (ADR-023). "Working on this Saturday, join me" is a circle
 * ritual, so any writing member may call one; the host or an admin may change
 * or cancel it.
 *
 * An RSVP is an `interests` document under the session with the host in
 * `repoOwnerUid`, which means the away-inbox, its collection-group read rule
 * and its composite index all cover RSVPs without a line of new plumbing —
 * the same reuse that made ideas cheap in M15.
 */
export function watchUpcomingSessions(
  gid: string,
  cb: (list: Session[]) => void,
  max = 3,
): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/sessions`),
    where('startsAt', '>=', Timestamp.now()),
    orderBy('startsAt', 'asc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Session, 'id'>) }))),
    () => cb([]),
  );
}

export async function createSession(
  gid: string,
  profile: MyProfile,
  input: {
    title: string;
    detail?: string;
    startsAt: Date;
    durationMin?: number;
    url?: string | null;
    repoId?: string | null;
  },
): Promise<string> {
  const id = randomToken(16);
  await setDoc(doc(db(), `groups/${gid}/sessions/${id}`), {
    title: input.title.trim().slice(0, 80),
    ...(input.detail?.trim() ? { detail: input.detail.trim().slice(0, 500) } : {}),
    startsAt: Timestamp.fromDate(input.startsAt),
    ...(input.durationMin ? { durationMin: input.durationMin } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.repoId ? { repoId: input.repoId } : {}),
    hostUid: profile.uid,
    hostLogin: profile.login,
    hostAvatarUrl: profile.avatarUrl,
    cancelled: false,
    rsvpCount: 0,
    createdAt: serverTimestamp(),
    v: 1,
  });
  return id;
}

export async function cancelSession(gid: string, sessionId: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/sessions/${sessionId}`), { cancelled: true });
}

export async function deleteSession(gid: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/sessions/${sessionId}`));
}

export function watchRsvps(
  gid: string,
  sessionId: string,
  cb: (list: RepoInterest[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db(), `groups/${gid}/sessions/${sessionId}/interests`),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<RepoInterest, 'uid'>) }))),
    () => cb([]),
  );
}

export async function rsvp(gid: string, session: Session, profile: MyProfile): Promise<void> {
  const batch = writeBatch(db());
  batch.set(doc(db(), `groups/${gid}/sessions/${session.id}/interests/${profile.uid}`), {
    login: profile.login,
    avatarUrl: profile.avatarUrl,
    gid,
    // Routes the host's away-inbox; rules verify it against the session.
    repoOwnerUid: session.hostUid,
    createdAt: serverTimestamp(),
    v: 1,
  });
  batch.update(doc(db(), `groups/${gid}/sessions/${session.id}`), {
    rsvpCount: increment(1), // Class C
  });
  await batch.commit();
}

export async function unrsvp(gid: string, sessionId: string, uid: string): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(doc(db(), `groups/${gid}/sessions/${sessionId}/interests/${uid}`));
  batch.update(doc(db(), `groups/${gid}/sessions/${sessionId}`), { rsvpCount: increment(-1) });
  await batch.commit();
}
