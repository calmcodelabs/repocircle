import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { resilientWatch } from './resilientWatch';
import type { MyProfile, Poll, PollVote } from './types';

/**
 * M19 — polls (ADR-024). The circle deciding something: which workshop, when to
 * demo. **Never a rating.** Options are things to do, not people or their work;
 * rules cannot read semantics, so that line is held by the ADR and by the
 * composer's framing, the same way ADR-014 holds the availability tone.
 *
 * One vote per member is structural — the vote document id is the uid.
 */
export function watchOpenPoll(gid: string, cb: (p: Poll | null) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/polls`),
    where('state', '==', 'open'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        q,
        (snap) => {
          onOk();
          cb(snap.empty ? null : ({ id: snap.docs[0]!.id, ...snap.docs[0]!.data() } as Poll));
        },
        onErr,
      ),
    { onGiveUp: () => cb(null) },
  );
}

export async function createPoll(
  gid: string,
  profile: MyProfile,
  question: string,
  labels: string[],
): Promise<string> {
  const id = randomToken(16);
  const options: Record<string, { label: string; count: number }> = {};
  labels
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .forEach((label, i) => {
      options[`o${i}`] = { label: label.slice(0, 60), count: 0 };
    });
  await setDoc(doc(db(), `groups/${gid}/polls/${id}`), {
    question: question.trim().slice(0, 120),
    options,
    authorUid: profile.uid,
    authorLogin: profile.login,
    authorAvatarUrl: profile.avatarUrl,
    state: 'open',
    createdAt: serverTimestamp(),
    v: 1,
  });
  return id;
}

export function watchMyVote(
  gid: string,
  pollId: string,
  uid: string,
  cb: (v: PollVote | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db(), `groups/${gid}/polls/${pollId}/votes/${uid}`),
    (snap) => cb(snap.exists() ? (snap.data() as PollVote) : null),
    () => cb(null),
  );
}

/**
 * Vote, or change your mind. Counts move by increment() only (Class C); a lost
 * race skews a display number, and `count()` over the votes subcollection is
 * the truth if it ever matters.
 */
export async function castVote(
  gid: string,
  pollId: string,
  uid: string,
  optionKey: string,
  previousKey?: string | null,
): Promise<void> {
  if (previousKey === optionKey) return;
  const batch = writeBatch(db());
  batch.set(doc(db(), `groups/${gid}/polls/${pollId}/votes/${uid}`), {
    optionKey,
    createdAt: serverTimestamp(),
    v: 1,
  });
  const pollRef = doc(db(), `groups/${gid}/polls/${pollId}`);
  batch.update(pollRef, {
    [`options.${optionKey}.count`]: increment(1),
    ...(previousKey ? { [`options.${previousKey}.count`]: increment(-1) } : {}),
  });
  await batch.commit();
}

export async function closePoll(gid: string, pollId: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/polls/${pollId}`), {
    state: 'closed',
    closedAt: serverTimestamp(),
  });
}

export async function deletePoll(gid: string, pollId: string): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/polls/${pollId}`));
}

/** The single fact a closed poll leaves behind. */
export async function fetchPoll(gid: string, pollId: string): Promise<Poll | null> {
  const snap = await getDoc(doc(db(), `groups/${gid}/polls/${pollId}`)).catch(() => null);
  return snap?.exists() ? ({ id: snap.id, ...snap.data() } as Poll) : null;
}

export function totalVotes(p: Poll): number {
  return Object.values(p.options).reduce((n, o) => n + (o.count ?? 0), 0);
}

/** The option with the most votes, or null when it is a tie or nobody voted. */
export function decidedOption(p: Poll): string | null {
  const entries = Object.values(p.options);
  if (entries.length === 0) return null;
  const top = Math.max(...entries.map((o) => o.count ?? 0));
  if (top === 0) return null;
  const winners = entries.filter((o) => (o.count ?? 0) === top);
  return winners.length === 1 ? winners[0]!.label : null;
}
