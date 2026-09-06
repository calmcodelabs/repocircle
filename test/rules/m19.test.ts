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

const SESSION = `groups/${GID}/sessions/s1`;
const POLL = `groups/${GID}/polls/p1`;

function sessionDoc(hostUid: string, over: Record<string, unknown> = {}) {
  return {
    title: 'Saturday build session',
    detail: 'Bring whatever state it is in.',
    startsAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    durationMin: 120,
    hostUid,
    hostLogin: hostUid,
    hostAvatarUrl: `https://avatars.githubusercontent.com/${hostUid}`,
    cancelled: false,
    rsvpCount: 0,
    createdAt: Timestamp.now(),
    v: 1,
    ...over,
  };
}

function pollDoc(authorUid: string, over: Record<string, unknown> = {}) {
  return {
    question: 'Which workshop should we run next?',
    options: { o0: { label: 'Rust', count: 0 }, o1: { label: 'WebGPU', count: 0 } },
    authorUid,
    authorLogin: authorUid,
    state: 'open',
    createdAt: Timestamp.now(),
    v: 1,
    ...over,
  };
}

async function seedPlainMember(uid = 'carl') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), `groups/${GID}/members/${uid}`), {
      role: 'member',
      login: uid,
      name: uid,
      avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
      availability: { status: 'free' },
      helpWith: [],
      learning: [],
      checklist: {},
      joinedAt: Timestamp.now(),
      joinedVia: 'seed',
      v: 1,
    });
  });
}

async function seedSession(over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), SESSION), sessionDoc('bob', over));
  });
}
async function seedPoll(over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), POLL), pollDoc('bob', over));
  });
}

// M19 (ADR-023) — calling a session is a member ritual, not an admin function.
describe('[sessions] sessions', () => {
  it('a member calls one', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(setDoc(doc(db(bob), SESSION), sessionDoc('bob')));
  });

  it('a guest cannot', async () => {
    const gia = env.authenticatedContext('gia');
    await assertFails(setDoc(doc(db(gia), SESSION), sessionDoc('gia')));
  });

  it('an outsider cannot', async () => {
    const eve = env.authenticatedContext('eve');
    await assertFails(setDoc(doc(db(eve), SESSION), sessionDoc('eve')));
  });

  it('the host must be the caller', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), SESSION), sessionDoc('alice')));
  });

  it('a title under three characters is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), SESSION), sessionDoc('bob', { title: 'x' })));
  });

  it('a non-https link is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), SESSION), sessionDoc('bob', { url: 'http://insecure.dev' })),
    );
  });

  it('a session cannot be born cancelled', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), SESSION), sessionDoc('bob', { cancelled: true })));
  });

  it('a duration beyond eight hours is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), SESSION), sessionDoc('bob', { durationMin: 481 })));
  });

  it('an unknown key is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), SESSION), { ...sessionDoc('bob'), featured: true }));
  });

  it('a member reads it', async () => {
    await seedSession();
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(getDoc(doc(db(alice), SESSION)));
  });

  it('an outsider cannot read it', async () => {
    await seedSession();
    const eve = env.authenticatedContext('eve');
    await assertFails(getDoc(doc(db(eve), SESSION)));
  });

  it('the host cancels it', async () => {
    await seedSession();
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(updateDoc(doc(db(bob), SESSION), { cancelled: true }));
  });

  it('an admin cancels it', async () => {
    await seedSession();
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(updateDoc(doc(db(alice), SESSION), { cancelled: true }));
  });

  // Anyone may move the RSVP mirror; the gathering belongs to whoever called it.
  it('a bystander cannot move the time', async () => {
    await seedSession();
    await seedPlainMember();
    const carl = env.authenticatedContext('carl');
    await assertFails(
      updateDoc(doc(db(carl), SESSION), {
        startsAt: Timestamp.fromMillis(Date.now() + 172_800_000),
      }),
    );
  });

  it('a bystander may bump the RSVP mirror', async () => {
    await seedSession();
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(updateDoc(doc(db(alice), SESSION), { rsvpCount: 1 }));
  });

  it('the host cannot be reassigned', async () => {
    await seedSession();
    const bob = env.authenticatedContext('bob');
    await assertFails(updateDoc(doc(db(bob), SESSION), { hostUid: 'alice' }));
  });

  it('a member who is not the host cannot delete it', async () => {
    await seedSession();
    await seedPlainMember();
    const carl = env.authenticatedContext('carl');
    await assertFails(deleteDoc(doc(db(carl), SESSION)));
  });

  describe('[rsvp] RSVPs reuse the interests shape', () => {
    const rsvpPath = `${SESSION}/interests/alice`;
    const good = {
      login: 'alice',
      avatarUrl: 'https://avatars.githubusercontent.com/alice',
      gid: GID,
      repoOwnerUid: 'bob',
      createdAt: Timestamp.now(),
      v: 1,
    };

    it('a member RSVPs', async () => {
      await seedSession();
      const alice = env.authenticatedContext('alice');
      await assertSucceeds(setDoc(doc(db(alice), rsvpPath), good));
    });

    it('nobody can RSVP on someone else’s behalf', async () => {
      await seedSession();
      const alice = env.authenticatedContext('alice');
      await assertFails(
        setDoc(doc(db(alice), `${SESSION}/interests/bob`), { ...good, login: 'bob' }),
      );
    });

    // The routing field is spoof-checked against the session, exactly as the
    // repo and idea versions are checked against their parents (M12).
    it('the host field cannot be pointed at someone else', async () => {
      await seedSession();
      const alice = env.authenticatedContext('alice');
      await assertFails(setDoc(doc(db(alice), rsvpPath), { ...good, repoOwnerUid: 'alice' }));
    });

    it('the gid cannot be forged', async () => {
      await seedSession();
      const alice = env.authenticatedContext('alice');
      await assertFails(setDoc(doc(db(alice), rsvpPath), { ...good, gid: 'other' }));
    });

    it('a guest cannot RSVP', async () => {
      await seedSession();
      const gia = env.authenticatedContext('gia');
      await assertFails(
        setDoc(doc(db(gia), `${SESSION}/interests/gia`), { ...good, login: 'gia' }),
      );
    });

    it('I can withdraw mine', async () => {
      await seedSession();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(db(ctx), rsvpPath), good);
      });
      const alice = env.authenticatedContext('alice');
      await assertSucceeds(deleteDoc(doc(db(alice), rsvpPath)));
    });
  });
});

