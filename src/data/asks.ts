import {
  increment,
  Timestamp,
  arrayRemove,
  arrayUnion,
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
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { log, noteServerError } from '../util/log';
import { randomToken } from './ids';
import { resilientWatch } from './resilientWatch';
import { noteAskClosed, noteAskOpened } from './summary';
import type { Ask, AskClaim, AskKind, MyProfile } from './types';

function askDocs(snap: { docs: Array<{ id: string; data: () => unknown }> }): Ask[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ask, 'id'>) }));
}

/** Open + claimed asks for the Home block, newest first. */
export function watchNeedsHelp(
  gid: string,
  cb: (asks: Ask[]) => void,
  onError: (c: string) => void,
): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('state', 'in', ['open', 'claimed']),
    orderBy('createdAt', 'desc'),
    limit(25),
  );
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        q,
        (snap) => {
          onOk();
          cb(askDocs(snap));
        },
        onErr,
      ),
    { onGiveUp: onError },
  );
}

/**
 * M18 — the asks that have waited longest with nobody on them. Home's main list
 * is newest-first, which is exactly how an unanswered ask sinks out of sight;
 * this is the counterweight, and it is a query rather than a re-sort so it
 * stays true past the twenty-five Home loads.
 */
export function watchLongestWaiting(gid: string, cb: (asks: Ask[]) => void, max = 3): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('state', '==', 'open'),
    orderBy('createdAt', 'asc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => cb(askDocs(snap)),
    () => cb([]),
  );
}

export function watchAsk(gid: string, askId: string, cb: (ask: Ask | null) => void): Unsubscribe {
  return onSnapshot(doc(db(), `groups/${gid}/asks/${askId}`), (snap) =>
    cb(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Ask, 'id'>) } : null),
  );
}

export function watchClaims(
  gid: string,
  askId: string,
  cb: (claims: AskClaim[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db(), `groups/${gid}/asks/${askId}/claims`), (snap) =>
    cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AskClaim, 'uid'>) }))),
  );
}

