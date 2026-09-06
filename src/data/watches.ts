import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Repo } from './types';

/**
 * M12 — watches: repos I chose to follow. At 200 people you can't care about
 * everything; this is how you say what you care about. Self-only subcollection
 * under my user doc, so it works across circles and costs nobody else anything.
 */
export type Watch = {
  id: string; // `${gid}_${repoId}`
  gid: string;
  repoId: string;
  fullName: string;
  addedAt: Timestamp | null;
};

export function watchId(gid: string, repoId: string): string {
  return `${gid}_${repoId}`;
}

export async function addWatch(
  uid: string,
  gid: string,
  repo: Pick<Repo, 'id' | 'fullName'>,
): Promise<void> {
  await setDoc(doc(db(), `users/${uid}/watches/${watchId(gid, repo.id)}`), {
    gid,
    repoId: repo.id,
    fullName: repo.fullName,
    addedAt: serverTimestamp(),
    v: 1,
  });
}

export async function removeWatch(uid: string, gid: string, repoId: string): Promise<void> {
  await deleteDoc(doc(db(), `users/${uid}/watches/${watchId(gid, repoId)}`));
}

export async function isWatching(uid: string, gid: string, repoId: string): Promise<boolean> {
  const snap = await getDoc(doc(db(), `users/${uid}/watches/${watchId(gid, repoId)}`)).catch(
    () => null,
  );
  return !!snap?.exists();
}

export async function fetchWatches(uid: string): Promise<Watch[]> {
  const snap = await getDocs(collection(db(), `users/${uid}/watches`));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Watch, 'id'>) }));
}

export type WatchedRepo = { watch: Watch; repo: Repo | null };

export type PruneDecision = 'keep' | 'hide' | 'prune';

/**
 * Class A (REVIEW.md): groupIds is a mirror, so a miss there only HIDES the
 * row. The single provable deletion ground is a successful read that says the
 * doc does not exist. Denied/outage keeps everything — ambiguity never deletes.
 */
export function pruneDecision(
  read: { ok: boolean; exists: boolean },
  inMirror: boolean,
): PruneDecision {
  if (read.ok && !read.exists) return 'prune';
  if (!read.ok) return 'hide';
  return inMirror ? 'keep' : 'hide';
}

/** Resolve watches to live repo docs, pruning only what's provably gone. */
export async function fetchWatchedRepos(uid: string, myGroupIds: string[]): Promise<WatchedRepo[]> {
  const watches = (await fetchWatches(uid)).slice(0, 20);
  const out = await Promise.all(
    watches.map(async (w): Promise<WatchedRepo | null> => {
      let read: { ok: boolean; exists: boolean };
      let repo: Repo | null = null;
      try {
        const snap = await getDoc(doc(db(), `groups/${w.gid}/repos/${w.repoId}`));
        read = { ok: true, exists: snap.exists() };
        if (snap.exists()) repo = { id: snap.id, ...(snap.data() as Omit<Repo, 'id'>) };
      } catch {
        read = { ok: false, exists: false };
      }
      const decision = pruneDecision(read, myGroupIds.includes(w.gid));
      if (decision === 'prune') {
        void removeWatch(uid, w.gid, w.repoId).catch(() => undefined);
        return null;
      }
      if (decision === 'hide' || !repo) return null;
      return { watch: w, repo };
    }),
  );
  return out
    .filter((x): x is WatchedRepo => x !== null)
    .sort(
      (a, b) => (b.repo?.lastEventAt?.toMillis() ?? 0) - (a.repo?.lastEventAt?.toMillis() ?? 0),
    );
}
