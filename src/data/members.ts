import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  limit,
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
import { ensureUserDoc, forgetGroup } from './groups';
import { resilientWatch } from './resilientWatch';
import { markReposOwnerLeft } from './repos';
import { noteMemberJoined, noteMemberLeft } from './summary';
import type { Availability, HelpArea, Invite, Member, MyProfile, Role } from './types';

export function watchMembers(
  gid: string,
  cb: (members: Member[]) => void,
  onError: (code: string) => void,
): Unsubscribe {
  const q = query(collection(db(), `groups/${gid}/members`), orderBy('joinedAt', 'asc'));
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        q,
        (snap) => {
          onOk();
          cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, 'uid'>) })));
        },
        onErr,
      ),
    { onGiveUp: onError },
  );
}

/**
 * M16 — the newest members, which is all Home needs: the avatar strip shows
 * eight and "New in the circle" shows arrivals. The full list belongs to the
 * Members page, which paginates it.
 */
export function watchRecentMembers(
  gid: string,
  cb: (members: Member[]) => void,
  onError: (code: string) => void,
  max = 8,
): Unsubscribe {
  const q = query(
    collection(db(), `groups/${gid}/members`),
    orderBy('joinedAt', 'desc'),
    limit(max),
  );
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        q,
        (snap) => {
          onOk();
          cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, 'uid'>) })));
        },
        onErr,
      ),
    { onGiveUp: onError },
  );
}

export async function joinViaInvite(
  gid: string,
  invite: Invite,
  profile: MyProfile,
): Promise<void> {
  await ensureUserDoc(profile);
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
  // Firestore applies writes locally first, so a batch the server later rejects
  // still looks like a successful join. Confirm the membership actually landed.
  const check = await getDocFromServer(doc(db(), `groups/${gid}/members/${profile.uid}`)).catch(
    () => null,
  );
  if (!check?.exists()) throw new Error('join-not-persisted');
  // Only after the membership is provably on the server: a mirror that counts
  // a join the server rejected would be worse than one that lags.
  await noteMemberJoined(gid);
}

/** Self-only (rules-enforced): what I can help with + what I'm learning. */
export async function setSkills(
  gid: string,
  uid: string,
  skills: { helpWith: HelpArea[]; learning: string[] },
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${uid}`), {
    helpWith: skills.helpWith,
    learning: skills.learning,
    'checklist.saidHelpWith': true,
  });
}

export async function setAvailability(
  gid: string,
  uid: string,
  availability: Availability,
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${uid}`), { availability });
}

export async function setRole(
  gid: string,
  actor: MyProfile,
  target: Member,
  role: Role,
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/members/${target.uid}`), { role });
  audit(gid, actor, 'role_changed', 'member', target.login, `→ ${role}`);
}

export async function removeMember(gid: string, actor: MyProfile, target: Member): Promise<void> {
  // Their repos stay behind, flagged for adoption — before the membership goes,
  // so a partial failure leaves a member with flagged repos, not orphans.
  const orphaned = await markReposOwnerLeft(gid, target.uid);
  await deleteDoc(doc(db(), `groups/${gid}/members/${target.uid}`));
  await noteMemberLeft(gid);
  audit(
    gid,
    actor,
    'member_removed',
    'member',
    target.login,
    orphaned > 0 ? `${orphaned} repo(s) up for adoption` : undefined,
  );
}

/**
 * Leave = anonymize my authored content (PRD §11 privacy), then drop membership
 * and my mirror entry. Order matters: anonymizing needs my membership intact.
 */
export async function leaveGroup(gid: string, profile: MyProfile): Promise<void> {
  await anonymizeMyContent(gid, profile.uid);
  await markReposOwnerLeft(gid, profile.uid); // while my membership still authorizes it
  await noteMemberLeft(gid); // ditto — the mirror write needs membership
  await deleteDoc(doc(db(), `groups/${gid}/members/${profile.uid}`));
  await forgetGroup(profile.uid, gid);
}
