import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { createEnv, db, GID, groupDoc, memberDoc, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env.cleanup();
});

describe('groups/{gid}', () => {
  it('unauthenticated cannot create a group', async () => {
    const anon = env.unauthenticatedContext();
    await assertFails(setDoc(doc(db(anon), 'groups/gx'), groupDoc('nobody')));
  });

  it('founder batch (group + admin membership) succeeds', async () => {
    const alice = env.authenticatedContext('alice');
    const d = db(alice);
    const batch = writeBatch(d);
    batch.set(doc(d, 'groups/gnew'), groupDoc('alice'));
    batch.set(doc(d, 'groups/gnew/members/alice'), memberDoc('alice', 'admin', 'founder'));
    await assertSucceeds(batch.commit());
  });

  it('founder membership must be admin role', async () => {
    const alice = env.authenticatedContext('alice');
    const d = db(alice);
    const batch = writeBatch(d);
    batch.set(doc(d, 'groups/gnew'), groupDoc('alice'));
    batch.set(doc(d, 'groups/gnew/members/alice'), memberDoc('alice', 'member', 'founder'));
    await assertFails(batch.commit());
  });

  it('cannot found a group created by someone else', async () => {
    await seedGroup(env);
    const mallory = env.authenticatedContext('mallory');
    await assertFails(
      setDoc(doc(db(mallory), `groups/${GID}/members/mallory`), memberDoc('mallory', 'admin', 'founder')),
    );
  });

  it('group name is validated', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), 'groups/gx'), { ...groupDoc('alice'), name: 'ab' }));
  });

  it('member can read the group; outsider cannot', async () => {
    await seedGroup(env);
    const bob = env.authenticatedContext('bob');
    const mallory = env.authenticatedContext('mallory');
    await assertSucceeds(getDoc(doc(db(bob), `groups/${GID}`)));
    await assertFails(getDoc(doc(db(mallory), `groups/${GID}`)));
  });

  it('self-update limited to profile keys; role change denied', async () => {
    await seedGroup(env);
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), {
        availability: { status: 'away', note: 'travelling' },
      }),
    );
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { role: 'admin' }));
  });

  it('admin can change another member role; member cannot', async () => {
    await seedGroup(env);
    const alice = env.authenticatedContext('alice');
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(updateDoc(doc(db(alice), `groups/${GID}/members/bob`), { role: 'mentor' }));
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/members/gia`), { role: 'member' }));
  });

  it('member can leave; admin can remove; member cannot remove others', async () => {
    await seedGroup(env);
    const bob = env.authenticatedContext('bob');
    const alice = env.authenticatedContext('alice');
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(db(bob), `groups/${GID}/members/gia`)));
    await assertSucceeds(deleteDoc(doc(db(bob), `groups/${GID}/members/bob`)));
    await assertSucceeds(deleteDoc(doc(db(alice), `groups/${GID}/members/gia`)));
  });
});
