/**
 * The one scenario library (TESTING.md §4).
 *
 * Every seeded circle in this project comes from here: the local dev seed
 * (scripts/seed-emulator.mjs), integration tests, component fixtures and the
 * E2E journeys. Two copies of "what a circle looks like" would drift, and a
 * fixture that drifts from the dev seed means the thing you click through is
 * not the thing CI proves — the Class F instinct applied to data.
 *
 * Everything is a plain object with a `now` injected, so the same scenario
 * produces byte-identical documents on every run. Nothing here calls
 * Firestore; `writeScenario` (test/fixtures/write.ts) is what puts it there.
 */

export type Size = 'minimal' | 'demo' | 'windowed';

const DAY = 86_400_000;

/** Fixed instant so relative times are deterministic; override per run. */
export const DEFAULT_NOW = Date.parse('2026-09-01T12:00:00.000Z');

export type ScenarioOpts = {
  /** Epoch ms that "now" means for this scenario. */
  now?: number;
  /** Circle id. Defaults per size so two scenarios can coexist in one emulator. */
  gid?: string;
};

export type SeedDoc = { path: string; data: Record<string, unknown> };

/**
 * A scenario is just an ordered list of documents plus the metadata a test
 * needs to make assertions without re-deriving it (who is admin, which repo
 * is orphaned, what the invite token is).
 */
export type Scenario = {
  size: Size;
  gid: string;
  now: number;
  docs: SeedDoc[];
  facts: ScenarioFacts;
};

export type ScenarioFacts = {
  gid: string;
  groupName: string;
  adminUid: string;
  memberUids: string[];
  guestUid: string | null;
  inviteToken: string;
  repoIds: string[];
  /** Repo whose owner left — the adoption surface. */
  orphanRepoId: string | null;
  /** Repos with a `needs` set, oldest `needsSince` first (M18 ordering). */
  waitingRepoIds: string[];
  askIds: string[];
  /** Asks in state 'open' only. */
  openAskIds: string[];
  /** Asks the summary counts: open or claimed. Matches rebuildSummary. */
  unresolvedAskIds: string[];
  ideaIds: string[];
  germinatedIdeaId: string | null;
  sessionId: string | null;
  pollId: string | null;
  announcementId: string | null;
  counts: { members: number; repos: number; openAsks: number };
};

/**
 * Cyclic lookup into a table that is never empty. `noUncheckedIndexedAccess`
 * is on for good reasons, but every table below is a module constant with a
 * fixed length, so the undefined branch it warns about cannot happen.
 */
function cyc<T>(arr: readonly T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length] as T;
}

const avatar = (login: string) => `https://avatars.githubusercontent.com/${login}`;
const iso = (ms: number) => new Date(ms).toISOString();
const dayKey = (ms: number) => iso(ms).slice(0, 10);

/**
 * Timestamps travel as ISO strings and are converted at the write boundary.
 * Keeping the library free of the Firestore SDK is what lets component tests
 * and the .mjs seed script share it without importing firebase.
 */
export type TimestampMarker = { __ts: string };
export const ts = (ms: number): TimestampMarker => ({ __ts: iso(ms) });
export const isTimestamp = (v: unknown): v is TimestampMarker =>
  typeof v === 'object' && v !== null && typeof (v as TimestampMarker).__ts === 'string';

type Person = {
  login: string;
  name: string;
  helpWith: string[];
  learning: string[];
  domainTags: string[];
};

