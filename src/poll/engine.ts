import { signal } from '@preact/signals';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { GhError, ghGetConditional } from '../github/client';
import { hasToken } from '../auth/vault';
import { log } from '../util/log';
import type { Repo } from '../data/types';
import {
  ZERO_COUNTERS,
  dayKey,
  idGreater,
  normalizeEvent,
  type DailyCounters,
  type GhFeedEvent,
} from './normalize';

// Client-side polling engine — ARCHITECTURE §5. Every open client volunteers;
// a Firestore transaction on poll.lastPolledAt elects exactly one claimant per
// repo per staleness window, so members share the work without duplicating it.

const POLL_INTERVAL_MS = 15 * 60_000;
const FORCED_MIN_STALE_MS = 30_000; // "refresh now" still dedupes across clients
const FIRST_POLL_WINDOW_MS = 30 * 86_400_000; // backfill cap on a repo's first poll
const DAILY_KEEP_DAYS = 21;

export type CycleEntry = { repo: string; outcome: string; at: number };
export const pollState = signal<{ lastCycleAt: number | null; running: boolean; results: CycleEntry[] }>({
  lastCycleAt: null,
  running: false,
  results: [],
});

let timer: ReturnType<typeof setInterval> | null = null;
let currentGid: string | null = null;
let cycleInFlight = false;

export function startPolling(gid: string): void {
  if (currentGid === gid && timer) return;
  stopPolling();
  currentGid = gid;
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void runCycle(gid);
  }, POLL_INTERVAL_MS);
  void runCycle(gid);
}

export function stopPolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
  currentGid = null;
}

export async function refreshNow(gid: string): Promise<void> {
  await runCycle(gid, FORCED_MIN_STALE_MS);
}

function note(repo: string, outcome: string): void {
  const results = [...pollState.value.results.slice(-19), { repo, outcome, at: Date.now() }];
  pollState.value = { ...pollState.value, results };
}

async function runCycle(gid: string, minStaleMs = POLL_INTERVAL_MS): Promise<void> {
  if (cycleInFlight || !hasToken()) return; // token-less tabs read; they don't poll
  cycleInFlight = true;
  pollState.value = { ...pollState.value, running: true };
  try {
    const snap = await getDocs(query(collection(db(), `groups/${gid}/repos`), where('archived', '==', false)));
    const repos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Repo, 'id'>) }));
    for (const repo of repos) {
      const last = repo.poll?.lastPolledAt?.toMillis() ?? 0;
      if (Date.now() - last < minStaleMs) continue;
      const claimed = await tryClaim(gid, repo.id, minStaleMs);
      if (!claimed) {
        note(repo.fullName, 'claim lost');
        continue;
      }
      try {
        const outcome = await pollRepo(gid, repo);
        note(repo.fullName, outcome);
      } catch (e) {
        note(repo.fullName, e instanceof GhError ? `error: ${e.kind}` : 'error');
        log('warn', `poll ${repo.fullName} failed: ${e instanceof GhError ? e.kind : 'unknown'}`);
        try {
          await runTransaction(db(), async (tx) => {
            tx.update(doc(db(), `groups/${gid}/repos/${repo.id}`), { 'poll.failing': true });
          });
        } catch {
          /* best-effort flag */
        }
        if (e instanceof GhError && (e.kind === 'rate_limit' || e.kind === 'auth')) break; // stop the cycle
      }
    }
  } catch (e) {
    log('warn', `poll cycle failed: ${(e as { code?: string }).code ?? 'unknown'}`);
  } finally {
    cycleInFlight = false;
    pollState.value = { ...pollState.value, running: false, lastCycleAt: Date.now() };
  }
}

async function tryClaim(gid: string, repoId: string, minStaleMs: number): Promise<boolean> {
  try {
    return await runTransaction(db(), async (tx) => {
      const ref = doc(db(), `groups/${gid}/repos/${repoId}`);
      const snap = await tx.get(ref);
      if (!snap.exists()) return false;
      const last = (snap.data().poll?.lastPolledAt as Timestamp | null)?.toMillis() ?? 0;
      if (Date.now() - last < minStaleMs) return false; // someone beat us to it
      tx.update(ref, { 'poll.lastPolledAt': serverTimestamp() });
      return true;
    });
  } catch {
    return false;
  }
}

