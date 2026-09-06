import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, increment, setDoc, updateDoc } from 'firebase/firestore';
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

const SUMMARY = `groups/${GID}/meta/summary`;

async function seedSummary(fields: Record<string, unknown> = {}): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), SUMMARY), {
      memberCount: 3,
      repoCount: 0,
      openAskCount: 0,
      faces: [],
      arrivals: [],
      newRepos: [],
      wantsAHand: [],
      v: 1,
      ...fields,
    });
  });
}

function face(uid: string) {
  return { uid, login: uid, avatarUrl: `https://avatars.githubusercontent.com/${uid}` };
}

// M16 (ADR-021): the summary is a display mirror, so the rules police shape,
// caps and the admin/member key split — never truth.
describe('circle summary doc', () => {
  it('a member reads it', async () => {
    await seedSummary();
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), SUMMARY), { repoCount: increment(1) }, { merge: true }),
    );
  });

  it('an outsider cannot read it', async () => {
    await seedSummary();
    const eve = env.authenticatedContext('eve');
    const { getDoc } = await import('firebase/firestore');
    await assertFails(getDoc(doc(db(eve), SUMMARY)));
  });

  it('an outsider cannot write it', async () => {
    const eve = env.authenticatedContext('eve');
    await assertFails(setDoc(doc(db(eve), SUMMARY), { memberCount: 1, v: 1 }));
  });

  it('a member creates it from nothing', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), SUMMARY), {
        memberCount: 3,
        repoCount: 2,
        openAskCount: 1,
        faces: [face('alice'), face('bob')],
        arrivals: [],
        newRepos: [],
        wantsAHand: [],
        v: 1,
      }),
    );
  });

  it('counters move by increment', async () => {
    await seedSummary();
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      setDoc(doc(db(bob), SUMMARY), { memberCount: increment(-1) }, { merge: true }),
    );
  });

  // Deliberate (rules comment): a guest's join must still correct the count.
  it('a guest may maintain the counters', async () => {
    await seedSummary();
    const gia = env.authenticatedContext('gia');
    await assertSucceeds(
      setDoc(doc(db(gia), SUMMARY), { memberCount: increment(1) }, { merge: true }),
    );
  });

  it('an unknown key is rejected', async () => {
    await seedSummary();
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), SUMMARY), { leaderboard: ['alice'] }));
  });

  it('a counter must be a number', async () => {
    await seedSummary();
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), SUMMARY), { memberCount: 'many' }));
  });

  it('only the summary doc id is writable under meta', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), `groups/${GID}/meta/health`), { memberCount: 1, v: 1 }));
  });

  describe('caps', () => {
    it('faces over 8 is rejected', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      const nine = Array.from({ length: 9 }, (_, i) => face(`u${i}`));
      await assertFails(updateDoc(doc(db(bob), SUMMARY), { faces: nine }));
    });

    it('exactly 8 faces is fine', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      const eight = Array.from({ length: 8 }, (_, i) => face(`u${i}`));
      await assertSucceeds(updateDoc(doc(db(bob), SUMMARY), { faces: eight }));
    });

    it('arrivals over 5 is rejected', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      const six = Array.from({ length: 6 }, (_, i) => face(`u${i}`));
      await assertFails(updateDoc(doc(db(bob), SUMMARY), { arrivals: six }));
    });

    it('newRepos over 6 is rejected', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      const seven = Array.from({ length: 7 }, (_, i) => ({ repoId: `${i}`, fullName: `o/r${i}` }));
      await assertFails(updateDoc(doc(db(bob), SUMMARY), { newRepos: seven }));
    });

    it('wantsAHand over 10 is rejected', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      const eleven = Array.from({ length: 11 }, (_, i) => ({ repoId: `${i}`, needs: 'frontend' }));
      await assertFails(updateDoc(doc(db(bob), SUMMARY), { wantsAHand: eleven }));
    });

    it('a list field must be a list', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      await assertFails(updateDoc(doc(db(bob), SUMMARY), { faces: 'alice' }));
    });
  });

  describe('admin surface (links, pinnedRepoId)', () => {
    it('a member cannot set links', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      await assertFails(
        updateDoc(doc(db(bob), SUMMARY), { links: [{ label: 'Discord', url: 'https://x.dev' }] }),
      );
    });

    it('a member cannot pin a repo', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      await assertFails(updateDoc(doc(db(bob), SUMMARY), { pinnedRepoId: '12345' }));
    });

    it('a member cannot smuggle links in at create time', async () => {
      const bob = env.authenticatedContext('bob');
      await assertFails(
        setDoc(doc(db(bob), SUMMARY), {
          memberCount: 1,
          links: [{ label: 'x', url: 'https://x.dev' }],
          v: 1,
        }),
      );
    });

    it('an admin sets links and pins a repo', async () => {
      await seedSummary();
      const alice = env.authenticatedContext('alice');
      await assertSucceeds(
        updateDoc(doc(db(alice), SUMMARY), {
          links: [{ label: 'Discord', url: 'https://discord.gg/x' }],
          pinnedRepoId: '12345',
        }),
      );
    });

    it('links over 6 is rejected even for an admin', async () => {
      await seedSummary();
      const alice = env.authenticatedContext('alice');
      const seven = Array.from({ length: 7 }, (_, i) => ({ label: `l${i}`, url: 'https://x.dev' }));
      await assertFails(updateDoc(doc(db(alice), SUMMARY), { links: seven }));
    });

    // The split must not freeze the mirror: ordinary maintenance has to keep
    // working on a circle whose admin has already curated links.
    it('a member still maintains counters when links already exist', async () => {
      await seedSummary({ links: [{ label: 'Discord', url: 'https://discord.gg/x' }] });
      const bob = env.authenticatedContext('bob');
      await assertSucceeds(
        setDoc(doc(db(bob), SUMMARY), { repoCount: increment(1) }, { merge: true }),
      );
    });
  });

  describe('delete', () => {
    it('a member cannot delete the summary', async () => {
      await seedSummary();
      const bob = env.authenticatedContext('bob');
      await assertFails(deleteDoc(doc(db(bob), SUMMARY)));
    });

    it('an admin can (group-deletion sweep)', async () => {
      await seedSummary();
      const alice = env.authenticatedContext('alice');
      await assertSucceeds(deleteDoc(doc(db(alice), SUMMARY)));
    });
  });
});
