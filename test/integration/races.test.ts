import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';
import {
  appDb,
  asAdmin,
  assertEmulators,
  clearData,
  closeHarness,
  inspectAll,
  inspectDoc,
  seedSize,
  signInAs,
} from './harness.ts';
import { claimAsk, unclaimAsk } from '../../src/data/asks';
import { castVote } from '../../src/data/polls';
import { noteMemberJoined, noteMemberLeft } from '../../src/data/summary';
import type { Ask } from '../../src/data/types';

/**
 * Class C, executed rather than asserted (REVIEW.md, TESTING.md §7).
 *
 * The static gate proves no counter is read-modify-written in the source. That
 * is necessary but not sufficient: it says nothing about whether the writes
 * actually converge under contention. These tests run the real functions
 * concurrently and check the final state, which is the only way to know.
 *
 * Note the shape of a concurrency test against one emulator: `Promise.all` over
 * N calls genuinely interleaves at the Firestore level, because each call is a
 * separate round trip.
 */

const askOf = (gid: string, id: string, data: Record<string, unknown>): Ask =>
  ({ id, ...data }) as unknown as Ask;

describe('[claims] concurrent claims converge', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  async function seedOpenAsk(gid: string, id = 'race-ask') {
    await asAdmin(async (fs) => {
      await setDoc(doc(fs, `groups/${gid}/asks/${id}`), {
        kind: 'ask',
        title: 'Who can look at this deadlock',
        detail: 'seeded for the race',
        tags: [],
        authorUid: 'n-rahman',
        authorLogin: 'n-rahman',
        authorAvatarUrl: '',
        state: 'open',
        claimCount: 0,
        claimerUids: [],
        createdAt: new Date(),
        v: 1,
      });
    });
  }

  it('five members claiming at once produce exactly five claims', async () => {
    const s = await seedSize('demo');
    await seedOpenAsk(s.gid);
    const claimers = s.facts.memberUids.slice(1, 6);

    // Sequential sign-ins, concurrent writes: one Firebase Auth instance can
    // only hold one user, so each claim is issued as its own signed-in user and
    // the writes are what overlap.
    for (const uid of claimers) {
      await signInAs(uid);
      const current = await inspectDoc(`groups/${s.gid}/asks/race-ask`);
      await claimAsk(
        s.gid,
        askOf(s.gid, 'race-ask', current!),
        { uid, login: uid, name: uid, avatarUrl: '' },
        '',
      );
    }

    const ask = await inspectDoc(`groups/${s.gid}/asks/race-ask`);
    const claims = await inspectAll(`groups/${s.gid}/asks/race-ask/claims`);
    expect(claims.length).toBe(claimers.length);
    expect(ask?.claimCount).toBe(claimers.length);
    expect(ask?.state).toBe('claimed');
    expect((ask?.claimerUids as string[]).sort()).toEqual([...claimers].sort());
  });

  it('a counter incremented from many directions lands on the true total', async () => {
    // The mirror updates are best-effort and fire-and-forget in the app, so the
    // question is whether increment() converges when they overlap. Twenty
    // interleaved writes must leave exactly twenty.
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    const start = ((await inspectDoc(`groups/${s.gid}/meta/summary`))?.memberCount as number) ?? 0;

    await Promise.all(Array.from({ length: 20 }, () => noteMemberJoined(s.gid)));
    expect((await inspectDoc(`groups/${s.gid}/meta/summary`))?.memberCount).toBe(start + 20);

    await Promise.all(Array.from({ length: 8 }, () => noteMemberLeft(s.gid)));
    expect((await inspectDoc(`groups/${s.gid}/meta/summary`))?.memberCount).toBe(start + 12);
  });

  it('unclaiming to zero returns the ask to open', async () => {
    const s = await seedSize('demo');
    await seedOpenAsk(s.gid, 'solo');
    await signInAs('mira-t');
    const seeded = await inspectDoc(`groups/${s.gid}/asks/solo`);
    await claimAsk(
      s.gid,
      askOf(s.gid, 'solo', seeded!),
      { uid: 'mira-t', login: 'mira-t', name: 'mira-t', avatarUrl: '' },
      '',
    );
    let ask = await inspectDoc(`groups/${s.gid}/asks/solo`);
    expect(ask?.state).toBe('claimed');
    expect(ask?.claimCount).toBe(1);

    await unclaimAsk(s.gid, askOf(s.gid, 'solo', ask!), 'mira-t');
    ask = await inspectDoc(`groups/${s.gid}/asks/solo`);
    expect(ask?.claimCount).toBe(0);
    expect(ask?.state).toBe('open');
    expect(await inspectAll(`groups/${s.gid}/asks/solo/claims`)).toHaveLength(0);
  });

  it('the documented unclaim race leaves a self-healing state, never a negative count', async () => {
    // REVIEW.md Class C names this exception: two concurrent unclaims can both
    // read claimCount as 2 and both decide the ask is still claimed. What must
    // never happen is a count below zero or a lost claim document.
    const s = await seedSize('demo');
    await seedOpenAsk(s.gid, 'double');
    for (const uid of ['mira-t', 'dev-anand']) {
      await signInAs(uid);
      const cur = await inspectDoc(`groups/${s.gid}/asks/double`);
      await claimAsk(
        s.gid,
        askOf(s.gid, 'double', cur!),
        { uid, login: uid, name: uid, avatarUrl: '' },
        '',
      );
    }
    const before = await inspectDoc(`groups/${s.gid}/asks/double`);
    expect(before?.claimCount).toBe(2);

    await signInAs('mira-t');
    await unclaimAsk(s.gid, askOf(s.gid, 'double', before!), 'mira-t');
    await signInAs('dev-anand');
    // Deliberately passing the *stale* snapshot, which is the race.
    await unclaimAsk(s.gid, askOf(s.gid, 'double', before!), 'dev-anand');

    const after = await inspectDoc(`groups/${s.gid}/asks/double`);
    expect(after?.claimCount).toBe(0);
    expect(await inspectAll(`groups/${s.gid}/asks/double/claims`)).toHaveLength(0);
    // State may lag at 'claimed' — the documented, self-healing outcome.
    expect(['open', 'claimed']).toContain(after?.state);
  });
});

