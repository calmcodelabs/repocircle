import { signal } from '@preact/signals';
import { collection, deleteDoc, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { stopPolling } from '../poll/engine';
import { forgetGroup } from './groups';
import type { MyProfile } from './types';

/** Live phase label for the confirmation sheet ("Deleting repos…"). */
export const deleteGroupProgress = signal<string | null>(null);

const BATCH = 400;

async function sweepCollection(path: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const snap = await getDocs(query(collection(db(), path), limit(BATCH)));
    if (snap.empty) return removed;
    const batch = writeBatch(db());
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
  }
}

/**
 * Delete a circle and everything in it. Firestore has no cascade, so this sweeps
 * every subcollection explicitly — and the ORDER is load-bearing: the caller's
 * admin membership must outlive every check that needs it, so other members go
 * before the group doc, and the caller's own membership goes last of all
 * (rules-verified in test/rules/delete-group.test.ts). Re-running after a partial
 * failure is safe: every step is idempotent.
 */
export async function deleteGroupEverything(gid: string, profile: MyProfile): Promise<void> {
  stopPolling(); // don't poll repos out from under the sweep
  const step = (label: string) => {
    deleteGroupProgress.value = label;
  };
  try {
    step('Deleting repo activity…');
    const repos = await getDocs(collection(db(), `groups/${gid}/repos`));
    for (const repo of repos.docs) {
      await sweepCollection(`groups/${gid}/repos/${repo.id}/events`);
      await sweepCollection(`groups/${gid}/repos/${repo.id}/activityDaily`);
    }
    step('Deleting repos…');
    await sweepCollection(`groups/${gid}/repos`);

    step('Deleting asks…');
    const asks = await getDocs(collection(db(), `groups/${gid}/asks`));
    for (const ask of asks.docs) {
      await sweepCollection(`groups/${gid}/asks/${ask.id}/claims`);
    }
    await sweepCollection(`groups/${gid}/asks`);

    step('Deleting invites and requests…');
    await sweepCollection(`groups/${gid}/invites`);
    await sweepCollection(`groups/${gid}/collabRequests`);
    await sweepCollection(`groups/${gid}/integrations`);
    await sweepCollection(`groups/${gid}/auditLog`);
    await sweepCollection(`groups/${gid}/meta`);

    step('Removing members…');
    const members = await getDocs(collection(db(), `groups/${gid}/members`));
    const others = members.docs.filter((d) => d.id !== profile.uid);
    for (let i = 0; i < others.length; i += BATCH) {
      const batch = writeBatch(db());
      others.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    step('Deleting the circle…');
    await deleteDoc(doc(db(), `groups/${gid}`)); // needs own membership → before it
    await deleteDoc(doc(db(), `groups/${gid}/members/${profile.uid}`));
    await forgetGroup(profile.uid, gid);
  } finally {
    deleteGroupProgress.value = null;
  }
}
