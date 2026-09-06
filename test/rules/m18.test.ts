import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { createEnv, db, GID } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), 'users/bob'), {
      githubId: 1,
      login: 'bob',
      name: 'bob',
      avatarUrl: 'https://avatars.githubusercontent.com/bob',
      scopesGranted: [],
      groupIds: [GID],
      checklist: {},
      createdAt: Timestamp.now(),
      v: 1,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

// M18 — saved things widened from repos to anything worth coming back to.
describe('saved items (users/{uid}/watches)', () => {
  it('saves a repo in the new shape', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `users/bob/watches/${GID}_42`), {
        gid: GID,
        kind: 'repo',
        itemId: '42',
        title: 'meridian/atlas',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('saves an ask', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `users/bob/watches/${GID}_ask_a1`), {
        gid: GID,
        kind: 'ask',
        itemId: 'a1',
        title: 'Docker networking',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  // Documents written before M18 have no kind; they must keep working.
  it('still accepts the pre-M18 shape', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `users/bob/watches/${GID}_42`), {
        gid: GID,
        repoId: '42',
        fullName: 'meridian/atlas',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('rejects a kind outside the three', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `users/bob/watches/${GID}_x`), {
        gid: GID,
        kind: 'member',
        itemId: 'x',
        title: 'someone',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('rejects an unknown key', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `users/bob/watches/${GID}_x`), {
        gid: GID,
        kind: 'ask',
        itemId: 'x',
        title: 'x',
        priority: 'high',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('nobody else can read or write mine', async () => {
    const eve = env.authenticatedContext('eve');
    await assertFails(getDoc(doc(db(eve), `users/bob/watches/${GID}_42`)));
    await assertFails(
      setDoc(doc(db(eve), `users/bob/watches/${GID}_9`), {
        gid: GID,
        kind: 'repo',
        itemId: '9',
        title: 'x/y',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });
});

// M18 — per-circle inbox level, on my own user document.
describe('circlePrefs', () => {
  it('I set my own', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(updateDoc(doc(db(bob), 'users/bob'), { circlePrefs: { [GID]: 'mute' } }));
  });

  it('must be a map', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), 'users/bob'), { circlePrefs: 'mute' }));
  });

  it('nobody else may set mine', async () => {
    const eve = env.authenticatedContext('eve');
    await assertFails(updateDoc(doc(db(eve), 'users/bob'), { circlePrefs: { [GID]: 'mute' } }));
  });
});
