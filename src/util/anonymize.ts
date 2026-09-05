import { collection, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Anonymize a leaver's authored content (DATA-MODEL §5): display fields are
 * blanked, authorUid stays (rules key on it). Asks only for now — claims carry
 * a login snapshot that needs a collectionGroup rule; refine when M5 ships asks.
 * Returns how many docs were touched.
 */
export async function anonymizeMyContent(gid: string, uid: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db(), `groups/${gid}/asks`), where('authorUid', '==', uid), limit(400)),
  );
  if (snap.empty) return 0;
  const batch = writeBatch(db());
  snap.forEach((d) => batch.update(d.ref, { authorLogin: '(left the group)', authorAvatarUrl: '' }));
  await batch.commit();
  return snap.size;
}
