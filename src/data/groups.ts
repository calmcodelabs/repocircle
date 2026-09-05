import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { newGroupId } from './ids';
import type { Group, MyProfile } from './types';

/**
 * Creating a group and joining one both `update` users/{uid} inside a batch, which
 * fails outright if that document is missing — and the local cache can happily
 * report a profile that no longer exists on the server, so the whole write
 * disappeared silently. Verify against the server and rebuild before writing.
 */
export async function ensureUserDoc(profile: MyProfile): Promise<void> {
  const ref = doc(db(), 'users', profile.uid);
  try {
    const snap = await getDocFromServer(ref);
    if (snap.exists()) return;
  } catch {
    // Offline or transient: let the caller's write decide the outcome.
    return;
  }
  await setDoc(ref, {
    githubId: 0,
    login: profile.login,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    scopesGranted: [],
    groupIds: [],
    checklist: {},
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    v: 1,
  });
}

export const DEFAULT_ASK_TAGS = ['frontend', 'backend', 'ML', 'docs', 'testing', 'devops', 'design'];

/** Founder batch: group + admin membership + my groupIds mirror (rules-validated). */
export async function createGroup(profile: MyProfile, name: string, description: string): Promise<string> {
  await ensureUserDoc(profile);
  const gid = newGroupId();
  const batch = writeBatch(db());
  batch.set(doc(db(), 'groups', gid), {
    name,
    description,
    visibility: 'private',
    createdBy: profile.uid,
    memberCount: 1,
    settings: { askTags: DEFAULT_ASK_TAGS, defaultRole: 'member' },
    createdAt: serverTimestamp(),
    v: 1,
  });
  batch.set(doc(db(), `groups/${gid}/members/${profile.uid}`), {
    role: 'admin',
    login: profile.login,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    availability: { status: 'free' },
    helpWith: [],
    learning: [],
    checklist: {},
    joinedAt: serverTimestamp(),
    joinedVia: 'founder',
    v: 1,
  });
  batch.update(doc(db(), 'users', profile.uid), { groupIds: arrayUnion(gid) });
  await batch.commit();
  // Confirm it reached the server: a local-only write would otherwise look like success.
  const check = await getDocFromServer(doc(db(), 'groups', gid)).catch(() => null);
  if (!check?.exists()) throw new Error('group-not-persisted');
  return gid;
}

export async function fetchGroup(gid: string): Promise<Group | null> {
  const snap = await getDoc(doc(db(), 'groups', gid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Group, 'id'>) };
}

export async function fetchMyGroups(groupIds: string[]): Promise<Group[]> {
  const results = await Promise.allSettled(groupIds.map(fetchGroup));
  return results
    .filter((r): r is PromiseFulfilledResult<Group> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

export async function updateGroupProfile(gid: string, name: string, description: string): Promise<void> {
  await updateDoc(doc(db(), 'groups', gid), { name, description });
}

/** Drop a group from my mirror (used after leaving). */
export async function forgetGroup(uid: string, gid: string): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { groupIds: arrayRemove(gid) });
}
