// Normalizers for the GitHub Events API payloads the app consumes (ARCH §5).
// Anything unrecognized returns null and is skipped.

export type GhFeedEvent = {
  id: string;
  type: string;
  actor?: { login?: string; avatar_url?: string };
  payload?: Record<string, unknown>;
  created_at?: string;
};

export type DailyCounters = {
  commits: number;
  prsOpened: number;
  prsMerged: number;
  issuesOpened: number;
  releases: number;
};

export type NormalizedEvent = {
  id: string;
  type: string;
  actorLogin: string;
  actorAvatarUrl: string;
  summary: string;
  url: string;
  occurredAt: Date;
  counters: Partial<DailyCounters>;
};

export const ZERO_COUNTERS: DailyCounters = {
  commits: 0,
  prsOpened: 0,
  prsMerged: 0,
  issuesOpened: 0,
  releases: 0,
};

type P = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function normalizeEvent(e: GhFeedEvent, repoFullName: string): NormalizedEvent | null {
  const p = (e.payload ?? {}) as P;
  const base = {
    id: e.id,
    actorLogin: e.actor?.login ?? 'someone',
    actorAvatarUrl: e.actor?.avatar_url ?? '',
    occurredAt: e.created_at ? new Date(e.created_at) : new Date(),
  };
  const repoUrl = `https://github.com/${repoFullName}`;

  switch (e.type) {
    case 'PushEvent': {
      const n = Number(p.distinct_size ?? p.size ?? 0);
      if (n <= 0) return null;
      const branch = String(p.ref ?? '').replace('refs/heads/', '') || 'main';
      return {
        ...base,
        type: 'push',
        summary: `${n} commit${n === 1 ? '' : 's'} to ${branch}`,
        url: `${repoUrl}/commits/${encodeURIComponent(branch)}`,
        counters: { commits: n },
      };
    }
    case 'PullRequestEvent': {
      const pr = p.pull_request as P | undefined;
      const num = pr?.number ?? '?';
      const title = String(pr?.title ?? '').slice(0, 120);
      const url = String(pr?.html_url ?? repoUrl);
      if (p.action === 'opened')
        return { ...base, type: 'pr_opened', summary: `PR #${num} opened: ${title}`, url, counters: { prsOpened: 1 } };
      if (p.action === 'closed' && pr?.merged)
        return { ...base, type: 'pr_merged', summary: `PR #${num} merged: ${title}`, url, counters: { prsMerged: 1 } };
      if (p.action === 'closed')
        return { ...base, type: 'pr_closed', summary: `PR #${num} closed: ${title}`, url, counters: {} };
      return null;
    }
    case 'IssuesEvent': {
      const issue = p.issue as P | undefined;
      const num = issue?.number ?? '?';
      const title = String(issue?.title ?? '').slice(0, 120);
      const url = String(issue?.html_url ?? repoUrl);
      if (p.action === 'opened')
        return { ...base, type: 'issue_opened', summary: `Issue #${num} opened: ${title}`, url, counters: { issuesOpened: 1 } };
      if (p.action === 'closed')
        return { ...base, type: 'issue_closed', summary: `Issue #${num} closed: ${title}`, url, counters: {} };
      return null;
    }
    case 'ReleaseEvent': {
      if (p.action !== 'published') return null;
      const rel = p.release as P | undefined;
      return {
        ...base,
        type: 'release',
        summary: `Release ${String(rel?.tag_name ?? '')}`.trim(),
        url: String(rel?.html_url ?? repoUrl),
        counters: { releases: 1 },
      };
    }
    case 'CreateEvent': {
      if (p.ref_type !== 'branch') return null;
      return {
        ...base,
        type: 'branch_created',
        summary: `branch ${String(p.ref ?? '')}`,
        url: `${repoUrl}/tree/${encodeURIComponent(String(p.ref ?? ''))}`,
        counters: {},
      };
    }
    case 'ForkEvent': {
      const forkee = p.forkee as P | undefined;
      return {
        ...base,
        type: 'fork',
        summary: `forked by @${base.actorLogin}`,
        url: String(forkee?.html_url ?? repoUrl),
        counters: {},
      };
    }
    default:
      return null;
  }
}

/** Digit-string id comparison without BigInt surprises. */
export function idGreater(a: string, b: string): boolean {
  if (a.length !== b.length) return a.length > b.length;
  return a > b;
}

/** YYYY-MM-DD in UTC — daily buckets are timezone-stable across members. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
