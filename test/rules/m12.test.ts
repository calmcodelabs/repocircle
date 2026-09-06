import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collectionGroup,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { createEnv, db, GID, askDoc, seedGroup } from './helpers';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedGroup(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = db(ctx);
    await setDoc(doc(d, `groups/${GID}/repos/111`), {
      fullName: 'bob/thing',
      htmlUrl: 'https://github.com/bob/thing',
      description: null,
      language: 'TypeScript',
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
    await setDoc(doc(d, `groups/${GID}/repos/111/comments/c1`), {
      authorUid: 'alice',
      authorLogin: 'alice',
      body: 'seeded with gid',
      pinned: false,
      gid: GID,
      createdAt: Timestamp.now(),
      v: 1,
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});

function comment(over: Record<string, unknown> = {}) {
  return {
    authorUid: 'bob',
    authorLogin: 'bob',
    body: 'nice idea',
    pinned: false,
    gid: GID,
    createdAt: Timestamp.now(),
    v: 1,
    ...over,
  };
}

describe('[comments] [away-inbox] comments: gid + replyToUid (away-inbox fields)', () => {
  it('member writes a comment carrying its own gid', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(setDoc(doc(db(bob), `groups/${GID}/repos/111/comments/c2`), comment()));
  });

  it('spoofed gid is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/repos/111/comments/c3`), comment({ gid: 'other-group' })),
    );
  });

  it('replyToUid accepted as string, rejected as number', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `groups/${GID}/repos/111/comments/c4`), comment({ replyToUid: 'alice' })),
    );
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/repos/111/comments/c5`), comment({ replyToUid: 7 })),
    );
  });
});

describe('[comments] collection-group comment reads', () => {
  it('member: gid-pinned collection-group query succeeds', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(db(bob), 'comments'),
          where('gid', '==', GID),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      ),
    );
  });

  it('outsider: same query is denied', async () => {
    const mallory = env.authenticatedContext('mallory');
    await assertFails(
      getDocs(
        query(
          collectionGroup(db(mallory), 'comments'),
          where('gid', '==', GID),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      ),
    );
  });

  it('unpinned collection-group query is denied even for a member', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      getDocs(query(collectionGroup(db(bob), 'comments'), orderBy('createdAt', 'desc'), limit(10))),
    );
  });

  it('mentions inbox query (gid + array-contains) succeeds for a member', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(db(bob), 'comments'),
          where('gid', '==', GID),
          where('mentions', 'array-contains', 'bob'),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      ),
    );
  });
});

describe('[interests] interests: repoOwnerUid must be the truth', () => {
  it('honest interest with owner routing succeeds', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `groups/${GID}/repos/111/interests/bob`), {
        login: 'bob',
        avatarUrl: 'https://avatars.githubusercontent.com/bob',
        gid: GID,
        repoOwnerUid: 'bob',
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('spoofed repoOwnerUid (inbox pollution) is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), `groups/${GID}/repos/111/interests/bob`), {
        login: 'bob',
        avatarUrl: 'https://avatars.githubusercontent.com/bob',
        gid: GID,
        repoOwnerUid: 'alice',
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
  });
});

describe('[repo-registry] [adoption-handover] repo ownership: the silent-transfer hole is closed', () => {
  it('a non-owner member cannot reassign ownerUid to themselves', async () => {
    const gia = env.authenticatedContext('gia');
    await assertFails(updateDoc(doc(db(gia), `groups/${GID}/repos/111`), { ownerUid: 'gia' }));
  });

  it('owner hands over to a member, recorded as adoption', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/repos/111`), {
        ownerUid: 'alice',
        adoptedByUid: 'alice',
        adoptedByLogin: 'alice',
        adoptedFromLogin: 'bob',
        adoptedAt: Timestamp.now(),
        seekingOwner: false,
      }),
    );
  });

  it('handover to a non-member is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/repos/111`), {
        ownerUid: 'stranger',
        adoptedByUid: 'stranger',
        adoptedByLogin: 'stranger',
        adoptedFromLogin: 'bob',
      }),
    );
  });

  it('ownership change without adoption record is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/repos/111`), { ownerUid: 'alice' }));
  });
});

describe('[claims] ask resolution credit', () => {
  it('author resolves recording who helped', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/asks/a1`), askDoc('bob'));
    });
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/asks/a1`), {
        state: 'resolved',
        resolvedAt: Timestamp.now(),
        resolvedWithUid: 'alice',
        resolvedWithLogin: 'alice',
      }),
    );
  });

  it('a claimer cannot resolve someone else’s ask with self-credit', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/asks/a2`), askDoc('bob'));
    });
    const gia = env.authenticatedContext('gia');
    await assertFails(
      updateDoc(doc(db(gia), `groups/${GID}/asks/a2`), {
        state: 'resolved',
        resolvedAt: Timestamp.now(),
        resolvedWithUid: 'gia',
        resolvedWithLogin: 'gia',
      }),
    );
  });
});

describe('[watches] users/{uid}/watches', () => {
  it('self can create and delete a watch', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), `users/bob/watches/${GID}_111`), {
        gid: GID,
        repoId: '111',
        fullName: 'bob/thing',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('cannot write into someone else’s watches', async () => {
    const mallory = env.authenticatedContext('mallory');
    await assertFails(
      setDoc(doc(db(mallory), `users/bob/watches/${GID}_111`), {
        gid: GID,
        repoId: '111',
        fullName: 'bob/thing',
        addedAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  it('cannot read someone else’s watches', async () => {
    const mallory = env.authenticatedContext('mallory');
    await assertFails(getDocs(query(collectionGroup(db(mallory), 'watches'), limit(5))));
  });
});
