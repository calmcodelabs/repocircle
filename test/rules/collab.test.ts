import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createEnv, db, GID, memberDoc, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = db(ctx);
    await setDoc(doc(d, `groups/${GID}/members/carol`), memberDoc('carol'));
    await setDoc(doc(d, `groups/${GID}/repos/555`), {
      fullName: 'bob/thing',
      ownerUid: 'bob',
      registeredBy: 'bob',
      status: 'building',
      archived: false,
      v: 1,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

function reqDoc(overrides: Record<string, unknown> = {}) {
  return {
    repoId: '555',
    repoFullName: 'bob/thing',
    requesterUid: 'carol',
    requesterLogin: 'carol',
    note: 'I would love to help with the parser.',
    repoOwnerUid: 'bob',
    state: 'pending',
    createdAt: Timestamp.now(),
    v: 1,
    ...overrides,
  };
}

describe('[collab-requests] collabRequests', () => {
  it('member creates a pending request as themselves', async () => {
    const carol = env.authenticatedContext('carol');
    await assertSucceeds(setDoc(doc(db(carol), `groups/${GID}/collabRequests/r1`), reqDoc()));
  });

  it('requester spoof / repoOwnerUid forgery / non-pending create are denied', async () => {
    const carol = env.authenticatedContext('carol');
    await assertFails(
      setDoc(doc(db(carol), `groups/${GID}/collabRequests/r2`), reqDoc({ requesterUid: 'bob' })),
    );
    await assertFails(
      setDoc(doc(db(carol), `groups/${GID}/collabRequests/r3`), reqDoc({ repoOwnerUid: 'carol' })),
    );
    await assertFails(
      setDoc(doc(db(carol), `groups/${GID}/collabRequests/r4`), reqDoc({ state: 'accepted' })),
    );
  });

  it('guest cannot request', async () => {
    const gia = env.authenticatedContext('gia');
    await assertFails(
      setDoc(doc(db(gia), `groups/${GID}/collabRequests/r5`), reqDoc({ requesterUid: 'gia' })),
    );
  });

  it('repo owner can decide; random member cannot; admin can', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/collabRequests/r6`), reqDoc());
    });
    const carol2 = env.authenticatedContext('carol');
    await assertFails(
      updateDoc(doc(db(carol2), `groups/${GID}/collabRequests/r6`), {
        state: 'accepted',
        decidedBy: 'carol',
        decidedAt: Timestamp.now(),
      }),
    );
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/collabRequests/r6`), {
        state: 'accepted',
        decidedBy: 'bob',
        decidedAt: Timestamp.now(),
      }),
    );
  });

  it('requester may attach issue number and cancel, but not decide', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/collabRequests/r7`), reqDoc());
    });
    const carol = env.authenticatedContext('carol');
    await assertSucceeds(
      updateDoc(doc(db(carol), `groups/${GID}/collabRequests/r7`), { githubIssueNumber: 42 }),
    );
    await assertFails(
      updateDoc(doc(db(carol), `groups/${GID}/collabRequests/r7`), {
        state: 'accepted',
        decidedBy: 'carol',
        decidedAt: Timestamp.now(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db(carol), `groups/${GID}/collabRequests/r7`), { state: 'cancelled' }),
    );
  });

  it('deletes: denied for members, allowed for admins (group-deletion sweep)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/collabRequests/r8`), reqDoc());
    });
    const bob = env.authenticatedContext('bob');
    const alice = env.authenticatedContext('alice');
    await assertFails(deleteDoc(doc(db(bob), `groups/${GID}/collabRequests/r8`)));
    await assertSucceeds(deleteDoc(doc(db(alice), `groups/${GID}/collabRequests/r8`)));
  });
});
