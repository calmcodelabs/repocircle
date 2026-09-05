import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { anonymizeMyContent } from '../util/anonymize';
import { audit } from './audit';
import { forgetGroup } from './groups';
import type { Availability, Invite, Member, MyProfile, Role } from './types';

export function watchMembers(
  gid: string,
  cb: (members: Member[]) => void,
  onError: (code: string) => void,
): Unsubscribe {
  const q = query(collection(db(), `groups/${gid}/members`), orderBy('joinedAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, 'uid'>) }))),
    (err) => onError(err.code),
  );
}

export async function joinViaInvite(gid: string, invite: Invite, profile: MyProfile): Promise<void> {
  const batch = writeBatch(db());
  batch.set(doc(db(), `groups/${gid}/members/${profile.uid}`), {
    role: invite.role,
    login: profile.login,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    availability: { status: 'free' },
    helpWith: [],
    learning: [],
    checklist: {},
    joinedAt: serverTimestamp(),
    joinedVia: invite.token,
    v: 1,
  });
  batch.update(doc(db(), 'users', profile.uid), { groupIds: arrayUnion(gid) });
  await batch.commit();
}

export async function setAvailability(gid: string, uid: string, availability: Availability): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${uid}`), { availability });
}

export async function setRole(gid: string, actor: MyProfile, target: Member, role: Role): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${target.uid}`), { role });
  audit(gid, actor, 'role_changed', 'member', target.login, `→ ${role}`);
}

export async function removeMember(gid: string, actor: MyProfile, target: Member): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/members/${target.uid}`));
  audit(gid, actor, 'member_removed', 'member', target.login);
}

/**
 * Leave = anonymize my authored content (PRD §11 privacy), then drop membership
 * and my mirror entry. Order matters: anonymizing needs my membership intact.
 */
export async function leaveGroup(gid: string, profile: MyProfile): Promise<void> {
  await anonymizeMyContent(gid, profile.uid);
  await deleteDoc(doc(db(), `groups/${gid}/members/${profile.uid}`));
  await forgetGroup(profile.uid, gid);
}
