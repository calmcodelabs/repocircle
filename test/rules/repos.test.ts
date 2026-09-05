import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createEnv, db, GID, seedGroup, memberDoc } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
  // carol: plain member (bob owns/registered the repo; alice is admin; gia guest)
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `groups/${GID}/members/carol`), memberDoc('carol'));
    await setDoc(doc(db(ctx), `groups/${GID}/repos/12345`), repoDoc());
  });
});
afterAll(async () => {
  await env.cleanup();
});

function repoDoc(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'bob/cool-project',
    htmlUrl: 'https://github.com/bob/cool-project',
    description: 'a cool project',
    language: 'TypeScript',
    topics: ['web'],
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
    ...overrides,
  };
}

describe('repos', () => {
  it('member can register with numeric doc id; junk id denied', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(setDoc(doc(db(bob), `groups/${GID}/repos/67890`), repoDoc()));
    await assertFails(setDoc(doc(db(bob), `groups/${GID}/repos/not-a-number`), repoDoc()));
  });

  it('guest cannot register; outsider cannot read', async () => {
    const gia = env.authenticatedContext('gia');
    const mallory = env.authenticatedContext('mallory');
    await assertFails(setDoc(doc(db(gia), `groups/${GID}/repos/22222`), repoDoc({ registeredBy: 'gia' })));
    await assertFails(getDoc(doc(db(mallory), `groups/${GID}/repos/12345`)));
  });

  it('registrant spoofing denied', async () => {
    const carol = env.authenticatedContext('carol');
    await assertFails(setDoc(doc(db(carol), `groups/${GID}/repos/33333`), repoDoc({ registeredBy: 'bob' })));
  });

  it('owner can change status; unrelated member cannot', async () => {
    const bob = env.authenticatedContext('bob');
    const carol = env.authenticatedContext('carol');
    await assertFails(updateDoc(doc(db(carol), `groups/${GID}/repos/12345`), { status: 'paused' }));
    await assertSucceeds(updateDoc(doc(db(bob), `groups/${GID}/repos/12345`), { status: 'paused' }));
  });

  it('admin can change status and archive', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(updateDoc(doc(db(alice), `groups/${GID}/repos/12345`), { status: 'done', archived: true }));
  });

  it('any member may update poll state and stats (shared polling), not product fields', async () => {
    const carol = env.authenticatedContext('carol');
    await assertSucceeds(
      updateDoc(doc(db(carol), `groups/${GID}/repos/12345`), {
        poll: { lastPolledAt: Timestamp.now(), etag: 'W/"abc"', failing: false },
        lastEventAt: Timestamp.now(),
        stats7d: { commits: 3, prsOpened: 1, prsMerged: 0, issues: 0, releases: 0 },
      }),
    );
    await assertFails(
      updateDoc(doc(db(carol), `groups/${GID}/repos/12345`), {
        poll: { lastPolledAt: Timestamp.now(), etag: 'W/"abc"', failing: false },
        demoUrl: 'https://evil.example',
      }),
    );
  });

  it('status enum and demoUrl scheme enforced', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/repos/12345`), { status: 'winning' }));
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/repos/12345`), { demoUrl: 'http://insecure.example' }));
    await assertSucceeds(updateDoc(doc(db(bob), `groups/${GID}/repos/12345`), { demoUrl: 'https://demo.example' }));
  });

  it('delete: registrant and admin yes, unrelated member no', async () => {
    const carol = env.authenticatedContext('carol');
    const bob = env.authenticatedContext('bob');
    await assertFails(deleteDoc(doc(db(carol), `groups/${GID}/repos/12345`)));
    await assertSucceeds(deleteDoc(doc(db(bob), `groups/${GID}/repos/12345`)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/repos/12345`), repoDoc());
    });
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(deleteDoc(doc(db(alice), `groups/${GID}/repos/12345`)));
  });
});
