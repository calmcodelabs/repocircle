import { arrayRemove, arrayUnion, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { newGroupId } from './ids';
import type { Group, MyProfile } from './types';

export const DEFAULT_ASK_TAGS = ['frontend', 'backend', 'ML', 'docs', 'testing', 'devops', 'design'];

/** Founder batch: group + admin membership + my groupIds mirror (rules-validated). */
export async function createGroup(profile: MyProfile, name: string, description: string): Promise<string> {
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
