import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { resilientWatch } from './resilientWatch';
import { dropById, prependAllCapped, prependCapped, pruneOlderThan } from '../util/summaryLists';
import type {
  CircleSummary,
  Member,
  Repo,
  SummaryArrival,
  SummaryFace,
  SummaryNeed,
  SummaryNewRepo,
} from './types';

/**
 * M16 — the circle summary doc (ADR-021). One document that answers everything
 * Home used to answer by reading whole collections: how many members, how many
 * repos, how many asks are open, who arrived, what is new, what wants a hand.
 *
 * Spark has no triggers, so member clients maintain it at write time. Every
 * update here is best-effort: a mirror that fails to update must never fail the
 * join or the registration that triggered it (REVIEW.md deliberate exceptions).
 * Everything in it is display-only — tap through and the authoritative doc
 * decides (Class A). rebuildSummary() repairs drift.
 */

export const SUMMARY_CAPS = {
  faces: 8,
  arrivals: 5,
  newRepos: 6,
  wantsAHand: 10,
  links: 6,
} as const;

const NEW_REPO_WINDOW_MS = 7 * 86_400_000;
const ARRIVAL_WINDOW_MS = 7 * 86_400_000;

export function summaryRef(gid: string) {
  return doc(db(), `groups/${gid}/meta/summary`);
}

/** undefined = still loading; null = no summary doc yet (pre-M16 circle). */
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

type Lists = Partial<Pick<CircleSummary, 'faces' | 'arrivals' | 'newRepos' | 'wantsAHand'>>;

/**
 * Counter deltas write straight through (increment() — Class C). List edits
 * need the current value, so they read first and race: two people registering
 * repos in the same second can cost one card off a display block. That is the
 * trade ADR-021 makes deliberately, and it is the reason nothing acts on it.
 */
async function patch(
  gid: string,
  counters: Record<string, unknown>,
  editLists?: (cur: Partial<CircleSummary>) => Lists,
): Promise<void> {
  try {
    let lists: Lists = {};
    if (editLists) {
      const snap = await getDoc(summaryRef(gid));
      lists = editLists((snap.data() ?? {}) as Partial<CircleSummary>);
    }
    await setDoc(summaryRef(gid), { ...counters, ...lists, v: 1 }, { merge: true });
  } catch {
    // Best-effort by design: losing a mirror update is cheaper than failing the
    // action that caused it. rebuildSummary() is the repair path.
  }
}

const faceOf = (f: SummaryFace) => f.uid;
const repoIdOf = (r: { repoId: string }) => r.repoId;

export function toFace(m: Pick<Member, 'uid' | 'login' | 'avatarUrl'>): SummaryFace {
  return { uid: m.uid, login: m.login, avatarUrl: m.avatarUrl };
}

/**
 * Founders are not arrivals — "New in the circle" would otherwise greet the
 * person who made it (fixed once already in M14; the rule lives here now).
 */
export async function noteMemberJoined(
  gid: string,
  member: SummaryFace,
  opts: { founder: boolean },
): Promise<void> {
  const at = Timestamp.now();
  await patch(gid, { memberCount: increment(1) }, (cur) => ({
    faces: prependCapped(cur.faces, member, faceOf, SUMMARY_CAPS.faces),
    arrivals: opts.founder
      ? (cur.arrivals ?? [])
      : prependCapped<SummaryArrival>(
          pruneOlderThan(cur.arrivals, (a) => a.at, ARRIVAL_WINDOW_MS, Date.now()),
          { ...member, at },
          faceOf,
          SUMMARY_CAPS.arrivals,
        ),
  }));
}

export async function noteMemberLeft(gid: string, uid: string): Promise<void> {
  await patch(gid, { memberCount: increment(-1) }, (cur) => ({
    faces: dropById(cur.faces, uid, faceOf),
    arrivals: dropById(cur.arrivals, uid, faceOf),
  }));
}

export function toNewRepo(r: Pick<Repo, 'id' | 'fullName' | 'language' | 'githubOwnerLogin'>) {
  return {
    repoId: r.id,
    fullName: r.fullName,
    language: r.language ?? null,
    ownerLogin: r.githubOwnerLogin,
    at: Timestamp.now(),
  };
}

export async function noteReposRegistered(gid: string, repos: SummaryNewRepo[]): Promise<void> {
  if (repos.length === 0) return;
  await patch(gid, { repoCount: increment(repos.length) }, (cur) => ({
    newRepos: prependAllCapped(
      pruneOlderThan(cur.newRepos, (r) => r.at, NEW_REPO_WINDOW_MS, Date.now()),
      repos,
      repoIdOf,
      SUMMARY_CAPS.newRepos,
    ),
  }));
}

export async function noteRepoRemoved(gid: string, repoId: string): Promise<void> {
  await patch(gid, { repoCount: increment(-1) }, (cur) => ({
    newRepos: dropById(cur.newRepos, repoId, repoIdOf),
    wantsAHand: dropById(cur.wantsAHand, repoId, repoIdOf),
  }));
}

