import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Unsubscribe } from 'firebase/firestore';
import { assertEmulators, clearData, closeHarness, seedSize, signInAs } from './harness.ts';
import {
  watchActiveRepos,
  watchNewRepos,
  watchOrphanRepos,
  watchWantedRepos,
} from '../../src/data/repos';
import { watchLongestWaiting, watchNeedsHelp } from '../../src/data/asks';
import { watchRecentMembers } from '../../src/data/members';
import { watchOpenIdeas } from '../../src/data/ideas';
import { watchOpenPoll } from '../../src/data/polls';
import { watchUpcomingSessions } from '../../src/data/sessions';
import { watchLatestAnnouncement } from '../../src/data/announcements';
import { watchSummary } from '../../src/data/summary';
import { resilientWatch } from '../../src/data/resilientWatch';
import { REPO_NEEDS } from '../../src/data/types';

/**
 * Every live query, run against a seeded circle (TESTING.md §2, L3).
 *
 * The rules layer proves these reads are permitted; the unit layer proves the
 * pure logic downstream. What neither can answer is whether a query returns the
 * shape its consuming block assumes — the ordering, the bound, the filter. This
 * is also the only layer where a query runs against a real Firestore, so an
 * index the emulator ignores is at least exercised for shape.
 */

/** Await one emission from a watch, then detach — these are listeners, not fetches. */
function firstEmission<T>(
  attach: (cb: (value: T) => void, onError: (code: string) => void) => Unsubscribe,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // eslint-disable-next-line prefer-const -- read by the callbacks it is passed into
    let un: Unsubscribe | undefined;
    const timer = setTimeout(() => {
      un?.();
      reject(new Error('watch produced no value in time'));
    }, timeoutMs);
    un = attach(
      (value) => {
        clearTimeout(timer);
        un?.();
        resolve(value);
      },
      (code) => {
        clearTimeout(timer);
        un?.();
        reject(new Error(`watch failed: ${code}`));
      },
    );
  });
}

describe('[repo-registry] repo queries return what their blocks assume', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('active repos are bounded and newest-event first', async () => {
    const s = await seedSize('windowed');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<
      Array<{ lastEventAt?: { toMillis(): number }; archived: boolean }>
    >((cb, err) => watchActiveRepos(s.gid, cb as never, err, 12));
    expect(list.length).toBeLessThanOrEqual(12);
    expect(list.every((r) => r.archived === false)).toBe(true);
    const times = list.map((r) => r.lastEventAt?.toMillis() ?? 0);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('new repos come back newest-created first', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ createdAt?: { toMillis(): number } }>>((cb, err) =>
      watchNewRepos(s.gid, cb as never, err),
    );
    const times = list.map((r) => r.createdAt?.toMillis() ?? 0);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('wanted repos are ordered longest-waiting first (M18)', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const needs = REPO_NEEDS.map((n) => n.key);
    const list = await firstEmission<Array<{ id: string; needsSince?: { toMillis(): number } }>>(
      (cb, err) => watchWantedRepos(s.gid, needs, cb as never, err, 10),
    );
    expect(list.length).toBeGreaterThan(0);
    const times = list.map((r) => r.needsSince?.toMillis() ?? 0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // The scenario knows which repos are waiting and in what order.
    expect(s.facts.waitingRepoIds).toContain(list[0]!.id);
  });

  it('orphan repos are exactly the ones seeking an owner', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ id: string; seekingOwner?: boolean }>>((cb, err) =>
      watchOrphanRepos(s.gid, cb as never, err),
    );
    expect(list.every((r) => r.seekingOwner === true)).toBe(true);
    expect(list.map((r) => r.id)).toContain(s.facts.orphanRepoId);
  });
});

