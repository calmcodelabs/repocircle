import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { createEnv, db, groupDoc, memberDoc } from './helpers';

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

// Replicates the exact client createGroup() batch + the GroupShell read-back.
describe('founder create-then-read (client flow)', () => {
  it('founder can create a group and immediately read group + members', async () => {
    const uid = 'alice';
    // Pre-existing user doc (created at sign-in) — the batch updates its groupIds.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `users/${uid}`), {
        githubId: 1,
        login: 'alice',
        name: 'Alice',
        avatarUrl: 'https://avatars.githubusercontent.com/alice',
        scopesGranted: ['read:user', 'user:email'],
        groupIds: [],
        checklist: {},
        createdAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        v: 1,
      });
    });

    const alice = env.authenticatedContext(uid);
    const d = db(alice);
    const gid = 'gnew';

    // 1) the createGroup() batch
    const batch = writeBatch(d);
    batch.set(doc(d, `groups/${gid}`), { ...groupDoc(uid), createdAt: serverTimestamp() });
    batch.set(doc(d, `groups/${gid}/members/${uid}`), {
      ...memberDoc('alice', 'admin', 'founder'),
      joinedAt: serverTimestamp(),
    });
    batch.update(doc(d, `users/${uid}`), { groupIds: ['gnew'] });
    await assertSucceeds(batch.commit());

    // 2) GroupShell read-back: group doc + members query (orderBy joinedAt)
    await assertSucceeds(getDoc(doc(d, `groups/${gid}`)));
    await assertSucceeds(
      getDocs(query(collection(d, `groups/${gid}/members`), orderBy('joinedAt', 'asc'))),
    );
  });

  it('a non-member is denied reading the same group + members', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), 'groups/g2'), groupDoc('alice'));
      await setDoc(doc(db(ctx), 'groups/g2/members/alice'), memberDoc('alice', 'admin'));
    });
    const mallory = env.authenticatedContext('mallory');
    await assertFails(getDoc(doc(db(mallory), 'groups/g2')));
    await assertFails(
      getDocs(query(collection(db(mallory), 'groups/g2/members'), orderBy('joinedAt', 'asc'))),
    );
  });
});
