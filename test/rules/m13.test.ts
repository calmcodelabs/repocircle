import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { createEnv, db, GID, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `groups/${GID}/repos/222`), {
      fullName: 'bob/leftover',
      htmlUrl: 'https://github.com/bob/leftover',
      description: null,
      language: 'Python',
      topics: [],
      githubOwnerLogin: 'bob',
      ownerUid: 'bob',
      registeredBy: 'bob',
      status: 'building',
      demoUrl: null,
      archived: false,
      lastEventAt: Timestamp.now(),
      poll: { lastPolledAt: null, etag: null, failing: false },
      stats7d: { commits: 0, prsOpened: 0, prsMerged: 0, issues: 0, releases: 0 },
      createdAt: Timestamp.now(),
      v: 1,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

// M13: departures flag repos for adoption instead of orphaning them.
describe('ownerLeft', () => {
  it('admin can flag a member’s repos on removal', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(
      updateDoc(doc(db(alice), `groups/${GID}/repos/222`), { seekingOwner: true, ownerLeft: true }),
    );
  });

  it('the owner can flag their own repos when leaving', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/repos/222`), { seekingOwner: true, ownerLeft: true }),
    );
  });

  it('an unrelated member cannot flag someone else’s repo', async () => {
    const gia = env.authenticatedContext('gia');
    await assertFails(
      updateDoc(doc(db(gia), `groups/${GID}/repos/222`), { seekingOwner: true, ownerLeft: true }),
    );
  });

  it('admin can hand an owner-left repo to a member (adoption clears the flag)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(db(ctx), `groups/${GID}/repos/222`), {
        seekingOwner: true,
        ownerLeft: true,
      });
    });
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(
      updateDoc(doc(db(alice), `groups/${GID}/repos/222`), {
        ownerUid: 'gia',
        adoptedByUid: 'gia',
        adoptedByLogin: 'gia',
        adoptedFromLogin: 'bob',
        adoptedAt: Timestamp.now(),
        seekingOwner: false,
        ownerLeft: false,
      }),
    );
  });
});