const PEOPLE: Person[] = [
  { login: 'n-rahman', name: 'Nadia Rahman', helpWith: ['backend', 'ml'], learning: ['rust'], domainTags: ['web'] }, // prettier-ignore
  { login: 'mira-t', name: 'Mira Thomas', helpWith: ['frontend', 'design'], learning: ['three.js'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 'dev-anand', name: 'Dev Anand', helpWith: ['backend'], learning: ['kubernetes'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 's-qureshi', name: 'Sana Qureshi', helpWith: ['ml', 'feedback'], learning: ['jax'], domainTags: ['web'] }, // prettier-ignore
  { login: 'arjun-kv', name: 'Arjun K V', helpWith: ['frontend'], learning: ['svelte'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 'felix-w', name: 'Felix Wu', helpWith: ['design', 'feedback'], learning: ['figma variables'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 'tomas-b', name: 'Tomas Bergman', helpWith: ['backend'], learning: ['elixir'], domainTags: ['web'] }, // prettier-ignore
  { login: 'yuki-n', name: 'Yuki Nakamura', helpWith: ['ml'], learning: ['pytorch'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 'omar-f', name: 'Omar Farouk', helpWith: ['frontend', 'backend'], learning: [], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 'lena-k', name: 'Lena Kowalski', helpWith: ['design'], learning: ['motion'], domainTags: ['web'] }, // prettier-ignore
  { login: 'priya-s', name: 'Priya Sharma', helpWith: ['backend', 'feedback'], learning: ['go'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
  { login: 'jonas-e', name: 'Jonas Eriksen', helpWith: ['frontend'], learning: ['wasm'], domainTags: ['ML', 'tooling'] }, // prettier-ignore
];

type RepoSpec = {
  name: string;
  lang: string;
  owner: string;
  pitch: string;
  needs: string | null;
  lastDays: number;
};

const REPOS: RepoSpec[] = [
  { name: 'atlas', lang: 'TypeScript', owner: 'n-rahman', pitch: 'A map of every service we run, drawn from the code.', needs: 'frontend', lastDays: 9 }, // prettier-ignore
  { name: 'tide', lang: 'Python', owner: 's-qureshi', pitch: 'Tidal prediction that runs on a phone, offline.', needs: 'ml', lastDays: 22 }, // prettier-ignore
  { name: 'quarry', lang: 'Rust', owner: 'dev-anand', pitch: 'Pulls structured data out of very messy PDFs.', needs: 'backend', lastDays: 3 }, // prettier-ignore
  { name: 'plume', lang: 'TypeScript', owner: 'mira-t', pitch: 'Writing tool that gets out of the way.', needs: null, lastDays: 1 }, // prettier-ignore
  { name: 'ledger-lite', lang: 'Go', owner: 'priya-s', pitch: 'Double-entry bookkeeping as a library.', needs: 'feedback', lastDays: 14 }, // prettier-ignore
  { name: 'sable', lang: 'Swift', owner: 'arjun-kv', pitch: 'A calmer camera app.', needs: null, lastDays: 40 }, // prettier-ignore
  { name: 'kiln', lang: 'Rust', owner: 'tomas-b', pitch: 'Builds container images without a daemon.', needs: 'backend', lastDays: 5 }, // prettier-ignore
  { name: 'orchard', lang: 'Python', owner: 'yuki-n', pitch: 'Small models, trained on one machine, properly.', needs: 'ml', lastDays: 2 }, // prettier-ignore
];

const ASKS: Array<{ kind: string; title: string; state: string; days: number }> = [
  { kind: 'ask', title: 'Postgres connection pool keeps saturating under load', state: 'open', days: 11 }, // prettier-ignore
  { kind: 'stuck', title: 'Vite build fails only in CI, never locally', state: 'open', days: 6 },
  { kind: 'ask', title: 'Anyone done OAuth device flow in Rust?', state: 'claimed', days: 2 },
  { kind: 'ask', title: 'Reviewing my first ML pipeline — sanity check?', state: 'resolved', days: 4 }, // prettier-ignore
];

const IDEAS: Array<{ title: string; needs: string | null; state: string }> = [
  { title: 'A shared changelog for everything the club ships', needs: 'frontend', state: 'open' },
  { title: 'Reading group tracker that nobody has to maintain', needs: 'anything', state: 'open' },
  { title: 'Seat finder for the lab, from the door sensor data', needs: null, state: 'germinated' },
];

const GROUP_NAME = 'Northside Build Club';
const GROUP_DESC = 'Second-year CS and anyone who keeps shipping. Invite only.';
const DEFAULT_GIDS: Record<Size, string> = {
  minimal: 'minimal-circle',
  demo: 'demo-circle',
  windowed: 'windowed-circle',
};

/** How many of each entity a size seeds. `windowed` exceeds every M16 bound. */
const SIZES: Record<Size, { people: number; repos: number; asks: number; ideas: number }> = {
  minimal: { people: 3, repos: 2, asks: 2, ideas: 1 },
  demo: { people: 12, repos: 8, asks: 4, ideas: 3 },
  windowed: { people: 60, repos: 40, asks: 24, ideas: 18 },
};

/** Deterministic filler people/repos beyond the hand-written ones. */
function personAt(i: number): Person {
  const base = cyc(PEOPLE, i);
  if (i < PEOPLE.length) return base;
  const n = Math.floor(i / PEOPLE.length);
  return {
    login: `${base.login}-${n}`,
    name: `${base.name} ${n}`,
    helpWith: base.helpWith,
    learning: base.learning,
    domainTags: base.domainTags,
  };
}

function repoAt(i: number, people: number): RepoSpec {
  const base = cyc(REPOS, i);
  if (i < REPOS.length) return base;
  const n = Math.floor(i / REPOS.length);
  return {
    name: `${base.name}-${n}`,
    lang: base.lang,
    owner: personAt(i % people).login,
    pitch: base.pitch,
    needs: base.needs,
    lastDays: (base.lastDays + i) % 45,
  };
}

export function buildScenario(size: Size, opts: ScenarioOpts = {}): Scenario {
  const now = opts.now ?? DEFAULT_NOW;
  const gid = opts.gid ?? DEFAULT_GIDS[size];
  const n = SIZES[size];
  const ago = (d: number) => ts(now - d * DAY);
  const ahead = (d: number) => ts(now + d * DAY);
  const docs: SeedDoc[] = [];

  const people = Array.from({ length: n.people }, (_, i) => personAt(i));
  const repos = Array.from({ length: n.repos }, (_, i) => repoAt(i, n.people));
  const adminUid = cyc(people, 0).login;
  // The last three arrived this week, so "New in the circle" always has content.
  const arrivalsFrom = Math.max(1, n.people - 3);

  docs.push({
    path: `groups/${gid}`,
    data: {
      name: GROUP_NAME,
      description: GROUP_DESC,
      visibility: 'private',
      createdBy: adminUid,
      memberCount: n.people,
      settings: {
        askTags: ['frontend', 'backend', 'ML', 'docs', 'devops'],
        defaultRole: 'member',
      },
      createdAt: ago(120),
      v: 1,
    },
  });

  people.forEach((p, i) => {
    docs.push({
      path: `groups/${gid}/members/${p.login}`,
      data: {
        role: i === 0 ? 'admin' : 'member',
        login: p.login,
        name: p.name,
        avatarUrl: avatar(p.login),
        availability: { status: i % 4 === 0 ? 'heads_down' : 'free' },
        helpWith: p.helpWith,
        learning: p.learning,
        domainTags: p.domainTags,
        checklist: { addedRepo: true, saidHelpWith: true },
        joinedAt: ago(i >= arrivalsFrom ? 2 : 40 + i),
        joinedVia: i === 0 ? 'founder' : 'seed',
        v: 1,
      },
    });
  });

  const inviteToken = 'devtoken';
  docs.push({
    path: `groups/${gid}/invites/${inviteToken}`,
    data: {
      token: inviteToken,
      role: 'member',
      expiresAt: ahead(30),
      revoked: false,
      createdBy: adminUid,
      createdByLogin: adminUid,
      groupName: GROUP_NAME,
      groupDescription: GROUP_DESC,
      memberCount: n.people,
      repoCount: n.repos,
      createdAt: ago(1),
      label: 'local development',
      v: 1,
    },
  });

  const repoIds: string[] = [];
  const waiting: Array<{ id: string; since: number }> = [];
  let orphanRepoId: string | null = null;

  repos.forEach((r, i) => {
    const id = String(1000 + i);
    repoIds.push(id);
    const daily: Record<string, Record<string, number>> = {};
    for (let d = 0; d < 8; d++) {
      daily[dayKey(now - d * DAY)] = {
        commits: (i + d) % 5,
        prsOpened: d % 3 === 0 ? 1 : 0,
        prsMerged: 0,
        issuesOpened: 0,
        releases: 0,
      };
    }
    // One repo per scenario is left ownerless, so adoption always has a subject.
    const isOrphan = i === repos.length - 1 && repos.length > 1;
    if (isOrphan) orphanRepoId = id;
    const needsSinceMs = r.needs ? now - (3 + i * 6) * DAY : null;
    if (r.needs) waiting.push({ id, since: needsSinceMs! });

    docs.push({
      path: `groups/${gid}/repos/${id}`,
      data: {
        fullName: `northside/${r.name}`,
        htmlUrl: `https://github.com/northside/${r.name}`,
        description: r.pitch,
        language: r.lang,
        topics: [],
        githubOwnerLogin: r.owner,
        ownerUid: r.owner,
        registeredBy: r.owner,
        status: i === 5 ? 'paused' : 'building',
        demoUrl: null,
        archived: false,
        lastEventAt: ago(r.lastDays),
        poll: { lastPolledAt: ago(0), etag: null, failing: false },
        stats7d: { commits: 12, prsOpened: 2, prsMerged: 1, issues: 0, releases: 0 },
        daily,
        pitch: r.pitch,
        needs: r.needs,
        needsSince: needsSinceMs === null ? null : ts(needsSinceMs),
        domainTags: ['tooling'],
        seekingOwner: isOrphan,
        ownerLeft: isOrphan,
        interestCount: i % 3,
        commentCount: i === 0 ? 2 : 0,
        // Two were registered this week, so "New this week" has content.
        createdAt: ago(i < 2 ? 3 : 60 + i),
        v: 1,
      },
    });
  });

  docs.push({
    path: `groups/${gid}/repos/${cyc(repoIds, 0)}/comments/c1`,
    data: {
      authorUid: cyc(people, 1).login,
      authorLogin: cyc(people, 1).login,
      authorAvatarUrl: avatar(cyc(people, 1).login),
      body: 'The service graph is the good bit. Could it group by team?',
      parentId: null,
      mentions: [],
      repoRefs: [],
      pinned: false,
      gid,
      createdAt: ago(1),
      v: 1,
    },
  });

  const askIds: string[] = [];
  const openAskIds: string[] = [];
  // The app's summary counts *unresolved* asks (open or claimed), not strictly
  // open ones — rebuildSummary queries `state in ['open','claimed']`. Keeping
  // both makes the difference explicit instead of a fixture that quietly
  // disagrees with the code it is seeding for.
  const unresolvedAskIds: string[] = [];
  for (let i = 0; i < n.asks; i++) {
    const a = cyc(ASKS, i);
    const id = `a${i}`;
    askIds.push(id);
    if (a.state === 'open') openAskIds.push(id);
    if (a.state !== 'resolved') unresolvedAskIds.push(id);
    const author = cyc(people, i + 1).login;
    const claimer = cyc(people, 2).login;
    const resolver = cyc(people, people.length - 1).login;
    docs.push({
      path: `groups/${gid}/asks/${id}`,
      data: {
        kind: a.kind,
        title: a.title,
        detail: 'Seeded for local development.',
        tags: ['backend'],
        authorUid: author,
        authorLogin: author,
        authorAvatarUrl: avatar(author),
        state: a.state,
        claimCount: a.state === 'claimed' ? 1 : 0,
        claimerUids: a.state === 'claimed' ? [claimer] : [],
        createdAt: ago(a.days + i),
        ...(a.state === 'resolved'
          ? { resolvedAt: ago(1), resolvedWithUid: resolver, resolvedWithLogin: resolver }
          : {}),
        v: 1,
      },
    });
  }

  const ideaIds: string[] = [];
  let germinatedIdeaId: string | null = null;
  for (let i = 0; i < n.ideas; i++) {
    const idea = cyc(IDEAS, i);
    const id = `i${i}`;
    ideaIds.push(id);
    const author = cyc(people, i + 2).login;
    const germinated = idea.state === 'germinated';
    if (germinated && !germinatedIdeaId) germinatedIdeaId = id;
    docs.push({
      path: `groups/${gid}/ideas/${id}`,
      data: {
        title: idea.title,
        pitch: idea.title,
        detail: 'Seeded for local development.',
        domainTags: ['web'],
        needs: idea.needs,
        authorUid: author,
        authorLogin: author,
        authorAvatarUrl: avatar(author),
        state: idea.state,
        interestCount: i,
        commentCount: 0,
        createdAt: ago(4 + i),
        ...(germinated
          ? { repoId: cyc(repoIds, 0), repoFullName: `northside/${cyc(repos, 0).name}` }
          : {}),
        v: 1,
      },
    });
  }

  docs.push({
    path: `groups/${gid}/collabRequests/cr1`,
    data: {
      repoId: cyc(repoIds, 0),
      repoFullName: `northside/${cyc(repos, 0).name}`,
      requesterUid: cyc(people, 1).login,
      requesterLogin: cyc(people, 1).login,
      note: 'Happy to take the graph view.',
      repoOwnerUid: cyc(repos, 0).owner,
      githubIssueNumber: 4,
      state: 'accepted',
      decidedBy: cyc(repos, 0).owner,
      decidedAt: ago(2),
      createdAt: ago(5),
      v: 1,
    },
  });

  const host = cyc(people, 2).login;
  const sessionId = 's1';
  docs.push({
    path: `groups/${gid}/sessions/${sessionId}`,
    data: {
      title: 'Saturday build session',
      detail: 'Bring whatever state it is in. Room 2.14, or the call link.',
      startsAt: ahead(2),
      durationMin: 180,
      url: 'https://meet.example.com/northside',
      hostUid: host,
      hostLogin: host,
      hostAvatarUrl: avatar(host),
      cancelled: false,
      rsvpCount: 2,
      createdAt: ago(1),
      v: 1,
    },
  });
  for (const who of [cyc(people, 1).login, cyc(people, 4).login]) {
    docs.push({
      path: `groups/${gid}/sessions/${sessionId}/interests/${who}`,
      data: {
        login: who,
        avatarUrl: avatar(who),
        gid,
        repoOwnerUid: host,
        createdAt: ago(0),
        v: 1,
      },
    });
  }

  const pollId = 'p1';
  docs.push({
    path: `groups/${gid}/polls/${pollId}`,
    data: {
      question: 'What should the next workshop cover?',
      options: {
        o0: { label: 'Writing a language server', count: 3 },
        o1: { label: 'Profiling and flame graphs', count: 5 },
        o2: { label: 'Postgres query planning', count: 2 },
      },
      authorUid: adminUid,
      authorLogin: adminUid,
      authorAvatarUrl: avatar(adminUid),
      state: 'open',
      createdAt: ago(2),
      v: 1,
    },
  });

  const announcementId = 'an1';
  docs.push({
    path: `groups/${gid}/announcements/${announcementId}`,
    data: {
      body: 'Demo night is the 19th, 6pm, room 2.14. Five minutes each, whatever state it is in.',
      authorUid: adminUid,
      authorLogin: adminUid,
      authorAvatarUrl: avatar(adminUid),
      createdAt: ago(1),
      v: 1,
    },
  });

  docs.push({
    path: `groups/${gid}/meta/summary`,
    data: {
      memberCount: n.people,
      repoCount: n.repos,
      openAskCount: unresolvedAskIds.length,
      links: [
        { label: 'Club Discord', url: 'https://discord.gg/example' },
        { label: 'How we work', url: 'https://example.dev/handbook' },
      ],
      pinnedRepoId: cyc(repoIds, 0),
      v: 1,
    },
  });

  return {
    size,
    gid,
    now,
    docs,
    facts: {
      gid,
      groupName: GROUP_NAME,
      adminUid,
      memberUids: people.map((p) => p.login),
      guestUid: null,
      inviteToken,
      repoIds,
      orphanRepoId,
      waitingRepoIds: waiting.sort((a, b) => a.since - b.since).map((w) => w.id),
      askIds,
      openAskIds,
      unresolvedAskIds,
      ideaIds,
      germinatedIdeaId,
      sessionId,
      pollId,
      announcementId,
      counts: { members: n.people, repos: n.repos, openAsks: unresolvedAskIds.length },
    },
  };
}