async function pollRepo(gid: string, repo: Repo): Promise<string> {
  const res = await ghGetConditional<GhFeedEvent[]>(
    `/repos/${repo.fullName}/events?per_page=50`,
    repo.poll?.etag ?? null,
  );
  if (res.status === 304) return '304';

  const lastId = (repo.poll as { lastEventId?: string | null })?.lastEventId ?? null;
  const cutoff = Date.now() - FIRST_POLL_WINDOW_MS;
  const fresh = res.body.filter((e) => {
    if (!e.id || !e.created_at) return false;
    if (lastId) return idGreater(e.id, lastId);
    return Date.parse(e.created_at) >= cutoff; // first poll: bounded backfill
  });

  const normalized = fresh
    .map((e) => normalizeEvent(e, repo.fullName))
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const maxSeenId = res.body.reduce<string | null>(
    (m, e) => (e.id && (!m || idGreater(e.id, m)) ? e.id : m),
    lastId,
  );

  // Merge daily counters, prune old buckets.
  const daily: Record<string, DailyCounters> = { ...((repo as { daily?: Record<string, DailyCounters> }).daily ?? {}) };
  for (const ev of normalized) {
    const key = dayKey(ev.occurredAt);
    const cur = daily[key] ?? { ...ZERO_COUNTERS };
    for (const [k, v] of Object.entries(ev.counters)) {
      cur[k as keyof DailyCounters] += v ?? 0;
    }
    daily[key] = cur;
  }
  const keepAfter = dayKey(new Date(Date.now() - DAILY_KEEP_DAYS * 86_400_000));
  for (const key of Object.keys(daily)) if (key < keepAfter) delete daily[key];

  const stats7 = { ...ZERO_COUNTERS };
  const weekAgo = dayKey(new Date(Date.now() - 7 * 86_400_000));
  for (const [key, c] of Object.entries(daily)) {
    if (key >= weekAgo) {
      stats7.commits += c.commits;
      stats7.prsOpened += c.prsOpened;
      stats7.prsMerged += c.prsMerged;
      stats7.issuesOpened += c.issuesOpened;
      stats7.releases += c.releases;
    }
  }

  const batch = writeBatch(db());
  for (const ev of normalized) {
    batch.set(doc(db(), `groups/${gid}/repos/${repo.id}/events/${ev.id}`), {
      type: ev.type,
      actorLogin: ev.actorLogin,
      actorAvatarUrl: ev.actorAvatarUrl,
      summary: ev.summary,
      url: ev.url,
      occurredAt: Timestamp.fromDate(ev.occurredAt),
      source: 'poll',
      expireAt: Timestamp.fromMillis(ev.occurredAt.getTime() + 180 * 86_400_000),
      v: 1,
    });
  }
  const newest = normalized.at(-1);
  batch.update(doc(db(), `groups/${gid}/repos/${repo.id}`), {
    daily,
    stats7d: {
      commits: stats7.commits,
      prsOpened: stats7.prsOpened,
      prsMerged: stats7.prsMerged,
      issues: stats7.issuesOpened,
      releases: stats7.releases,
    },
    'poll.etag': res.etag,
    'poll.lastEventId': maxSeenId,
    'poll.failing': false,
    ...(newest ? { lastEventAt: Timestamp.fromDate(newest.occurredAt) } : {}),
  });
  await batch.commit();
  return normalized.length > 0 ? `+${normalized.length} events` : 'no new events';
}

/** 14-day sparkline series (oldest→newest) from a repo's daily map. */
export function sparkSeries(daily: Record<string, DailyCounters> | undefined): number[] {
  const out: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000));
    const c = daily?.[key];
    out.push(c ? c.commits + c.prsOpened + c.prsMerged + c.issuesOpened + c.releases : 0);
  }
  return out;
}
