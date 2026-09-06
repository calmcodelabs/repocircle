import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { audit } from './audit';
import { randomToken } from './ids';
import type { Invite, MyProfile } from './types';

export type InviteState = 'valid' | 'expired' | 'revoked' | 'missing';

export function inviteState(inv: Invite | null): InviteState {
  if (!inv) return 'missing';
  if (inv.revoked) return 'revoked';
  if (inv.expiresAt.toMillis() <= Date.now()) return 'expired';
  return 'valid';
}

export async function createInvite(
  gid: string,
  profile: MyProfile,
  preview: { groupName: string; groupDescription: string; memberCount: number; repoCount: number },
  role: 'member' | 'guest',
  days: 1 | 7 | 30,
  label: string,
): Promise<string> {
  const token = randomToken(26);
  await setDoc(doc(db(), `groups/${gid}/invites/${token}`), {
    role,
    expiresAt: Timestamp.fromMillis(Date.now() + days * 86_400_000),
    revoked: false,
    createdBy: profile.uid,
    createdByLogin: profile.login,
    // Security rules stop an outsider reading the group itself, so the invite
    // carries what the join screen needs to feel like a real invitation.
    groupName: preview.groupName,
    groupDescription: preview.groupDescription.slice(0, 280),
    memberCount: preview.memberCount,
    repoCount: preview.repoCount,
    createdAt: serverTimestamp(),
    label,
    v: 1,
  });
  audit(gid, profile, 'invite_created', 'invite', token.slice(0, 6) + '…', `${role}, ${days}d`);
  return token;
}

export async function getInvite(gid: string, token: string): Promise<Invite | null> {
  try {
    const snap = await getDoc(doc(db(), `groups/${gid}/invites/${token}`));
    if (!snap.exists()) return null;
    return { token: snap.id, ...(snap.data() as Omit<Invite, 'token'>) };
  } catch {
    return null; // permission-denied etc. — treat as missing, never leak why
  }
}

/** Admin-only by rule; UI must not mount this for non-admins. */
export function watchInvites(gid: string, cb: (list: Invite[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/invites`),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ token: d.id, ...(d.data() as Omit<Invite, 'token'>) })));
  });
}

export async function revokeInvite(gid: string, profile: MyProfile, token: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/invites/${token}`), { revoked: true });
  audit(gid, profile, 'invite_revoked', 'invite', token.slice(0, 6) + '…');
}

export function inviteUrl(gid: string, token: string): string {
  return `${location.origin}${location.pathname}#/join/${gid}/${token}`;
}
