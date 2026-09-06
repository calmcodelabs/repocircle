import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  increment,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { resilientWatch } from './resilientWatch';
import type { CircleSummary, SummaryLink } from './types';

/**
 * M16 — the circle summary doc (ADR-021). Home used to answer "how many
 * members, how many repos, how many asks are open" by reading every member,
 * every repo and every ask; at two hundred members that was ~900 reads a visit.
 *
 * It holds counts and nothing else. Firestore bills documents returned rather
 * than scanned, so every *list* Home shows is a bounded query over the real
 * documents — cheap at any circle size and never stale. A count is the one
 * thing no bounded query can give you, which is why this document exists.
 *
 * Spark has no triggers, so member clients maintain it at write time and every
 * update is best-effort: a mirror that fails must never fail the join that
 * triggered it (REVIEW.md deliberate exceptions). The counts are display-only
 * (Class A) — nothing authorizes on them — and rebuildSummary() repairs drift.
 */

export function summaryRef(gid: string) {
  return doc(db(), `groups/${gid}/meta/summary`);
}

/** null = no summary doc yet (a circle created before M16, or a failed init). */
export function watchSummary(
  gid: string,
  cb: (s: CircleSummary | null) => void,
  onError: (code: string) => void,
): Unsubscribe {
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        summaryRef(gid),
        (snap) => {
          onOk();
          cb(snap.exists() ? (snap.data() as CircleSummary) : null);
        },
        onErr,
      ),
    { onGiveUp: onError },
  );
}

/** Counters move by increment() only — Class C. */
async function bump(gid: string, fields: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(summaryRef(gid), { ...fields, v: 1 }, { merge: true });
  } catch {
    // Best-effort by design: losing a count is cheaper than failing the action
    // that caused it. rebuildSummary() is the repair path.
  }
}

export async function initSummary(gid: string): Promise<void> {
  await bump(gid, { memberCount: 1, repoCount: 0, openAskCount: 0 });
}

export async function noteMemberJoined(gid: string): Promise<void> {
  await bump(gid, { memberCount: increment(1) });
}

export async function noteMemberLeft(gid: string): Promise<void> {
  await bump(gid, { memberCount: increment(-1) });
}

export async function noteReposRegistered(gid: string, count: number): Promise<void> {
  if (count > 0) await bump(gid, { repoCount: increment(count) });
}

export async function noteRepoRemoved(gid: string): Promise<void> {
  await bump(gid, { repoCount: increment(-1) });
}

export async function noteAskOpened(gid: string): Promise<void> {
  await bump(gid, { openAskCount: increment(1) });
}

export async function noteAskClosed(gid: string): Promise<void> {
  await bump(gid, { openAskCount: increment(-1) });
}

/**
 * Repair path: recount from the collections the mirror mirrors. Aggregation
 * queries bill one read per batch of documents scanned rather than one per
 * document, so this is cheap even on a large circle — but it always goes to
 * the server and cannot fall back to cache, so it runs on demand only: an
 * admin's Rebuild in Settings, or once when a circle has no summary at all.
 */
export async function rebuildSummary(gid: string): Promise<void> {
  const [members, repos, asks] = await Promise.all([
    getCountFromServer(collection(db(), `groups/${gid}/members`)),
    getCountFromServer(
      query(collection(db(), `groups/${gid}/repos`), where('archived', '==', false)),
    ),
    getCountFromServer(
      query(collection(db(), `groups/${gid}/asks`), where('state', 'in', ['open', 'claimed'])),
    ),
  ]);
  await setDoc(
    summaryRef(gid),
    {
      memberCount: members.data().count,
      repoCount: repos.data().count,
      openAskCount: asks.data().count,
      v: 1,
    },
    { merge: true },
  );
}

/**
 * M17 — the admin surface. These are the only summary keys the rules restrict
 * to admins, which is why they go through their own writer rather than bump():
 * a failure here is a failed action the admin should hear about, not a mirror
 * update worth swallowing.
 */
export async function setCircleLinks(gid: string, links: SummaryLink[]): Promise<void> {
  await setDoc(summaryRef(gid), { links: links.slice(0, 6), v: 1 }, { merge: true });
}

export async function setPinnedRepo(gid: string, repoId: string | null): Promise<void> {
  await setDoc(summaryRef(gid), { pinnedRepoId: repoId, v: 1 }, { merge: true });
}

export async function summaryExists(gid: string): Promise<boolean> {
  const snap = await getDoc(summaryRef(gid)).catch(() => null);
  return !!snap?.exists();
}
