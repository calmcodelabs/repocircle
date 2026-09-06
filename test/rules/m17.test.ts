import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { createEnv, db, GID, seedGroup } from './helpers';

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

function annDoc(uid: string, body = 'Demo day is Thursday at six.') {
  return {
    body,
    authorUid: uid,
    authorLogin: uid,
    authorAvatarUrl: `https://avatars.githubusercontent.com/${uid}`,
    createdAt: Timestamp.now(),
    v: 1,
  };
}

// M17 — the circle's voice. Admin-only and append-only: an announcement is a
// statement made at a moment, so correcting it means posting again.
describe('announcements', () => {
  const path = `groups/${GID}/announcements/a1`;

  it('an admin posts one', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(setDoc(doc(db(alice), path), annDoc('alice')));
  });

  it('a member cannot', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), path), annDoc('bob')));
  });

  it('an outsider cannot', async () => {
    const eve = env.authenticatedContext('eve');
    await assertFails(setDoc(doc(db(eve), path), annDoc('eve')));
  });

  it('a member reads it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), path), annDoc('alice'));
    });
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(getDoc(doc(db(bob), path)));
  });

  it('an outsider cannot read it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), path), annDoc('alice'));
    });
    const eve = env.authenticatedContext('eve');
    await assertFails(getDoc(doc(db(eve), path)));
  });

  it('the author must be the poster', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), path), annDoc('bob')));
  });

  it('an empty body is rejected', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), path), annDoc('alice', '')));
  });

  it('a body over 280 characters is rejected', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), path), annDoc('alice', 'x'.repeat(281))));
  });

  it('an unknown key is rejected', async () => {
    const alice = env.authenticatedContext('alice');
    await assertFails(setDoc(doc(db(alice), path), { ...annDoc('alice'), pinned: true }));
  });

  // Append-only: even the admin who wrote it cannot rewrite it.
  it('nobody can edit one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), path), annDoc('alice'));
    });
    const alice = env.authenticatedContext('alice');
    await assertFails(updateDoc(doc(db(alice), path), { body: 'actually Friday' }));
  });

  it('an admin can delete one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), path), annDoc('alice'));
    });
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(deleteDoc(doc(db(alice), path)));
  });

  it('a member cannot delete one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), path), annDoc('alice'));
    });
    const bob = env.authenticatedContext('bob');
    await assertFails(deleteDoc(doc(db(bob), path)));
  });
});

// M17 — the second join question. Closed vocabulary, same as helpWith, because
// the join screen offers chips and the value has to stay joinable.
describe('member domainTags', () => {
  it('a member sets them from the vocabulary', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { domainTags: ['web', 'ML'] }),
    );
  });

  it('a tag outside the vocabulary is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { domainTags: ['web', 'crypto'] }),
    );
  });

  it('more than four is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/bob`), {
        domainTags: ['web', 'mobile', 'ML', 'data', 'other'],
      }),
    );
  });

  it('must be a list', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), `groups/${GID}/members/bob`), { domainTags: 'web' }));
  });

  it('another member cannot set mine', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      updateDoc(doc(db(bob), `groups/${GID}/members/alice`), { domainTags: ['web'] }),
    );
  });

  it('a joiner may bring them in at create time', async () => {
    const carl = env.authenticatedContext('carl');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), `groups/${GID}/invites/tok1`), {
        role: 'member',
        expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
        revoked: false,
        createdBy: 'alice',
        createdAt: Timestamp.now(),
        v: 1,
      });
    });
    await assertSucceeds(
      setDoc(doc(db(carl), `groups/${GID}/members/carl`), {
        role: 'member',
        login: 'carl',
        name: 'carl',
        avatarUrl: 'https://avatars.githubusercontent.com/carl',
        availability: { status: 'free' },
        helpWith: ['frontend'],
        learning: [],
        domainTags: ['web'],
        checklist: { saidHelpWith: true },
        joinedAt: Timestamp.now(),
        joinedVia: 'tok1',
        v: 1,
      }),
    );
  });
});