export function watchMyAsks(gid: string, uid: string, cb: (asks: Ask[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(6),
  );
  return onSnapshot(q, (snap) => cb(askDocs(snap)));
}

export function watchMyClaims(gid: string, uid: string, cb: (asks: Ask[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('claimerUids', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(6),
  );
  return onSnapshot(q, (snap) => cb(askDocs(snap)));
}

export async function createAsk(
  gid: string,
  profile: MyProfile,
  input: {
    kind: AskKind;
    title: string;
    detail?: string;
    tags: string[];
    repoId?: string | null;
    pairingUrl?: string | null;
  },
): Promise<string> {
  const id = randomToken(16);
  await setDoc(doc(db(), `groups/${gid}/asks/${id}`), {
    kind: input.kind,
    title: input.title,
    ...(input.detail ? { detail: input.detail } : {}),
    tags: input.tags,
    ...(input.repoId ? { repoId: input.repoId } : {}),
    ...(input.pairingUrl ? { pairingUrl: input.pairingUrl } : {}),
    authorUid: profile.uid,
    authorLogin: profile.login,
    authorAvatarUrl: profile.avatarUrl,
    state: 'open',
    claimCount: 0,
    claimerUids: [],
    createdAt: serverTimestamp(),
    v: 1,
  });
  await noteAskOpened(gid);
  void updateDoc(doc(db(), `groups/${gid}/members/${profile.uid}`), {
    'checklist.postedOrAnswered': true,
  }).catch(() => undefined);
  return id;
}

export async function claimAsk(
  gid: string,
  ask: Ask,
  profile: MyProfile,
  note: string,
): Promise<void> {
  const batch = writeBatch(db());
  batch.set(doc(db(), `groups/${gid}/asks/${ask.id}/claims/${profile.uid}`), {
    login: profile.login,
    avatarUrl: profile.avatarUrl,
    ...(note.trim() ? { note: note.trim() } : {}),
    claimedAt: serverTimestamp(),
    v: 1,
  });
  batch.update(doc(db(), `groups/${gid}/asks/${ask.id}`), {
    state: 'claimed',
    claimCount: increment(1), // Class C: never read-modify-write a counter
    claimerUids: arrayUnion(profile.uid),
  });
  await batch.commit();
  void updateDoc(doc(db(), `groups/${gid}/members/${profile.uid}`), {
    'checklist.postedOrAnswered': true,
  }).catch(() => undefined);
}

export async function unclaimAsk(gid: string, ask: Ask, uid: string): Promise<void> {
  // Class C exception, noted: the open/claimed transition must branch on the
  // count, so it reads the snapshot value. A concurrent unclaim can leave
  // state 'claimed' at zero claims; the next claim self-heals it. The counter
  // itself still moves by increment.
  const remaining = Math.max((ask.claimCount ?? 1) - 1, 0);
  const batch = writeBatch(db());
  batch.delete(doc(db(), `groups/${gid}/asks/${ask.id}/claims/${uid}`));
  batch.update(doc(db(), `groups/${gid}/asks/${ask.id}`), {
    state: remaining === 0 ? 'open' : 'claimed',
    claimCount: increment(-1),
    claimerUids: arrayRemove(uid),
  });
  await batch.commit();
}

export async function resolveAsk(
  gid: string,
  ask: Pick<Ask, 'id' | 'state'>,
  resolvedWith?: { uid: string; login: string } | null,
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/asks/${ask.id}`), {
    state: 'resolved',
    resolvedAt: serverTimestamp(),
    // One fact, never a count: who got the author unstuck (ADR-019).
    ...(resolvedWith
      ? { resolvedWithUid: resolvedWith.uid, resolvedWithLogin: resolvedWith.login }
      : {}),
  });
  // Guarded on the state we came from: resolving an already-resolved ask (a
  // double tap, a stale tab) must not push the mirror below zero.
  if (ask.state !== 'resolved') await noteAskClosed(gid);
}

export async function reopenAsk(gid: string, ask: Pick<Ask, 'id' | 'state'>): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/asks/${ask.id}`), { state: 'open', resolvedAt: null });
  if (ask.state === 'resolved') await noteAskOpened(gid);
}

export async function deleteAsk(gid: string, ask: Pick<Ask, 'id' | 'state'>): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/asks/${ask.id}`));
  if (ask.state !== 'resolved') await noteAskClosed(gid);
}

/**
 * Group-level "unblocked this week" (G-05): resolved count, never per-member.
 * A plain limited query rather than count(): aggregations always go to the server
 * and cannot fall back to cache, which made this the first thing to break whenever
 * the backend was unhappy. A circle resolves nowhere near 200 asks a week.
 */
export const UNBLOCKED_CAP = 50;

export async function unblockedThisWeek(gid: string): Promise<number> {
  const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86_400_000);
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('state', '==', 'resolved'),
    where('resolvedAt', '>=', weekAgo),
    limit(UNBLOCKED_CAP),
  );
  try {
    const snap = await getDocs(q);
    return snap.size;
  } catch (e) {
    const code = (e as { code?: string }).code;
    log('warn', `unblocked count failed: ${code ?? 'unknown'}`);
    noteServerError(code, 'unblocked count');
    return 0;
  }
}

export type MyAsk = Ask & { gid: string; groupName: string };

/**
 * My open asks and claims across every group (personal homepage).
 * Open loops only — nothing aggregated, nothing scored (ADR-015).
 */
export async function fetchMyOpenItems(
  groups: Array<{ id: string; name: string }>,
  uid: string,
): Promise<MyAsk[]> {
  const { getDocs } = await import('firebase/firestore');
  const results = await Promise.allSettled(
    groups.flatMap((g) => [
      getDocs(
        query(
          collection(db(), `groups/${g.id}/asks`),
          where('authorUid', '==', uid),
          where('state', 'in', ['open', 'claimed']),
          limit(10),
        ),
      ).then((s) =>
        s.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Ask, 'id'>),
          gid: g.id,
          groupName: g.name,
        })),
      ),
      getDocs(
        query(
          collection(db(), `groups/${g.id}/asks`),
          where('claimerUids', 'array-contains', uid),
          where('state', 'in', ['open', 'claimed']),
          limit(10),
        ),
      ).then((s) =>
        s.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Ask, 'id'>),
          gid: g.id,
          groupName: g.name,
        })),
      ),
    ]),
  );
  const seen = new Set<string>();
  const items: MyAsk[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      const key = `${a.gid}:${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(a);
    }
  }
  items.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  return items;
}
