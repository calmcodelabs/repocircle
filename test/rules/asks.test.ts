import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDocs, collection, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { createEnv, db, GID, askDoc, seedGroup } from './helpers';
import { LIMITS } from '../../src/util/limits';

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

async function seedAsk(id: string, overrides: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `groups/${GID}/asks/${id}`), askDoc('bob', overrides));
  });
}

describe('asks + claims', () => {
  it('member can post a valid ask', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(setDoc(doc(db(bob), `groups/${GID}/asks/a1`), askDoc('bob')));
  });

  it('guest cannot post', async () => {
    const gia = env.authenticatedContext('gia');
    await assertFails(setDoc(doc(db(gia), `groups/${GID}/asks/a2`), askDoc('gia')));
  });

  it('outsider cannot read asks', async () => {
    const mallory = env.authenticatedContext('mallory');
    await assertFails(getDocs(collection(db(mallory), `groups/${GID}/asks`)));
  });

  it('author spoofing is denied', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), `groups/${GID}/asks/a3`), askDoc('alice')));
  });

  it('size limits are enforced', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/asks/a4`), askDoc('bob', { title: 'abc' })),
    );
    await assertFails(
      setDoc(
        doc(db(bob), `groups/${GID}/asks/a5`),
        askDoc('bob', { detail: 'x'.repeat(LIMITS.DETAIL_MAX + 1) }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db(bob), `groups/${GID}/asks/a6`),
        askDoc('bob', { tags: Array(LIMITS.TAGS_MAX + 1).fill('t') }),
      ),
    );
  });

  it('unknown fields are rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/asks/a7`), askDoc('bob', { score: 9000 })),
    );
  });

  it('must be created open', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/asks/a8`), askDoc('bob', { state: 'resolved' })),
    );
  });

  it('another member can claim (open -> claimed) but not resolve', async () => {
    await seedAsk('a9');
    const carolCtx = env.authenticatedContext('carol');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { memberDoc } = await import('./helpers');
      await setDoc(doc(db(ctx), `groups/${GID}/members/carol`), memberDoc('carol'));
    });
    await assertSucceeds(
      updateDoc(doc(db(carolCtx), `groups/${GID}/asks/a9`), { state: 'claimed', claimCount: 1 }),
    );
    await assertFails(
      updateDoc(doc(db(carolCtx), `groups/${GID}/asks/a9`), {
        state: 'resolved',
        resolvedAt: Timestamp.now(),
      }),
    );
  });

  it('author can anonymize their own display fields (leave-group flow)', async () => {
    await seedAsk('a12');
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/asks/a12`), {
        authorLogin: '(left the group)',
        authorAvatarUrl: '',
      }),
    );
    const carol = env.authenticatedContext('carol');
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { memberDoc } = await import('./helpers');
      await setDoc(doc(db(ctx), `groups/${GID}/members/carol`), memberDoc('carol'));
    });
    await assertFails(
      updateDoc(doc(db(carol), `groups/${GID}/asks/a12`), { authorLogin: 'hijacked' }),
    );
  });

  it('author can resolve their ask', async () => {
    await seedAsk('a10', { state: 'claimed', claimCount: 1 });
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/asks/a10`), {
        state: 'resolved',
        resolvedAt: Timestamp.now(),
      }),
    );
  });

  it('claim docs: only as yourself, note capped', async () => {
    await seedAsk('a11');
    const bob = env.authenticatedContext('bob');
    const claim = {
      login: 'bob',
      avatarUrl: 'https://avatars.githubusercontent.com/bob',
      note: 'on it tonight',
      claimedAt: Timestamp.now(),
      v: 1,
    };
    await assertSucceeds(setDoc(doc(db(bob), `groups/${GID}/asks/a11/claims/bob`), claim));
    await assertFails(setDoc(doc(db(bob), `groups/${GID}/asks/a11/claims/carol`), claim));
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/asks/a11/claims/bob`), {
        ...claim,
        note: 'x'.repeat(LIMITS.CLAIM_NOTE_MAX + 1),
      }),
    );
  });
});
