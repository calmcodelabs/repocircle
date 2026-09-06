import {
  increment,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { GhRepo } from '../github/types';
import { audit } from './audit';
import { resilientWatch } from './resilientWatch';
import { noteReposRegistered, noteRepoRemoved, noteWants, type WantChange } from './summary';
import type { MyProfile, Repo, RepoInterest, RepoNeed, RepoStatus } from './types';

/** Map a GitHub API repo onto our doc shape (rules-compatible: clamps + allowlists). */
export function toRepoDoc(gh: GhRepo, me: MyProfile) {
  const demo = gh.homepage && gh.homepage.startsWith('https://') ? gh.homepage : null;
  return {
    fullName: gh.full_name.slice(0, 140),
    htmlUrl: gh.html_url,
    description: gh.description ? gh.description.slice(0, 500) : null,
    language: gh.language ?? null,
    topics: (gh.topics ?? []).slice(0, 6),
    githubOwnerLogin: gh.owner.login,
    ownerUid: gh.owner.login.toLowerCase() === me.login.toLowerCase() ? me.uid : null,
    registeredBy: me.uid,
    status: 'building' as RepoStatus,
    demoUrl: demo,
    archived: false,
    lastEventAt: gh.pushed_at ? Timestamp.fromDate(new Date(gh.pushed_at)) : null,
    poll: { lastPolledAt: null, etag: null, failing: false },
    stats7d: { commits: 0, prsOpened: 0, prsMerged: 0, issues: 0, releases: 0 },
    createdAt: serverTimestamp(),
    v: 1,
  };
}

export function watchRepos(
  gid: string,
  cb: (repos: Repo[]) => void,
  onError: (code: string) => void,
): Unsubscribe {
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        collection(db(), `groups/${gid}/repos`),
        (snap) => {
          onOk();
          const repos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Repo, 'id'>) }));
          repos.sort((a, b) => (b.lastEventAt?.toMillis() ?? 0) - (a.lastEventAt?.toMillis() ?? 0));
          cb(repos);
        },
        onErr,
      ),
    { onGiveUp: onError },
  );
}

export async function getExistingRepoIds(gid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db(), `groups/${gid}/repos`));
  return new Set(snap.docs.map((d) => d.id));
}

/** Register repos that aren't already in the group. Returns how many were added. */
export async function registerRepos(
  gid: string,
  me: MyProfile,
  ghRepos: GhRepo[],
): Promise<number> {
  const existing = await getExistingRepoIds(gid);
  const fresh = ghRepos.filter((r) => !existing.has(String(r.id)));
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = writeBatch(db());
    for (const gh of fresh.slice(i, i + 400)) {
      batch.set(doc(db(), `groups/${gid}/repos/${gh.id}`), toRepoDoc(gh, me));
    }
    await batch.commit();
  }
  if (fresh.length > 0) {
    await noteReposRegistered(
      gid,
      fresh.map((gh) => ({
        repoId: String(gh.id),
        fullName: gh.full_name.slice(0, 140),
        language: gh.language ?? null,
        ownerLogin: gh.owner.login,
        at: Timestamp.now(),
      })),
    );
    // Onboarding checklist signal (F-12); best-effort.
    void updateDoc(doc(db(), `groups/${gid}/members/${me.uid}`), {
      'checklist.addedRepo': true,
    }).catch(() => undefined);
  }
  return fresh.length;
}

export async function setRepoStatus(
  gid: string,
  repoId: string,
  status: RepoStatus,
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/repos/${repoId}`), { status });
}

/** Deregister: sweep subcollections (events, activityDaily), then the doc. */
export async function removeRepo(gid: string, me: MyProfile, repo: Repo): Promise<void> {
  for (const sub of ['events', 'activityDaily']) {
    for (;;) {
      const snap = await getDocs(
        query(collection(db(), `groups/${gid}/repos/${repo.id}/${sub}`), limit(400)),
      );
      if (snap.empty) break;
      const batch = writeBatch(db());
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(doc(db(), `groups/${gid}/repos/${repo.id}`));
  await noteRepoRemoved(gid, repo.id);
  audit(gid, me, 'repo_removed', 'repo', repo.fullName);
}

/** Non-null iff the member may edit status/remove this repo (mirrors rules). */
export function canManageRepo(repo: Repo, uid: string | undefined, isAdmin: boolean): boolean {
  return !!uid && (isAdmin || repo.ownerUid === uid || repo.registeredBy === uid);
}

export type MyRepo = Repo & { gid: string; groupName: string };

/**
 * Repos I own, across all my groups (personal homepage). One query per group —
 * groupIds is small by design. Groups that deny (stale mirror) are skipped.
 */
export async function fetchMyRepos(
  groups: Array<{ id: string; name: string }>,
  uid: string,
): Promise<MyRepo[]> {
  const { getDocs: gd, query: q, where, collection: coll } = await import('firebase/firestore');
  const results = await Promise.allSettled(
    groups.map(async (g) => {
      const snap = await gd(q(coll(db(), `groups/${g.id}/repos`), where('ownerUid', '==', uid)));
      return snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Repo, 'id'>),
        gid: g.id,
        groupName: g.name,
      }));
    }),
  );
  const repos = results
    .filter((r): r is PromiseFulfilledResult<MyRepo[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
  repos.sort((a, b) => (b.lastEventAt?.toMillis() ?? 0) - (a.lastEventAt?.toMillis() ?? 0));
  return repos;
}

// --- Idea board (M9) ---

/** Owner-authored idea fields: the pitch, what help is wanted, how to browse it. */
export async function setIdeaDetails(
  gid: string,
  repo: Pick<Repo, 'id' | 'fullName'>,
  fields: { pitch: string; needs: RepoNeed | null; domainTags: string[]; seekingOwner: boolean },
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/repos/${repo.id}`), {
    pitch: fields.pitch.slice(0, 200),
    needs: fields.needs,
    domainTags: fields.domainTags.slice(0, 4),
    seekingOwner: fields.seekingOwner,
  });
  await noteWants(gid, [
    {
      repoId: repo.id,
      fullName: repo.fullName,
      needs: fields.needs,
      seekingOwner: fields.seekingOwner,
    },
  ]);
}

