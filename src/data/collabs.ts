import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { audit } from './audit';
import { randomToken } from './ids';
import type { MyProfile, Repo } from './types';

export type CollabRequest = {
  id: string;
  repoId: string;
  repoFullName: string;
  requesterUid: string;
  requesterLogin: string;
  note: string;
  repoOwnerUid: string | null;
  githubIssueNumber?: number | null;
  state: 'pending' | 'accepted' | 'declined' | 'cancelled';
  decidedBy?: string;
  decidedAt?: unknown;
  createdAt: unknown;
};

export async function createCollabRequest(
  gid: string,
  profile: MyProfile,
  repo: Repo,
  note: string,
): Promise<string> {
  const id = randomToken(16);
  await setDoc(doc(db(), `groups/${gid}/collabRequests/${id}`), {
    repoId: repo.id,
    repoFullName: repo.fullName,
    requesterUid: profile.uid,
    requesterLogin: profile.login,
    note,
    repoOwnerUid: repo.ownerUid,
    githubIssueNumber: null,
    state: 'pending',
    createdAt: serverTimestamp(),
    v: 1,
  });
  return id;
}

export async function attachIssueNumber(gid: string, reqId: string, issueNumber: number): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/collabRequests/${reqId}`), { githubIssueNumber: issueNumber });
}

export async function decideCollabRequest(
  gid: string,
  profile: MyProfile,
  reqId: string,
  state: 'accepted' | 'declined',
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/collabRequests/${reqId}`), {
    state,
    decidedBy: profile.uid,
    decidedAt: serverTimestamp(),
  });
  audit(gid, profile, `collab_${state}`, 'collabRequest', reqId);
}

export async function cancelCollabRequest(gid: string, reqId: string): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/collabRequests/${reqId}`), { state: 'cancelled' });
}

/** Requests awaiting MY decision (repos I own in this group). */
export function watchOwnerInbox(gid: string, uid: string, cb: (reqs: CollabRequest[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/collabRequests`),
    where('repoOwnerUid', '==', uid),
    where('state', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabRequest, 'id'>) }))));
}

/** My outgoing requests (any state), newest first. */
export function watchMyRequests(gid: string, uid: string, cb: (reqs: CollabRequest[]) => void): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/collabRequests`),
    where('requesterUid', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabRequest, 'id'>) }))));
}
