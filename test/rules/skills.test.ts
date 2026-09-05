import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { createEnv, db, GID, groupDoc, memberDoc, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
});
afterAll(async () => {
  await env.cleanup();
});

// M11: helpWith/learning become real input, so their shape is enforced.
describe('member skills (helpWith / learning)', () => {
  it('self can set helpWith from the closed vocabulary plus learning', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), {
        helpWith: ['frontend', 'ml'],
        learning: ['rust', 'CUDA'],
      }),
    );
  });

  it('helpWith outside the vocabulary is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { helpWith: ['frontend', 'hacking'] }),
    );
  });

  it('helpWith must be a list, not a string', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { helpWith: 'frontend' }),
    );
  });

  it('more than 6 learning entries is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), {
        learning: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }),
    );
  });

  it('a learning entry longer than 24 chars is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { learning: ['x'.repeat(25)] }),
    );
  });

  it('non-string learning items fail closed', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { learning: [1, 2] }));
  });

  it('cannot set another member’s skills', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/alice`), { helpWith: ['design'] }),
    );
  });

  it('guests may still describe what they can help with', async () => {
    const gia = env.authenticatedContext('gia');
    await assertSucceeds(
      updateDoc(doc(db(gia), `groups/${GID}/members/gia`), { helpWith: ['feedback'] }),
    );
  });

  it('founder create with garbage helpWith is rejected', async () => {
    const zoe = env.authenticatedContext('zoe');
    const d = db(zoe);
    const batch = writeBatch(d);
    batch.set(doc(d, 'groups/gz'), groupDoc('zoe'));
    batch.set(doc(d, 'groups/gz/members/zoe'), {
      ...memberDoc('zoe', 'admin', 'founder'),
      helpWith: ['pwning'],
    });
    await assertFails(batch.commit());
  });

  it('admin role-change branch still works alongside skills validation', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(
      updateDoc(doc(db(alice), `groups/${GID}/members/bob`), { role: 'mentor' }),
    );
  });

  it('availability-only self-update still passes (regression)', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { availability: { status: 'away' } }),
    );
  });
});

// Unrelated guard: sanity that outsiders still cannot write member docs at all.
describe('outsiders', () => {
  it('non-member cannot write skills into a group', async () => {
    const mallory = env.authenticatedContext('mallory');
    await assertFails(
      setDoc(doc(db(mallory), `groups/${GID}/members/mallory`), memberDoc('mallory')),
    );
  });
});
