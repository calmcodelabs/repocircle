import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import {
  asAdmin,
  assertEmulators,
  clearData,
  closeHarness,
  inspectAll,
  inspectDoc,
  seedSize,
  signInAs,
} from './harness.ts';
import { ghRoute, RATE_LIMITED, type RouteResult } from '../fixtures/github.ts';
import { configureTokenProvider } from '../../src/github/client';
import { clearToken, setToken } from '../../src/auth/vault';
import { refreshNow } from '../../src/poll/engine';

/**
 * The polling engine, end to end against fixtures (TESTING.md §2, L3).
 *
 * This is the riskiest system in the app and had no coverage above the
 * normalizer. It writes to Firestore under real rules, so the whole loop is
 * exercised: claim election, the 304 path that keeps the rate-limit budget
 * intact, bounded first-poll backfill, daily bucket merging, the 7-day rollup,
 * and stopping the cycle when GitHub says no.
 *
 * The GitHub API is never called. `fetch` is stubbed with the shared fixture
 * router, which Playwright also serves in T4 — one truth for both layers.
 */

const NOW = Date.parse('2026-09-01T12:00:00.000Z');

let calls: string[] = [];
let override: ((path: string) => RouteResult | null) | null = null;

function stubGitHub() {
  calls = [];
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    calls.push(path);
    const etag = (init?.headers as Record<string, string> | undefined)?.['If-None-Match'] ?? null;
    const r = override?.(path) ?? ghRoute(path, NOW, etag);
    return new Response(r.body === null ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: r.headers ?? {},
    });
  });
  // The engine gates on the vault (`hasToken()`), not on the provider — a
  // token-less tab reads but never polls. The vault falls back to memory when
  // sessionStorage is absent, which is exactly the case under node.
  setToken('gho_testtoken');
  configureTokenProvider({ get: () => 'gho_testtoken', refresh: async () => 'gho_testtoken' });
}

/** Make every repo stale enough that the cycle will consider it. */
async function makeStale(gid: string, repoIds: string[], exceptId?: string) {
  await asAdmin(async (fs) => {
    for (const id of repoIds) {
      await setDoc(
        doc(fs, `groups/${gid}/repos/${id}`),
        {
          poll: {
            lastPolledAt:
              id === exceptId
                ? Timestamp.fromMillis(Date.now())
                : Timestamp.fromMillis(Date.now() - 3_600_000),
            etag: null,
            failing: false,
          },
        },
        { merge: true },
      );
    }
  });
}

