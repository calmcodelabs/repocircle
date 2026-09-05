import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { createEnv, db, GID, inDays, memberDoc, seedGroup } from './helpers';

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

function inviteDoc(overrides: Record<string, unknown> = {}) {
  return {
    role: 'member',
    expiresAt: inDays(7),
    revoked: false,
    createdBy: 'alice',
    createdAt: Timestamp.now(),
    label: 'club discord',
    v: 1,
    ...overrides,
  };
}

async function seedInvite(token: string, overrides: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `groups/${GID}/invites/${token}`), inviteDoc(overrides));
  });
}

describe('invites + join flow', () => {
  it('admin can create a valid invite', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(setDoc(doc(db(alice), `groups/${GID}/invites/tok1`), inviteDoc()));
  });

  it('member cannot create invites', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/invites/tok2`), inviteDoc({ createdBy: 'bob' })),
    );
  });

  it('admin-role invites are forbidden', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(db(alice), `groups/${GID}/invites/tok3`), inviteDoc({ role: 'admin' })),
    );
  });

  it('expiry beyond 30 days is forbidden', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(db(alice), `groups/${GID}/invites/tok4`), inviteDoc({ expiresAt: inDays(45) })),
    );
  });

  it('any signed-in user can get an invite by token, but never list', async () => {
    await seedInvite('tok5');
    const newbie = env.authenticatedContext('newbie');
    await assertSucceeds(getDoc(doc(db(newbie), `groups/${GID}/invites/tok5`)));
    await assertFails(getDocs(collection(db(newbie), `groups/${GID}/invites`)));
  });

  it('joining with a live invite works, with the invite role', async () => {
    await seedInvite('tok6');
    const newbie = env.authenticatedContext('newbie');
    await assertSucceeds(
      setDoc(doc(db(newbie), `groups/${GID}/members/newbie`), memberDoc('newbie', 'member', 'tok6')),
    );
  });

  it('forging a better role than the invite grants is denied', async () => {
    await seedInvite('tok7');
    const newbie = env.authenticatedContext('newbie');
    await assertFails(
      setDoc(doc(db(newbie), `groups/${GID}/members/newbie`), memberDoc('newbie', 'admin', 'tok7')),
    );
  });

  it('expired invite cannot be used', async () => {
    await seedInvite('tok8', { expiresAt: inDays(-1) });
    const newbie = env.authenticatedContext('newbie');
    await assertFails(
      setDoc(doc(db(newbie), `groups/${GID}/members/newbie`), memberDoc('newbie', 'member', 'tok8')),
    );
  });

  it('revoked invite cannot be used', async () => {
    await seedInvite('tok9', { revoked: true });
    const newbie = env.authenticatedContext('newbie');
    await assertFails(
      setDoc(doc(db(newbie), `groups/${GID}/members/newbie`), memberDoc('newbie', 'member', 'tok9')),
    );
  });

  it('admin can revoke; member cannot', async () => {
    await seedInvite('tok10');
    const alice = env.authenticatedContext('alice');
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/invites/tok10`), { revoked: true }));
    await assertSucceeds(updateDoc(doc(db(alice), `groups/${GID}/invites/tok10`), { revoked: true }));
  });
});