/**
 * What a repo is waiting for — a declared need, or an owner who left. Both
 * feed the same Home block and the M11 matcher, so they share one mirror
 * entry. Takes a batch because a departing member can orphan many repos at
 * once, and that should cost one write, not one per repo.
 *
 * `since` is the moment it started waiting and survives edits that do not
 * change what it wants; M18 orders the longest-waiting first from it.
 */
export type WantChange = {
  repoId: string;
  fullName: string;
  needs: SummaryNeed['needs'];
  seekingOwner: boolean;
};

export async function noteWants(gid: string, changes: WantChange[]): Promise<void> {
  if (changes.length === 0) return;
  await patch(gid, {}, (cur) => {
    let list: SummaryNeed[] = cur.wantsAHand ?? [];
    for (const c of changes) {
      if (!c.needs && !c.seekingOwner) {
        list = dropById(list, c.repoId, repoIdOf);
        continue;
      }
      const prev = list.find((w) => w.repoId === c.repoId);
      const same = prev && prev.needs === c.needs && !!prev.seekingOwner === c.seekingOwner;
      const entry: SummaryNeed = {
        repoId: c.repoId,
        fullName: c.fullName,
        needs: c.needs,
        ...(c.seekingOwner ? { seekingOwner: true } : {}),
        since: same ? (prev.since ?? Timestamp.now()) : Timestamp.now(),
      };
      list = prependCapped(list, entry, repoIdOf, SUMMARY_CAPS.wantsAHand);
    }
    return { wantsAHand: list };
  });
}

/** Founder's circle starts with an explicit zeroed mirror rather than gaps. */
export async function initSummary(gid: string, founder: SummaryFace): Promise<void> {
  await patch(gid, {
    memberCount: 1,
    repoCount: 0,
    openAskCount: 0,
    faces: [founder],
    arrivals: [],
    newRepos: [],
    wantsAHand: [],
  });
}

export async function noteAskOpened(gid: string): Promise<void> {
  await patch(gid, { openAskCount: increment(1) });
}

export async function noteAskClosed(gid: string): Promise<void> {
  await patch(gid, { openAskCount: increment(-1) });
}

/**
 * Repair path: recompute the whole mirror from the collections it mirrors.
 * This is the expensive read the rest of M16 exists to avoid, so it runs only
 * on demand — an admin's "rebuild" in Settings, or once when a circle that
 * predates M16 has no summary at all.
 */
export async function rebuildSummary(gid: string): Promise<void> {
  const now = Date.now();
  const [membersSnap, reposSnap, asksSnap] = await Promise.all([
    getDocs(query(collection(db(), `groups/${gid}/members`), orderBy('joinedAt', 'desc'))),
    getDocs(collection(db(), `groups/${gid}/repos`)),
    getDocs(
      query(collection(db(), `groups/${gid}/asks`), where('state', 'in', ['open', 'claimed'])),
    ),
  ]);

  const members = membersSnap.docs.map((d) => ({
    uid: d.id,
    ...(d.data() as Omit<Member, 'uid'>),
  }));
  const repos = reposSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Repo, 'id'>) }));
  const live = repos.filter((r) => !r.archived);

  const arrivals: SummaryArrival[] = members
    .filter(
      (m) => m.joinedVia !== 'founder' && now - (m.joinedAt?.toMillis() ?? 0) <= ARRIVAL_WINDOW_MS,
    )
    .slice(0, SUMMARY_CAPS.arrivals)
    .map((m) => ({ ...toFace(m), at: m.joinedAt }));

  const newRepos: SummaryNewRepo[] = [...live]
    .filter((r) => now - (r.createdAt?.toMillis() ?? 0) <= NEW_REPO_WINDOW_MS)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .slice(0, SUMMARY_CAPS.newRepos)
    .map((r) => ({
      repoId: r.id,
      fullName: r.fullName,
      language: r.language ?? null,
      ownerLogin: r.githubOwnerLogin,
      at: r.createdAt,
    }));

  const wantsAHand: SummaryNeed[] = live
    .filter((r) => !!r.needs || !!r.seekingOwner)
    .slice(0, SUMMARY_CAPS.wantsAHand)
    .map((r) => ({
      repoId: r.id,
      fullName: r.fullName,
      needs: r.needs ?? null,
      ...(r.seekingOwner ? { seekingOwner: true } : {}),
      // The moment it started waiting is not recorded on the repo, so a rebuild
      // dates it from the repo instead — honest, and only ever a repair.
      since: r.createdAt,
    }));

  await setDoc(
    summaryRef(gid),
    {
      memberCount: members.length,
      repoCount: live.length,
      openAskCount: asksSnap.size,
      faces: members.slice(0, SUMMARY_CAPS.faces).map(toFace),
      arrivals,
      newRepos,
      wantsAHand,
      v: 1,
    },
    { merge: true },
  );
}

/** Bounded probe used by Home to decide whether a rebuild is worth offering. */
export async function summaryExists(gid: string): Promise<boolean> {
  const snap = await getDoc(summaryRef(gid)).catch(() => null);
  return !!snap?.exists();
}