describe('[asks] ask queries', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('needs-help excludes resolved asks', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ id: string; state: string }>>((cb, err) =>
      watchNeedsHelp(s.gid, cb as never, err),
    );
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => a.state !== 'resolved')).toBe(true);
  });

  it('longest-waiting is oldest-first, which is the whole point', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ createdAt?: { toMillis(): number } }>>((cb) =>
      watchLongestWaiting(s.gid, cb as never),
    );
    const times = list.map((a) => a.createdAt?.toMillis() ?? 0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('[home-gating] the blocks Home mounts get usable data', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('recent members are newest-joined first and bounded to eight', async () => {
    const s = await seedSize('windowed');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ joinedAt?: { toMillis(): number } }>>((cb, err) =>
      watchRecentMembers(s.gid, cb as never, err),
    );
    expect(list.length).toBeLessThanOrEqual(8);
    const times = list.map((m) => m.joinedAt?.toMillis() ?? 0);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('open ideas exclude germinated ones', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ state: string }>>((cb, err) =>
      watchOpenIdeas(s.gid, cb as never, err),
    );
    expect(list.every((i) => i.state === 'open')).toBe(true);
  });

  it('the summary arrives as one document with the seeded counts', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const summary = await firstEmission<{ memberCount: number; repoCount: number } | null>(
      (cb, err) => watchSummary(s.gid, cb as never, err),
    );
    expect(summary?.memberCount).toBe(s.facts.counts.members);
    expect(summary?.repoCount).toBe(s.facts.counts.repos);
  });

  it('the open poll and the latest announcement each resolve to one item', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const poll = await firstEmission<{ id: string; state: string } | null>((cb) =>
      watchOpenPoll(s.gid, cb as never),
    );
    expect(poll?.id).toBe(s.facts.pollId);
    expect(poll?.state).toBe('open');

    const ann = await firstEmission<{ id: string } | null>((cb) =>
      watchLatestAnnouncement(s.gid, cb as never),
    );
    expect(ann?.id).toBe(s.facts.announcementId);
  });

  it('upcoming sessions exclude ones already past', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const list = await firstEmission<Array<{ startsAt: { toMillis(): number } }>>((cb) =>
      watchUpcomingSessions(s.gid, cb as never),
    );
    expect(list.every((x) => x.startsAt.toMillis() >= Date.now() - 60_000)).toBe(true);
  });
});

describe('[resilient-listeners] retrying is narrow on purpose', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('retries permission-denied, because a fresh join looks exactly like that', async () => {
    // The reason this exists: a listener attached in the moment after a
    // membership write is denied by a rules engine that has not seen the write
    // yet. A plain onSnapshot dies there permanently, which is what left new
    // members staring at an empty Home.
    let attempts = 0;
    const code = await new Promise<string>((resolve) => {
      resilientWatch(
        (_onOk, onErr) => {
          attempts++;
          setTimeout(() => onErr({ code: 'permission-denied' } as never), 2);
          return () => undefined;
        },
        { retries: 3, baseDelayMs: 2, onGiveUp: resolve },
      );
    });
    expect(code).toBe('permission-denied');
    expect(attempts).toBe(4); // the first attempt plus three retries
  });

  it('gives up at once on unavailable — an outage is not a denial', async () => {
    let attempts = 0;
    const code = await new Promise<string>((resolve) => {
      resilientWatch(
        (_onOk, onErr) => {
          attempts++;
          setTimeout(() => onErr({ code: 'unavailable' } as never), 2);
          return () => undefined;
        },
        { retries: 3, baseDelayMs: 2, onGiveUp: resolve },
      );
    });
    expect(code).toBe('unavailable');
    expect(attempts).toBe(1);
  });

  it('a healthy emission restores the full retry budget', async () => {
    let attempts = 0;
    const code = await new Promise<string>((resolve) => {
      resilientWatch(
        (onOk, onErr) => {
          attempts++;
          if (attempts === 1) {
            setTimeout(() => onErr({ code: 'permission-denied' } as never), 2);
          } else if (attempts === 2) {
            // Recovered, then failed again later: the budget must have reset,
            // so this failure gets its own full run of retries.
            onOk();
            setTimeout(() => onErr({ code: 'permission-denied' } as never), 2);
          } else {
            setTimeout(() => onErr({ code: 'unavailable' } as never), 2);
          }
          return () => undefined;
        },
        { retries: 1, baseDelayMs: 2, onGiveUp: resolve },
      );
    });
    expect(code).toBe('unavailable');
    expect(attempts).toBe(3);
  });

  it('unsubscribing stops the retry loop', async () => {
    let attempts = 0;
    const un = resilientWatch(
      (_onOk, onErr) => {
        attempts++;
        setTimeout(() => onErr({ code: 'permission-denied' } as never), 2);
        return () => undefined;
      },
      { retries: 10, baseDelayMs: 5, onGiveUp: () => undefined },
    );
    await new Promise((r) => setTimeout(r, 20));
    un();
    const seen = attempts;
    await new Promise((r) => setTimeout(r, 60));
    expect(attempts).toBe(seen);
  });

  // Deliberately not tested here: the same denial through a live emulator
  // listener. The SDK applies its own unbounded backoff to a denied stream
  // before surfacing the error, on top of resilientWatch's, so the wall-clock
  // is not a property a timed test can assert. The denial itself is proven by
  // the rules layer, and the user-visible recovery by the E2E journey; what is
  // left — resilientWatch's own contract — is covered synthetically above.
});
