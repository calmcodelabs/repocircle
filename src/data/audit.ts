import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { log } from '../util/log';
import type { MyProfile } from './types';

/** Fire-and-forget audit entry for privileged actions (A-04 groundwork). */
export function audit(
  gid: string,
  actor: MyProfile,
  action: string,
  subjectType: string,
  subjectId: string,
  detail = '',
): void {
  void addDoc(collection(db(), `groups/${gid}/auditLog`), {
    actorUid: actor.uid,
    actorLogin: actor.login,
    action,
    subjectType,
    subjectId,
    detail,
    createdAt: serverTimestamp(),
    v: 1,
  }).catch((e) => log('warn', `audit write failed: ${e.code ?? e}`));
}
