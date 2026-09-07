import { signal } from '@preact/signals';
import { collection, deleteDoc, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { stopPolling } from '../poll/engine';
import { forgetGroup } from './groups';
import type { MyProfile } from './types';

/** Live phase label for the confirmation sheet ("Deleting repos…"). */
export const deleteGroupProgress = signal<string | null>(null);

const BATCH = 400;

/**
 * Everything that lives under a circle, and what lives under that.
 *
 * This exists as data rather than as a sequence of calls because the sweep was
 * wrong for three milestones: it was written before M15 (ideas), M17
 * (announcements) and M19 (sessions, polls), and each of those shipped a new
 * collection without anyone remembering this file. Deleting a circle left them
 * behind — unreachable, since the group document and every membership were
 * gone, but still stored and still billable.
 *
 * Firestore does not cascade: deleting a document does nothing to its
 * subcollections. So every level has to be named, and naming them in one place
 * is what lets test/static/shape.test.ts check this list against the match
 * blocks in firestore.rules. Add a collection to the rules without adding it
 * here and the build fails, which is the only reliable way to stop this
 * happening a fourth time.
 *
 * `members` is deliberately absent — it is swept last, separately, because the
 * caller's own membership has to outlive every rule check that needs it.
 */
export const CIRCLE_SHAPE: Readonly<Record<string, readonly string[]>> = {
  repos: ['events', 'activityDaily', 'comments', 'interests'],
  asks: ['claims', 'comments'],
  ideas: ['comments', 'interests'],
  sessions: ['interests'],
  polls: ['votes'],
  announcements: [],
  invites: [],
  collabRequests: [],
  integrations: [],
  auditLog: [],
  meta: [],
} as const;

/** Collections under a circle that this sweep handles outside CIRCLE_SHAPE. */
export const SWEPT_SEPARATELY = ['members'] as const;

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
 * Delete a whole collection including each document's subcollections.
 *
 * Children go first: a rule on a child may `get()` its parent, and while an
 * admin short-circuits before that clause, an ordering that only works because
 * of short-circuit evaluation is one refactor away from breaking.
 */
async function sweepTree(base: string, children: readonly string[]): Promise<void> {
  if (children.length > 0) {
    const parents = await getDocs(collection(db(), base));
    for (const parent of parents.docs) {
      for (const child of children) {
        await sweepCollection(`${base}/${parent.id}/${child}`);
      }
    }
  }
  await sweepCollection(base);
}

/**
 * Delete a circle and everything in it.
 *
 * The ORDER is load-bearing: the caller's admin membership must outlive every
 * check that needs it, so other members go before the group document, and the
 * caller's own membership goes last of all (rules-verified in
 * test/rules/delete-group.test.ts). Re-running after a partial failure is safe —
 * every step is idempotent.
 */
export async function deleteGroupEverything(gid: string, profile: MyProfile): Promise<void> {
  stopPolling(); // don't poll repos out from under the sweep
  const step = (label: string) => {
    deleteGroupProgress.value = label;
  };

  // Read as one line in the confirmation sheet: "Deleting repos…". Collections
  // with no natural phase of their own ride along with the previous label.
  const LABELS: Record<string, string> = {
    repos: 'Deleting repos and their activity…',
    asks: 'Deleting asks…',
    ideas: 'Deleting ideas…',
    sessions: 'Deleting sessions…',
    polls: 'Deleting polls…',
    announcements: 'Deleting announcements…',
    invites: 'Deleting invites and requests…',
  };

  try {
    for (const [name, children] of Object.entries(CIRCLE_SHAPE)) {
      if (LABELS[name]) step(LABELS[name]);
      await sweepTree(`groups/${gid}/${name}`, children);
    }

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
