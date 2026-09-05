import {
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
import type { MyProfile, Repo, RepoStatus } from './types';

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
export async function registerRepos(gid: string, me: MyProfile, ghRepos: GhRepo[]): Promise<number> {
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
    // Onboarding checklist signal (F-12); best-effort.
    void updateDoc(doc(db(), `groups/${gid}/members/${me.uid}`), {
      'checklist.addedRepo': true,
    }).catch(() => undefined);
  }
  return fresh.length;
}

export async function setRepoStatus(gid: string, repoId: string, status: RepoStatus): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/repos/${repoId}`), { status });
}

/** Deregister: sweep subcollections (events, activityDaily), then the doc. */
export async function removeRepo(gid: string, me: MyProfile, repo: Repo): Promise<void> {
  for (const sub of ['events', 'activityDaily']) {
    for (;;) {
      const snap = await getDocs(query(collection(db(), `groups/${gid}/repos/${repo.id}/${sub}`), limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db());
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(doc(db(), `groups/${gid}/repos/${repo.id}`));
  audit(gid, me, 'repo_removed', 'repo', repo.fullName);
}

/** Non-null iff the member may edit status/remove this repo (mirrors rules). */
export function canManageRepo(repo: Repo, uid: string | undefined, isAdmin: boolean): boolean {
  return !!uid && (isAdmin || repo.ownerUid === uid || repo.registeredBy === uid);
}

