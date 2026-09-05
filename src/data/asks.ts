import {
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
import type { Ask, AskClaim, AskKind, MyProfile } from './types';

function askDocs(snap: { docs: Array<{ id: string; data: () => unknown }> }): Ask[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ask, 'id'>) }));
}

/** Open + claimed asks for the Home block, newest first. */
export function watchNeedsHelp(gid: string, cb: (asks: Ask[]) => void, onError: (c: string) => void): Unsubscribe {
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

export function watchAsk(gid: string, askId: string, cb: (ask: Ask | null) => void): Unsubscribe {
  return onSnapshot(doc(db(), `groups/${gid}/asks/${askId}`), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Ask, 'id'>) }) : null),
  );
}

export function watchClaims(gid: string, askId: string, cb: (claims: AskClaim[]) => void): Unsubscribe {
  return onSnapshot(collection(db(), `groups/${gid}/asks/${askId}/claims`), (snap) =>
    cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AskClaim, 'uid'>) }))),
  );
}

export function watchMyAsks(gid: string, uid: string, cb: (asks: Ask[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(10),
  );
  return onSnapshot(q, (snap) => cb(askDocs(snap)));
}

export function watchMyClaims(gid: string, uid: string, cb: (asks: Ask[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('claimerUids', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(10),
  );
  return onSnapshot(q, (snap) => cb(askDocs(snap)));
}

export async function createAsk(
  gid: string,
  profile: MyProfile,
  input: { kind: AskKind; title: string; detail?: string; tags: string[]; repoId?: string | null; pairingUrl?: string | null },
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
  void updateDoc(doc(db(), `groups/${gid}/members/${profile.uid}`), {
    'checklist.postedOrAnswered': true,
  }).catch(() => undefined);
  return id;
}

export async function claimAsk(gid: string, ask: Ask, profile: MyProfile, note: string): Promise<void> {
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
    claimCount: (ask.claimCount ?? 0) + 1,
    claimerUids: arrayUnion(profile.uid),
  });
  await batch.commit();
  void updateDoc(doc(db(), `groups/${gid}/members/${profile.uid}`), {
    'checklist.postedOrAnswered': true,
  }).catch(() => undefined);
}

export async function unclaimAsk(gid: string, ask: Ask, uid: string): Promise<void> {
  const remaining = Math.max((ask.claimCount ?? 1) - 1, 0);
  const batch = writeBatch(db());
  batch.delete(doc(db(), `groups/${gid}/asks/${ask.id}/claims/${uid}`));
  batch.update(doc(db(), `groups/${gid}/asks/${ask.id}`), {
    state: remaining === 0 ? 'open' : 'claimed',
    claimCount: remaining,
    claimerUids: arrayRemove(uid),
  });
  await batch.commit();
}

export async function resolveAsk(gid: string, askId: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/asks/${askId}`), { state: 'resolved', resolvedAt: serverTimestamp() });
}

export async function reopenAsk(gid: string, askId: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/asks/${askId}`), { state: 'open', resolvedAt: null });
}

export async function deleteAsk(gid: string, askId: string): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/asks/${askId}`));
}

/**
 * Group-level "unblocked this week" (G-05): resolved count, never per-member.
 * A plain limited query rather than count(): aggregations always go to the server
 * and cannot fall back to cache, which made this the first thing to break whenever
 * the backend was unhappy. A circle resolves nowhere near 200 asks a week.
 */
export async function unblockedThisWeek(gid: string): Promise<number> {
  const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86_400_000);
  const q = query(
    collection(db(), `groups/${gid}/asks`),
    where('state', '==', 'resolved'),
    where('resolvedAt', '>=', weekAgo),
    limit(200),
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
      ).then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ask, 'id'>), gid: g.id, groupName: g.name }))),
      getDocs(
        query(
          collection(db(), `groups/${g.id}/asks`),
          where('claimerUids', 'array-contains', uid),
          where('state', 'in', ['open', 'claimed']),
          limit(10),
        ),
      ).then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ask, 'id'>), gid: g.id, groupName: g.name }))),
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