// M19 (ADR-024) — a poll decides a question and never rates anybody.
describe('[polls-voting] polls', () => {
  it('a member asks one', async () => {
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(setDoc(doc(db(bob), POLL), pollDoc('bob')));
  });

  it('a guest cannot', async () => {
    const gia = env.authenticatedContext('gia');
    await assertFails(setDoc(doc(db(gia), POLL), pollDoc('gia')));
  });

  it('the author must be the asker', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), POLL), pollDoc('alice')));
  });

  it('one option is not a decision', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(
      setDoc(doc(db(bob), POLL), pollDoc('bob', { options: { o0: { label: 'Rust', count: 0 } } })),
    );
  });

  it('more than five options is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    const six = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`o${i}`, { label: `x${i}`, count: 0 }]),
    );
    await assertFails(setDoc(doc(db(bob), POLL), pollDoc('bob', { options: six })));
  });

  it('a poll cannot be born closed', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), POLL), pollDoc('bob', { state: 'closed' })));
  });

  it('a question under four characters is rejected', async () => {
    const bob = env.authenticatedContext('bob');
    await assertFails(setDoc(doc(db(bob), POLL), pollDoc('bob', { question: 'no' })));
  });

  it('voting moves the option mirror', async () => {
    await seedPoll();
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(
      updateDoc(doc(db(alice), POLL), {
        options: { o0: { label: 'Rust', count: 1 }, o1: { label: 'WebGPU', count: 0 } },
      }),
    );
  });

  it('a voter cannot rewrite the question', async () => {
    await seedPoll();
    const alice = env.authenticatedContext('alice');
    await assertFails(updateDoc(doc(db(alice), POLL), { question: 'something else entirely' }));
  });

  it('a voter who is neither author nor admin cannot close it', async () => {
    await seedPoll();
    await seedPlainMember();
    const carl = env.authenticatedContext('carl');
    await assertFails(updateDoc(doc(db(carl), POLL), { state: 'closed' }));
  });

  it('the author closes it', async () => {
    await seedPoll();
    const bob = env.authenticatedContext('bob');
    await assertSucceeds(
      updateDoc(doc(db(bob), POLL), { state: 'closed', closedAt: Timestamp.now() }),
    );
  });

  it('an admin closes it', async () => {
    await seedPoll();
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(
      updateDoc(doc(db(alice), POLL), { state: 'closed', closedAt: Timestamp.now() }),
    );
  });

  // A closed poll is the record of what was decided.
  it('a closed poll stops accepting votes', async () => {
    await seedPoll({ state: 'closed' });
    const alice = env.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(db(alice), `${POLL}/votes/alice`), {
        optionKey: 'o0',
        createdAt: Timestamp.now(),
        v: 1,
      }),
    );
  });

  describe('[polls-voting] votes', () => {
    it('a member votes once, in their own name', async () => {
      await seedPoll();
      const alice = env.authenticatedContext('alice');
      await assertSucceeds(
        setDoc(doc(db(alice), `${POLL}/votes/alice`), {
          optionKey: 'o0',
          createdAt: Timestamp.now(),
          v: 1,
        }),
      );
    });

    // One vote per member is structural: the document id is the uid.
    it('nobody can vote as someone else', async () => {
      await seedPoll();
      const alice = env.authenticatedContext('alice');
      await assertFails(
        setDoc(doc(db(alice), `${POLL}/votes/bob`), {
          optionKey: 'o0',
          createdAt: Timestamp.now(),
          v: 1,
        }),
      );
    });

    it('a guest cannot vote', async () => {
      await seedPoll();
      const gia = env.authenticatedContext('gia');
      await assertFails(
        setDoc(doc(db(gia), `${POLL}/votes/gia`), {
          optionKey: 'o0',
          createdAt: Timestamp.now(),
          v: 1,
        }),
      );
    });

    it('an unknown key on a vote is rejected', async () => {
      await seedPoll();
      const alice = env.authenticatedContext('alice');
      await assertFails(
        setDoc(doc(db(alice), `${POLL}/votes/alice`), {
          optionKey: 'o0',
          weight: 10,
          createdAt: Timestamp.now(),
          v: 1,
        }),
      );
    });

    it('I can change my mind', async () => {
      await seedPoll();
      const alice = env.authenticatedContext('alice');
      await assertSucceeds(
        setDoc(doc(db(alice), `${POLL}/votes/alice`), {
          optionKey: 'o0',
          createdAt: Timestamp.now(),
          v: 1,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db(alice), `${POLL}/votes/alice`), {
          optionKey: 'o1',
          createdAt: Timestamp.now(),
          v: 1,
        }),
      );
    });
  });
});