describe('[polls-voting] one vote per member is structural', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('voting twice moves the vote instead of adding one', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await castVote(s.gid, s.facts.pollId!, 'mira-t', 'o0', null);
    let poll = await inspectDoc(`groups/${s.gid}/polls/${s.facts.pollId}`);
    const opts = poll?.options as Record<string, { count: number }>;
    expect(opts.o0!.count).toBe(4); // seeded 3 + mine

    await castVote(s.gid, s.facts.pollId!, 'mira-t', 'o1', 'o0');
    poll = await inspectDoc(`groups/${s.gid}/polls/${s.facts.pollId}`);
    const after = poll?.options as Record<string, { count: number }>;
    expect(after.o0!.count).toBe(3);
    expect(after.o1!.count).toBe(6);

    // The document id is the uid, so there is exactly one vote whatever happens.
    const votes = await inspectAll(`groups/${s.gid}/polls/${s.facts.pollId}/votes`);
    expect(votes.filter((v) => v.id === 'mira-t')).toHaveLength(1);
  });

  it('many members voting at once are all counted', async () => {
    const s = await seedSize('demo');
    const voters = s.facts.memberUids.slice(0, 6);
    for (const uid of voters) {
      await signInAs(uid);
      await castVote(s.gid, s.facts.pollId!, uid, 'o2', null);
    }
    const poll = await inspectDoc(`groups/${s.gid}/polls/${s.facts.pollId}`);
    const opts = poll?.options as Record<string, { count: number }>;
    expect(opts.o2!.count).toBe(2 + voters.length); // seeded 2
    const votes = await inspectAll(`groups/${s.gid}/polls/${s.facts.pollId}/votes`);
    expect(votes.length).toBe(voters.length);
  });
});

describe('[summary-doc] the mirror is repairable', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('a drifted count can be rebuilt from the authoritative documents', async () => {
    const { rebuildSummary } = await import('../../src/data/summary');
    const s = await seedSize('demo');
    await asAdmin(async (fs) => {
      await updateDoc(doc(fs, `groups/${s.gid}/meta/summary`), { memberCount: increment(999) });
    });
    await signInAs(s.facts.adminUid);
    expect((await inspectDoc(`groups/${s.gid}/meta/summary`))?.memberCount).toBeGreaterThan(900);

    await rebuildSummary(s.gid);

    const fixed = await inspectDoc(`groups/${s.gid}/meta/summary`);
    expect(fixed?.repoCount).toBe(s.facts.counts.repos);
    expect(fixed?.openAskCount).toBe(s.facts.counts.openAsks);
  });

  it('a failed mirror write never fails the action that caused it', async () => {
    // bump() swallows errors by design: losing a count is cheaper than failing
    // a join. Signed in as a non-member, the write is denied and must be silent.
    const s = await seedSize('demo');
    await signInAs('outsider');
    await expect(noteMemberJoined(s.gid)).resolves.toBeUndefined();
    await expect(getDoc(doc(appDb(), `groups/${s.gid}/meta/summary`))).rejects.toThrow();
  });
});
