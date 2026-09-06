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
    const d = db(ctx);
    await setDoc(doc(d, `groups/${GID}/ideas/i1`), idea('bob'));
    for (const m of ['zed', 'kai']) {
      await setDoc(doc(d, `groups/${GID}/members/${m}`), {
        role: 'member',
        login: m,
        name: m,
        avatarUrl: '',
        availability: { status: 'free' },
        helpWith: [],
        learning: [],
        checklist: {},
        joinedAt: Timestamp.now(),
        joinedVia: 'seed',
        v: 1,
      });
    }
    await setDoc(doc(d, `groups/${GID}/repos/555`), {
      fullName: 'zed/seedling',
      htmlUrl: 'https://github.com/zed/seedling',
      description: null,
      language: 'Rust',
      topics: [],
      githubOwnerLogin: 'zed',
      ownerUid: 'zed',
      registeredBy: 'zed',
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

function idea(authorUid: string, over: Record<string, unknown> = {}) {
  return {
    title: 'Voice notes to Notion',
    pitch: 'Rambling voice memos become structured notes.',
    authorUid,
    authorLogin: authorUid,
    state: 'open',
    interestCount: 0,
    commentCount: 0,
    createdAt: Timestamp.now(),
    v: 1,
    ...over,
  };
}

describe('ideas', () => {
  it('member creates their own idea', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(setDoc(doc(db(bob), `groups/${GID}/ideas/i2`), idea('bob')));
  });

  it('cannot author an idea as someone else, or born germinated', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), `groups/${GID}/ideas/i3`), idea('alice')));
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/ideas/i4`), idea('bob', { state: 'germinated' })),
    );
  });

  it('guest cannot pitch (read-only role)', async () => {
    const gia2 = env.authenticatedContext('gia'); // gia is guest in seed
    await assertFails(setDoc(doc(db(gia2), `groups/${GID}/ideas/i5`), idea('gia')));
  });

  it('author parks and reopens; stranger cannot edit', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(updateDoc(doc(db(bob), `groups/${GID}/ideas/i1`), { state: 'parked' }));
    await assertSucceeds(updateDoc(doc(db(bob), `groups/${GID}/ideas/i1`), { state: 'open' }));
    const mallory = env.authenticatedContext('mallory');
    await assertFails(
      updateDoc(doc(db(mallory), `groups/${GID}/ideas/i1`), { title: 'stolen idea' }),
    );
  });

  it('author cannot fake a germination through the edit branch', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/ideas/i1`), { state: 'germinated' }));
  });

  it('the linked repo owner can germinate someone else’s idea', async () => {
    const zed = env.authenticatedContext('zed');
    await assertSucceeds(
      updateDoc(doc(db(zed), `groups/${GID}/ideas/i1`), {
        state: 'germinated',
        repoId: '555',
        repoFullName: 'zed/seedling',
        germinatedAt: Timestamp.now(),
        germinatedByUid: 'zed',
        germinatedByLogin: 'zed',
      }),
    );
  });

  it('germination to a repo that does not exist here is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/ideas/i1`), {
        state: 'germinated',
        repoId: '999',
        repoFullName: 'no/where',
        germinatedAt: Timestamp.now(),
        germinatedByUid: 'bob',
        germinatedByLogin: 'bob',
      }),
    );
  });

  it('an unrelated member cannot germinate onto someone else’s repo', async () => {
    const kai = env.authenticatedContext('kai');
    await assertFails(
      updateDoc(doc(db(kai), `groups/${GID}/ideas/i1`), {
        state: 'germinated',
        repoId: '555',
        repoFullName: 'zed/seedling',
        germinatedAt: Timestamp.now(),
        germinatedByUid: 'kai',
        germinatedByLogin: 'kai',
      }),
    );
  });

  it('idea comments carry gid and reject spoofs', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `groups/${GID}/ideas/i1/comments/c1`), {
        authorUid: 'bob',
        authorLogin: 'bob',
        body: 'this could work',
        pinned: false,
        gid: GID,
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/ideas/i1/comments/c2`), {
        authorUid: 'bob',
        authorLogin: 'bob',
        body: 'spoofed',
        pinned: false,
        gid: 'other',
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('idea interest routes the inbox to the author, spoof rejected', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(
      setDoc(doc(db(alice), `groups/${GID}/ideas/i1/interests/alice`), {
        login: 'alice',
        avatarUrl: '',
        gid: GID,
        repoOwnerUid: 'bob',
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
    await assertFails(
      setDoc(doc(db(alice), `groups/${GID}/ideas/i1/interests/alice2`), {
        login: 'alice',
        avatarUrl: '',
        gid: GID,
        repoOwnerUid: 'alice',
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('repo accepts the idea link from its owner; strangers denied', async () => {
    const zed = env.authenticatedContext('zed');
    await assertSucceeds(
      updateDoc(doc(db(zed), `groups/${GID}/repos/555`), { ideaId: 'i1', ideaByLogin: 'bob' }),
    );
    const bob = env.authenticatedContext('bob');
    // must actually CHANGE something — rewriting identical values is a no-op
    // with an empty affectedKeys, which rules rightly allow
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/repos/555`), {
        ideaId: 'i-hijack',
        ideaByLogin: 'bob',
      }),
    );
  });
});
