import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { createEnv, db } from './helpers';

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

const userDoc = {
  githubId: 12345,
  login: 'alice',
  name: 'Alice',
  avatarUrl: 'https://avatars.githubusercontent.com/alice',
  scopesGranted: ['read:user', 'user:email'],
  groupIds: [],
  checklist: {},
  createdAt: Timestamp.now(),
  lastSeenAt: Timestamp.now(),
  v: 1,
};

describe('users/{uid}', () => {
  it('unauthenticated cannot read a user doc', async () => {
    const anon = env.unauthenticatedContext();
    await assertFails(getDoc(doc(db(anon), 'users/alice')));
  });

  it('owner can create their own doc with allowed keys', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(setDoc(doc(db(alice), 'users/alice'), userDoc));
  });

  it('token-shaped fields are rejected (key allowlist)', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), 'users/alice'), { ...userDoc, accessToken: 'gho_x' }));
    await assertFails(setDoc(doc(db(alice), 'users/alice'), { ...userDoc, token: 'gho_x' }));
  });

  it('cross-uid writes and reads are denied', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), 'users/alice'), userDoc));
    await assertFails(getDoc(doc(db(bob), 'users/alice')));
  });

  it('listing users is denied', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(getDocs(collection(db(alice), 'users')));
  });

  it('githubId is immutable once set', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(setDoc(doc(db(alice), 'users/alice'), userDoc));
    await assertFails(updateDoc(doc(db(alice), 'users/alice'), { githubId: 999 }));
    await assertSucceeds(updateDoc(doc(db(alice), 'users/alice'), { lastSeenAt: Timestamp.now() }));
  });
});