describe('[poll-engine] a polling cycle', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
    override = null;
    stubGitHub();
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(closeHarness);

  it('writes normalized events and rolls up the week', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    await makeStale(s.gid, s.facts.repoIds);

    await refreshNow(s.gid);

    const first = s.facts.repoIds[0]!;
    const events = await inspectAll(`groups/${s.gid}/repos/${first}/events`);
    expect(events.length).toBeGreaterThan(0);
    // The WatchEvent in the fixture must be dropped — the normalizer ignores it.
    expect(events.some((e) => e.data.type === 'WatchEvent')).toBe(false);
    // Document id is the GitHub event id, which makes re-ingestion idempotent.
    expect(events.map((e) => e.id)).toContain('5000');

    const repo = await inspectDoc(`groups/${s.gid}/repos/${first}`);
    const stats = repo?.stats7d as Record<string, number>;
    expect(stats.commits).toBeGreaterThan(0);
    expect(repo?.poll).toMatchObject({ failing: false });
    expect((repo?.poll as Record<string, unknown>).etag).toBe('"events-v1"');
  });

  it('re-polling with a matching ETag costs nothing and writes nothing new', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    await makeStale(s.gid, s.facts.repoIds);
    await refreshNow(s.gid);

    const first = s.facts.repoIds[0]!;
    const after = await inspectAll(`groups/${s.gid}/repos/${first}/events`);
    calls = [];
    await makeStale(s.gid, s.facts.repoIds); // stale again, ETag retained
    await refreshNow(s.gid);

    // Same event documents: a 304 must not duplicate or delete anything.
    const again = await inspectAll(`groups/${s.gid}/repos/${first}/events`);
    expect(again.length).toBe(after.length);
    expect(calls.some((c) => c.includes('/events'))).toBe(true);
  });

  it('ingesting the same events twice is idempotent', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    await makeStale(s.gid, s.facts.repoIds);
    await refreshNow(s.gid);
    const first = s.facts.repoIds[0]!;
    const before = await inspectAll(`groups/${s.gid}/repos/${first}/events`);

    // Drop the ETag so the engine re-reads the identical feed.
    await asAdmin(async (fs) => {
      await setDoc(
        doc(fs, `groups/${s.gid}/repos/${first}`),
        {
          poll: {
            lastPolledAt: Timestamp.fromMillis(Date.now() - 3_600_000),
            etag: null,
            failing: false,
          },
        },
        { merge: true },
      );
    });
    await refreshNow(s.gid);

    const after = await inspectAll(`groups/${s.gid}/repos/${first}/events`);
    expect(after.length).toBe(before.length);
  });

  it('does not poll a repo another client just claimed', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    const fresh = s.facts.repoIds[0]!;
    await makeStale(s.gid, s.facts.repoIds, fresh);

    await refreshNow(s.gid);

    // The freshly-polled repo was skipped, so it has no events.
    expect(await inspectAll(`groups/${s.gid}/repos/${fresh}/events`)).toHaveLength(0);
  });

  it('flags the repo and stops the cycle when the rate limit is hit', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    await makeStale(s.gid, s.facts.repoIds);
    override = (path) => (path.includes('/events') ? RATE_LIMITED : null);

    await refreshNow(s.gid);

    const flagged = await Promise.all(
      s.facts.repoIds.map(async (id) => {
        const r = await inspectDoc(`groups/${s.gid}/repos/${id}`);
        return (r?.poll as Record<string, unknown>)?.failing === true;
      }),
    );
    // At least one marked failing, and the cycle broke rather than burning
    // every repo's request against an exhausted limit.
    expect(flagged.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(calls.filter((c) => c.includes('/events')).length).toBeLessThan(s.facts.repoIds.length);
  });

  it('clears the failing flag once a poll succeeds again', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    const first = s.facts.repoIds[0]!;
    await asAdmin(async (fs) => {
      await setDoc(
        doc(fs, `groups/${s.gid}/repos/${first}`),
        {
          poll: {
            lastPolledAt: Timestamp.fromMillis(Date.now() - 3_600_000),
            etag: null,
            failing: true,
          },
        },
        { merge: true },
      );
    });

    await refreshNow(s.gid);

    const repo = await inspectDoc(`groups/${s.gid}/repos/${first}`);
    expect((repo?.poll as Record<string, unknown>).failing).toBe(false);
  });

  it('a token-less tab reads but never polls', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    await makeStale(s.gid, s.facts.repoIds);
    clearToken();
    configureTokenProvider({ get: () => null, refresh: async () => null });

    await refreshNow(s.gid);

    expect(calls.filter((c) => c.includes('/events'))).toHaveLength(0);
    expect(await inspectAll(`groups/${s.gid}/repos/${s.facts.repoIds[0]}/events`)).toHaveLength(0);
  });

  it('never reads more repos in one cycle than the bite size', async () => {
    // The bug M16 found: the engine read every non-archived repo every cycle in
    // every open tab. The bound is what keeps a 600-repo circle affordable.
    const s = await seedSize('windowed');
    await signInAs(s.facts.adminUid);
    await makeStale(s.gid, s.facts.repoIds);

    await refreshNow(s.gid);

    const polled = calls.filter((c) => c.includes('/events')).length;
    expect(polled).toBeLessThanOrEqual(20);
    expect(s.facts.repoIds.length).toBeGreaterThan(20);
  });
});
