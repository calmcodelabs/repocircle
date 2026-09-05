import { arrayUnion, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { hasToken } from '../auth/vault';
import { listMyPublicRepos } from '../github/repos';
import { GhError } from '../github/client';
import { log } from '../util/log';
import { getExistingRepoIds, registerRepos } from './repos';
import type { Member, MyProfile } from './types';

// Auto-sharing (PRD F-04): a circle is only worth opening if members' repos are
// actually in it. Members opting into 'auto' get their public repos registered,
// including ones they create later — without ever touching private repos.

const MIN_SYNC_GAP_MS = 10 * 60_000;

export async function setRepoSyncMode(
  gid: string,
  uid: string,
  mode: 'auto' | 'manual',
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${uid}`), {
    'repoSync.mode': mode,
    'repoSync.decidedAt': serverTimestamp(),
  });
}

/** Remember a hand-removed repo so auto-sync doesn't bring it back. */
export async function excludeFromSync(gid: string, uid: string, repoId: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${uid}`), {
    'repoSync.excluded': arrayUnion(repoId),
  }).catch(() => undefined);
}

/** Has this member made a sharing choice for this circle yet? */
export function hasDecidedSharing(member: Member | null): boolean {
  return !!member?.repoSync?.mode;
}

/**
 * Register any public repos of mine that this circle doesn't have yet.
 * Skips forks and archived repos (noise), and anything I removed by hand.
 * Cheap: one ETag-cached listing, and nothing is written when there's nothing new.
 */
export async function syncMyRepos(
  gid: string,
  profile: MyProfile,
  member: Member,
): Promise<number> {
  if (member.repoSync?.mode !== 'auto' || !hasToken()) return 0;

  const key = `rc.repoSync.${gid}`;
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < MIN_SYNC_GAP_MS) return 0;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable — sync anyway */
  }

  try {
    const [mine, existing] = await Promise.all([listMyPublicRepos(), getExistingRepoIds(gid)]);
    const excluded = new Set(member.repoSync.excluded ?? []);
    const fresh = mine.filter(
      (r) => !r.fork && !r.archived && !existing.has(String(r.id)) && !excluded.has(String(r.id)),
    );
    if (fresh.length === 0) return 0;
    const added = await registerRepos(gid, profile, fresh);
    if (added > 0) log('info', `repo sync added ${added}`);
    return added;
  } catch (e) {
    log('warn', `repo sync failed: ${e instanceof GhError ? e.kind : 'unknown'}`);
    return 0;
  }
}
