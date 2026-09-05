import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { createEnv, db, GID, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = db(ctx);
    await setDoc(doc(d, `groups/${GID}/collabRequests/cr1`), {
      repoId: '1',
      repoFullName: 'x/y',
      requesterUid: 'bob',
      requesterLogin: 'bob',
      note: 'hi',
      repoOwnerUid: 'bob',
      state: 'pending',
      createdAt: Timestamp.now(),
      v: 1,
    });
    await setDoc(doc(d, `groups/${GID}/auditLog/a1`), {
      actorUid: 'alice',
      actorLogin: 'alice',
      action: 'x',
      subjectType: 'y',
      subjectId: 'z',
      detail: '',
      createdAt: Timestamp.now(),
      v: 1,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

describe('group deletion', () => {
  it('members cannot delete the group, collab requests, or audit entries', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(deleteDoc(doc(db(bob), `groups/${GID}`)));
    await assertFails(deleteDoc(doc(db(bob), `groups/${GID}/collabRequests/cr1`)));
    await assertFails(deleteDoc(doc(db(bob), `groups/${GID}/auditLog/a1`)));
  });

  it('outsiders cannot delete the group', async () => {
    const mallory = env.authenticatedContext('mallory');
    await assertFails(deleteDoc(doc(db(mallory), `groups/${GID}`)));
  });

  it('admin sweep works in the permission-safe order', async () => {
    const alice = env.authenticatedContext('alice');
    const d = db(alice);
    // 1. subcollection leftovers
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}/collabRequests/cr1`)));
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}/auditLog/a1`)));
    // 2. other members first…
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}/members/bob`)));
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}/members/gia`)));
    // 3. …then the group doc (own membership still present → isAdmin holds)
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}`)));
    // 4. own membership last (me() == uid path needs no group doc)
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}/members/alice`)));
  });

  it('deleting the group doc before own membership is the only valid order', async () => {
    const alice = env.authenticatedContext('alice');
    const d = db(alice);
    await assertSucceeds(deleteDoc(doc(d, `groups/${GID}/members/alice`)));
    // Membership gone → isAdmin() fails → group delete correctly denied.
    await assertFails(deleteDoc(doc(d, `groups/${GID}`)));
  });
});
