import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Ask, Idea, Repo } from './types';

/**
 * M12, widened in M18 — saved things: what I chose to come back to. At two
 * hundred people you can't care about everything; this is how you say what you
 * care about. Self-only subcollection under my user document, so it works
 * across circles and costs nobody else anything.
 *
 * Documents written before M18 carry `repoId`/`fullName` and no `kind`. They
 * are read as repos rather than migrated — a missing field is not a broken one.
 */
export type WatchKind = 'repo' | 'ask' | 'idea';

export type Watch = {
  id: string;
  gid: string;
  kind: WatchKind;
  itemId: string;
  title: string;
  addedAt: Timestamp | null;
};

type RawWatch = {
  gid: string;
  kind?: WatchKind;
  itemId?: string;
  title?: string;
  repoId?: string;
  fullName?: string;
  addedAt: Timestamp | null;
};

/**
 * Repo ids keep their original two-part shape so watches saved before M18 still
 * resolve to the same document; everything since carries its kind.
 */
export function watchId(gid: string, kind: WatchKind, itemId: string): string {
  return kind === 'repo' ? `${gid}_${itemId}` : `${gid}_${kind}_${itemId}`;
}

function normalize(id: string, raw: RawWatch): Watch {
  const kind = raw.kind ?? 'repo';
  return {
    id,
    gid: raw.gid,
    kind,
    itemId: raw.itemId ?? raw.repoId ?? '',
    title: raw.title ?? raw.fullName ?? '',
    addedAt: raw.addedAt,
  };
}

export type Savable = { kind: WatchKind; id: string; title: string };

export const savableRepo = (r: Pick<Repo, 'id' | 'fullName'>): Savable => ({
  kind: 'repo',
  id: r.id,
  title: r.fullName,
});
export const savableAsk = (a: Pick<Ask, 'id' | 'title'>): Savable => ({
  kind: 'ask',
  id: a.id,
  title: a.title,
});
export const savableIdea = (i: Pick<Idea, 'id' | 'title'>): Savable => ({
  kind: 'idea',
  id: i.id,
  title: i.title,
});

export async function addWatch(uid: string, gid: string, s: Savable): Promise<void> {
  await setDoc(doc(db(), `users/${uid}/watches/${watchId(gid, s.kind, s.id)}`), {
    gid,
    kind: s.kind,
    itemId: s.id,
    title: (s.title || s.id).slice(0, 200),
    addedAt: serverTimestamp(),
    v: 1,
  });
}

export async function removeWatch(
  uid: string,
  gid: string,
  kind: WatchKind,
  itemId: string,
): Promise<void> {
  await deleteDoc(doc(db(), `users/${uid}/watches/${watchId(gid, kind, itemId)}`));
}

export async function isWatching(
  uid: string,
  gid: string,
  kind: WatchKind,
  itemId: string,
): Promise<boolean> {
  const snap = await getDoc(doc(db(), `users/${uid}/watches/${watchId(gid, kind, itemId)}`)).catch(
    () => null,
  );
  return !!snap?.exists();
}

export async function fetchWatches(uid: string): Promise<Watch[]> {
  const snap = await getDocs(query(collection(db(), `users/${uid}/watches`), limit(50)));
  return snap.docs.map((d) => normalize(d.id, d.data() as RawWatch));
}

export type SavedItem = { watch: Watch; live: { title: string; href: string } | null };

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

/** Where a saved thing lives, per kind. */
export function watchPath(w: Pick<Watch, 'gid' | 'kind' | 'itemId'>): string {
  const seg = w.kind === 'repo' ? 'repos' : w.kind === 'ask' ? 'asks' : 'ideas';
  return `groups/${w.gid}/${seg}/${w.itemId}`;
}

export function watchHref(w: Pick<Watch, 'gid' | 'kind' | 'itemId'>): string {
  const seg = w.kind === 'repo' ? 'repo' : w.kind === 'ask' ? 'ask' : 'idea';
  return `#/g/${w.gid}/${seg}/${w.itemId}`;
}

/** Resolve saved things to live documents, pruning only what is provably gone. */
export async function fetchSaved(uid: string, myGroupIds: string[]): Promise<SavedItem[]> {
  const watches = await fetchWatches(uid);
  const out = await Promise.all(
    watches.map(async (w): Promise<SavedItem | null> => {
      if (!w.itemId) return null;
      let read: { ok: boolean; exists: boolean };
      let title: string | null = null;
      try {
        const snap = await getDoc(doc(db(), watchPath(w)));
        read = { ok: true, exists: snap.exists() };
        if (snap.exists()) {
          const d = snap.data() as { fullName?: string; title?: string };
          title = d.fullName ?? d.title ?? w.title;
        }
      } catch {
        read = { ok: false, exists: false };
      }
      const decision = pruneDecision(read, myGroupIds.includes(w.gid));
      if (decision === 'prune') {
        void removeWatch(uid, w.gid, w.kind, w.itemId).catch(() => undefined);
        return null;
      }
      if (decision === 'hide' || title === null) return null;
      return { watch: w, live: { title, href: watchHref(w) } };
    }),
  );
  return out
    .filter((x): x is SavedItem => x !== null)
    .sort((a, b) => (b.watch.addedAt?.toMillis() ?? 0) - (a.watch.addedAt?.toMillis() ?? 0));
}
