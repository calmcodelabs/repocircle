/**
 * The one GitHub fixture set (TESTING.md §4).
 *
 * The real API is never called by any test. These payloads serve two consumers:
 * integration tests stub `fetch` with `ghRouter` below, and the Playwright
 * journeys intercept `api.github.com/**` with the same data — so an E2E run and
 * an integration run disagree about GitHub only if this file is wrong.
 *
 * Event shapes match what src/poll/normalize.ts consumes; anything it ignores is
 * deliberately present too, because ignoring it is part of what is under test.
 */

export type GhEvent = {
  id: string;
  type: string;
  actor: { login: string; avatar_url: string };
  payload: Record<string, unknown>;
  created_at: string;
};

const avatar = (login: string) => `https://avatars.githubusercontent.com/${login}`;

/** Events at fixed offsets from a caller-supplied `now`, so rollups are stable. */
export function events(now: number, repo = 'northside/atlas'): GhEvent[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
  return [
    {
      id: '5000',
      type: 'PushEvent',
      actor: { login: 'n-rahman', avatar_url: avatar('n-rahman') },
      payload: {
        size: 3,
        commits: [{ message: 'Draw the service graph' }],
        ref: 'refs/heads/main',
      },
      created_at: at(2),
    },
    {
      id: '4999',
      type: 'PullRequestEvent',
      actor: { login: 'mira-t', avatar_url: avatar('mira-t') },
      payload: {
        action: 'opened',
        number: 12,
        pull_request: {
          title: 'Group the graph by team',
          merged: false,
          html_url: `https://github.com/${repo}/pull/12`,
        },
      },
      created_at: at(20),
    },
    {
      id: '4998',
      type: 'PullRequestEvent',
      actor: { login: 'n-rahman', avatar_url: avatar('n-rahman') },
      payload: {
        action: 'closed',
        number: 11,
        pull_request: {
          title: 'Cache the manifest',
          merged: true,
          html_url: `https://github.com/${repo}/pull/11`,
        },
      },
      created_at: at(30),
    },
    {
      id: '4997',
      type: 'IssuesEvent',
      actor: { login: 'dev-anand', avatar_url: avatar('dev-anand') },
      payload: { action: 'opened', issue: { number: 7, title: 'Graph is slow past 200 nodes' } },
      created_at: at(40),
    },
    {
      id: '4996',
      type: 'ReleaseEvent',
      actor: { login: 'n-rahman', avatar_url: avatar('n-rahman') },
      payload: {
        action: 'published',
        release: { tag_name: 'v0.3.0', html_url: `https://github.com/${repo}/releases/v0.3.0` },
      },
      created_at: at(50),
    },
    {
      // Deliberately a type the normalizer drops — proves filtering happens.
      id: '4995',
      type: 'WatchEvent',
      actor: { login: 'felix-w', avatar_url: avatar('felix-w') },
      payload: { action: 'started' },
      created_at: at(60),
    },
  ];
}

/** An event older than the first-poll backfill window (30 days). */
export function ancientEvent(now: number): GhEvent {
  return {
    id: '1000',
    type: 'PushEvent',
    actor: { login: 'n-rahman', avatar_url: avatar('n-rahman') },
    payload: { size: 1, commits: [{ message: 'Initial commit' }] },
    created_at: new Date(now - 400 * 86_400_000).toISOString(),
  };
}

export const user = {
  login: 'n-rahman',
  id: 4242,
  name: 'Nadia Rahman',
  avatar_url: avatar('n-rahman'),
};

export function repo(fullName = 'northside/atlas', id = 1000) {
  const [owner, name] = fullName.split('/');
  return {
    id,
    name,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: 'A map of every service we run, drawn from the code.',
    language: 'TypeScript',
    topics: ['graph', 'infra'],
    private: false,
    fork: false,
    archived: false,
    owner: { login: owner, avatar_url: avatar(owner ?? 'n-rahman') },
    pushed_at: new Date().toISOString(),
  };
}

export const userRepos = [repo('northside/atlas', 1000), repo('northside/plume', 1003)];

export const issue = {
  number: 4,
  html_url: 'https://github.com/northside/atlas/issues/4',
  title: 'Collaboration request from @mira-t',
  state: 'open',
};

export type RouteResult = { status: number; body: unknown; headers?: Record<string, string> };

export const RATE_HEADERS = { 'X-RateLimit-Remaining': '4999', 'X-RateLimit-Limit': '5000' };

/**
 * Resolve a GitHub API path to a canned response. Shared by the integration
 * fetch stub and the Playwright route handler so both see one truth.
 */
export function ghRoute(path: string, now: number, etag: string | null = null): RouteResult {
  const p = path.replace(/^https:\/\/api\.github\.com/, '');

  if (/\/repos\/[^/]+\/[^/]+\/events/.test(p)) {
    // A matching ETag means nothing changed — the zero-cost path the engine
    // relies on to stay inside the rate limit.
    if (etag === '"events-v1"')
      return { status: 304, body: null, headers: { ETag: '"events-v1"' } };
    return {
      status: 200,
      body: events(now),
      headers: { ETag: '"events-v1"', ...RATE_HEADERS },
    };
  }
  if (p === '/user') return { status: 200, body: user, headers: RATE_HEADERS };
  if (p.startsWith('/user/repos')) return { status: 200, body: userRepos, headers: RATE_HEADERS };
  if (/\/repos\/[^/]+\/[^/]+\/issues$/.test(p))
    return { status: 201, body: issue, headers: RATE_HEADERS };
  if (/\/repos\/[^/]+\/[^/]+$/.test(p)) return { status: 200, body: repo(), headers: RATE_HEADERS };
  if (/\/repos\/[^/]+\/[^/]+\/collaborators\//.test(p))
    return { status: 204, body: null, headers: RATE_HEADERS };
  return { status: 404, body: { message: 'Not Found' }, headers: RATE_HEADERS };
}

/** Rate-limit exhaustion, for the path that must stop the poll cycle. */
export const RATE_LIMITED: RouteResult = {
  status: 403,
  body: { message: 'API rate limit exceeded' },
  headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '9999999999' },
};