export function watchInterests(
  gid: string,
  repoId: string,
  cb: (list: RepoInterest[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db(), `groups/${gid}/repos/${repoId}/interests`), (snap) =>
    cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<RepoInterest, 'uid'>) }))),
  );
}

/** One tap: "this looks good, I'd help." Deliberately lighter than a collab request. */
export async function addInterest(
  gid: string,
  repo: Pick<Repo, 'id' | 'ownerUid'>,
  profile: MyProfile,
): Promise<void> {
  const batch = writeBatch(db());
  batch.set(doc(db(), `groups/${gid}/repos/${repo.id}/interests/${profile.uid}`), {
    login: profile.login,
    avatarUrl: profile.avatarUrl,
    // Denormalized for the owner's away-inbox; rules verify both against parents.
    gid,
    repoOwnerUid: repo.ownerUid,
    createdAt: serverTimestamp(),
    v: 1,
  });
  batch.update(doc(db(), `groups/${gid}/repos/${repo.id}`), { interestCount: increment(1) });
  await batch.commit();
}

/**
 * A departing member's repos don't leave with them — they stay, flagged as
 * waiting for adoption, so comments, interest and history survive and the
 * M12 handover machinery can give them a live owner. Never deletes anything.
 */
export async function markReposOwnerLeft(gid: string, ownerUid: string): Promise<number> {
  const { getDocs, query: q, where } = await import('firebase/firestore');
  const snap = await getDocs(
    q(collection(db(), `groups/${gid}/repos`), where('ownerUid', '==', ownerUid)),
  );
  if (snap.empty) return 0;
  const batch = writeBatch(db());
  const changes: WantChange[] = [];
  snap.forEach((d) => {
    batch.update(d.ref, { seekingOwner: true, ownerLeft: true });
    const r = d.data() as Omit<Repo, 'id'>;
    changes.push({
      repoId: d.id,
      fullName: r.fullName,
      needs: r.needs ?? null,
      seekingOwner: true,
    });
  });
  await batch.commit();
  await noteWants(gid, changes);
  return snap.size;
}

/** Admin affordance for repos orphaned before this existed. */
export async function markRepoOwnerLeft(gid: string, repo: Repo): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/repos/${repo.id}`), {
    seekingOwner: true,
    ownerLeft: true,
  });
  await noteWants(gid, [
    {
      repoId: repo.id,
      fullName: repo.fullName,
      needs: repo.needs ?? null,
      seekingOwner: true,
    },
  ]);
}

/**
 * Handover: ownership moves to a member who raised their hand. One write, the
 * credit line ("taken over by @x · started by @y") reads straight from it.
 */
export async function adoptRepo(
  gid: string,
  actor: MyProfile,
  repo: Repo,
  adopter: { uid: string; login: string },
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/repos/${repo.id}`), {
    ownerUid: adopter.uid,
    adoptedByUid: adopter.uid,
    adoptedByLogin: adopter.login,
    adoptedFromLogin: repo.adoptedFromLogin ?? repo.githubOwnerLogin,
    adoptedAt: serverTimestamp(),
    seekingOwner: false,
    ownerLeft: false,
  });
  await noteWants(gid, [
    {
      repoId: repo.id,
      fullName: repo.fullName,
      needs: repo.needs ?? null,
      seekingOwner: false,
    },
  ]);
  audit(gid, actor, 'repo_adopted', 'repo', repo.fullName, `→ @${adopter.login}`);
}

export async function removeInterest(gid: string, repoId: string, uid: string): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(doc(db(), `groups/${gid}/repos/${repoId}/interests/${uid}`));
  batch.update(doc(db(), `groups/${gid}/repos/${repoId}`), { interestCount: increment(-1) });
  await batch.commit();
}
