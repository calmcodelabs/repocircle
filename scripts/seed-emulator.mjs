/**
 * Fills the local Firestore emulator with a circle big enough to be worth
 * clicking through: enough members that the windows and counts matter, plus
 * one of everything the M16–M20 arc added.
 *
 * Emulator only. It reaches Firestore through the rules-testing harness with
 * rules disabled, which cannot talk to a real project — there is no path from
 * here to production data.
 *
 * Sign in with any account against the Auth emulator, then open
 *   #/join/demo-circle/devtoken
 * to walk the real join flow (including the M17 questions) into the circle.
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

const GID = 'demo-circle';
const DAY = 86_400_000;
const now = Date.now();
const ago = (d) => new Date(now - d * DAY);
const ahead = (d) => new Date(now + d * DAY);

const PEOPLE = [
  ['n-rahman', 'Nadia Rahman', ['backend', 'ml'], ['rust']],
  ['mira-t', 'Mira Thomas', ['frontend', 'design'], ['three.js']],
  ['dev-anand', 'Dev Anand', ['backend'], ['kubernetes']],
  ['s-qureshi', 'Sana Qureshi', ['ml', 'feedback'], ['jax']],
  ['arjun-kv', 'Arjun K V', ['frontend'], ['svelte']],
  ['felix-w', 'Felix Wu', ['design', 'feedback'], ['figma variables']],
  ['tomas-b', 'Tomas Bergman', ['backend'], ['elixir']],
  ['yuki-n', 'Yuki Nakamura', ['ml'], ['pytorch']],
  ['omar-f', 'Omar Farouk', ['frontend', 'backend'], []],
  ['lena-k', 'Lena Kowalski', ['design'], ['motion']],
  ['priya-s', 'Priya Sharma', ['backend', 'feedback'], ['go']],
  ['jonas-e', 'Jonas Eriksen', ['frontend'], ['wasm']],
];

const REPOS = [
  [
    'atlas',
    'TypeScript',
    'n-rahman',
    'A map of every service we run, drawn from the code.',
    'frontend',
    9,
  ],
  ['tide', 'Python', 's-qureshi', 'Tidal prediction that runs on a phone, offline.', 'ml', 22],
  ['quarry', 'Rust', 'dev-anand', 'Pulls structured data out of very messy PDFs.', 'backend', 3],
  ['plume', 'TypeScript', 'mira-t', 'Writing tool that gets out of the way.', null, 1],
  ['ledger-lite', 'Go', 'priya-s', 'Double-entry bookkeeping as a library.', 'feedback', 14],
  ['sable', 'Swift', 'arjun-kv', 'A calmer camera app.', null, 40],
  ['kiln', 'Rust', 'tomas-b', 'Builds container images without a daemon.', 'backend', 5],
  ['orchard', 'Python', 'yuki-n', 'Small models, trained on one machine, properly.', 'ml', 2],
];

const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT ?? 'repocircle-3e9a6',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const { Timestamp, collection, doc, setDoc, writeBatch } = await import('firebase/firestore');
  const db = ctx.firestore();
  const ts = (d) => Timestamp.fromDate(d);
  const avatar = (login) => `https://avatars.githubusercontent.com/${login}`;

  await setDoc(doc(db, `groups/${GID}`), {
    name: 'Northside Build Club',
    description: 'Second-year CS and anyone who keeps shipping. Invite only.',
    visibility: 'private',
    createdBy: 'n-rahman',
    memberCount: PEOPLE.length,
    settings: { askTags: ['frontend', 'backend', 'ML', 'docs', 'devops'], defaultRole: 'member' },
    createdAt: ts(ago(120)),
    v: 1,
  });

  const batch = writeBatch(db);
  PEOPLE.forEach(([login, name, helpWith, learning], i) => {
    batch.set(doc(db, `groups/${GID}/members/${login}`), {
      role: i === 0 ? 'admin' : 'member',
      login,
      name,
      avatarUrl: avatar(login),
      availability: { status: i % 4 === 0 ? 'heads_down' : 'free' },
      helpWith,
      learning,
      domainTags: i % 3 === 0 ? ['web'] : ['ML', 'tooling'],
      checklist: { addedRepo: true, saidHelpWith: true },
      // The last three arrived this week, so "New in the circle" has content.
      joinedAt: ts(ago(i >= PEOPLE.length - 3 ? 2 : 40 + i)),
      joinedVia: i === 0 ? 'founder' : 'seed',
      v: 1,
    });
  });
  await batch.commit();

  // A live invite, so the join flow (and the M17 questions) can be walked.
  await setDoc(doc(db, `groups/${GID}/invites/devtoken`), {
    token: 'devtoken',
    role: 'member',
    expiresAt: ts(ahead(30)),
    revoked: false,
    createdBy: 'n-rahman',
    createdByLogin: 'n-rahman',
    groupName: 'Northside Build Club',
    groupDescription: 'Second-year CS and anyone who keeps shipping. Invite only.',
    memberCount: PEOPLE.length,
    repoCount: REPOS.length,
    createdAt: ts(ago(1)),
    label: 'local development',
    v: 1,
  });

  const repoBatch = writeBatch(db);
  REPOS.forEach(([nm, lang, owner, pitch, needs, lastDays], i) => {
    const daily = {};
    for (let d = 0; d < 8; d++) {
      const key = new Date(now - d * DAY).toISOString().slice(0, 10);
      daily[key] = {
        commits: (i + d) % 5,
        prsOpened: d % 3 === 0 ? 1 : 0,
        prsMerged: 0,
        issuesOpened: 0,
        releases: 0,
      };
    }
    repoBatch.set(doc(db, `groups/${GID}/repos/${1000 + i}`), {
      fullName: `northside/${nm}`,
      htmlUrl: `https://github.com/northside/${nm}`,
      description: pitch,
      language: lang,
      topics: [],
      githubOwnerLogin: owner,
      ownerUid: owner,
      registeredBy: owner,
      status: i === 5 ? 'paused' : 'building',
      demoUrl: null,
      archived: false,
      lastEventAt: ts(ago(lastDays)),
      poll: { lastPolledAt: ts(ago(0)), etag: null, failing: false },
      stats7d: { commits: 12, prsOpened: 2, prsMerged: 1, issues: 0, releases: 0 },
      daily,
      pitch,
      needs,
      // Longest-waiting first is the point of M18, so stagger these.
      needsSince: needs ? ts(ago(3 + i * 6)) : null,
      domainTags: ['tooling'],
      seekingOwner: i === 7,
      ownerLeft: i === 7,
      interestCount: i % 3,
      commentCount: i === 0 ? 2 : 0,
      // Two were registered this week, so "New this week" has content.
      createdAt: ts(ago(i < 2 ? 3 : 60 + i)),
      v: 1,
    });
  });
  await repoBatch.commit();

  await setDoc(doc(db, `groups/${GID}/repos/1000/comments/c1`), {
    authorUid: 'mira-t',
    authorLogin: 'mira-t',
    authorAvatarUrl: avatar('mira-t'),
    body: 'The service graph is the good bit. Could it group by team?',
    parentId: null,
    mentions: [],
    repoRefs: [],
    pinned: false,
    gid: GID,
    createdAt: ts(ago(1)),
    v: 1,
  });

  const asks = [
    ['ask', 'Postgres connection pool keeps saturating under load', 'open', 11],
    ['stuck', 'Vite build fails only in CI, never locally', 'open', 6],
    ['ask', 'Anyone done OAuth device flow in Rust?', 'claimed', 2],
    ['ask', 'Reviewing my first ML pipeline — sanity check?', 'resolved', 4],
  ];
  const askBatch = writeBatch(db);
  asks.forEach(([kind, title, state, days], i) => {
    askBatch.set(doc(db, `groups/${GID}/asks/a${i}`), {
      kind,
      title,
      detail: 'Seeded for local development.',
      tags: ['backend'],
      authorUid: PEOPLE[(i + 1) % PEOPLE.length][0],
      authorLogin: PEOPLE[(i + 1) % PEOPLE.length][0],
      authorAvatarUrl: avatar(PEOPLE[(i + 1) % PEOPLE.length][0]),
      state,
      claimCount: state === 'claimed' ? 1 : 0,
      claimerUids: state === 'claimed' ? ['dev-anand'] : [],
      createdAt: ts(ago(days)),
      ...(state === 'resolved'
        ? { resolvedAt: ts(ago(1)), resolvedWithUid: 'priya-s', resolvedWithLogin: 'priya-s' }
        : {}),
      v: 1,
    });
  });
  await askBatch.commit();

  const ideaBatch = writeBatch(db);
  [
    ['A shared changelog for everything the club ships', 'frontend', 'open'],
    ['Reading group tracker that nobody has to maintain', 'anything', 'open'],
    ['Seat finder for the lab, from the door sensor data', null, 'germinated'],
  ].forEach(([title, needs, state], i) => {
    ideaBatch.set(doc(db, `groups/${GID}/ideas/i${i}`), {
      title,
      pitch: title,
      detail: 'Seeded for local development.',
      domainTags: ['web'],
      needs,
      authorUid: PEOPLE[i + 2][0],
      authorLogin: PEOPLE[i + 2][0],
      authorAvatarUrl: avatar(PEOPLE[i + 2][0]),
      state,
      interestCount: i,
      commentCount: 0,
      createdAt: ts(ago(4 + i)),
      ...(state === 'germinated' ? { repoId: '1000', repoFullName: 'northside/atlas' } : {}),
      v: 1,
    });
  });
  await ideaBatch.commit();

  await setDoc(doc(db, `groups/${GID}/collabRequests/cr1`), {
    repoId: '1000',
    repoFullName: 'northside/atlas',
    requesterUid: 'mira-t',
    requesterLogin: 'mira-t',
    note: 'Happy to take the graph view.',
    repoOwnerUid: 'n-rahman',
    githubIssueNumber: 4,
    state: 'accepted',
    decidedBy: 'n-rahman',
    decidedAt: ts(ago(2)),
    createdAt: ts(ago(5)),
    v: 1,
  });

  await setDoc(doc(db, `groups/${GID}/sessions/s1`), {
    title: 'Saturday build session',
    detail: 'Bring whatever state it is in. Room 2.14, or the call link.',
    startsAt: ts(ahead(2)),
    durationMin: 180,
    url: 'https://meet.example.com/northside',
    hostUid: 'dev-anand',
    hostLogin: 'dev-anand',
    hostAvatarUrl: avatar('dev-anand'),
    cancelled: false,
    rsvpCount: 2,
    createdAt: ts(ago(1)),
    v: 1,
  });
  for (const who of ['mira-t', 'arjun-kv']) {
    await setDoc(doc(db, `groups/${GID}/sessions/s1/interests/${who}`), {
      login: who,
      avatarUrl: avatar(who),
      gid: GID,
      repoOwnerUid: 'dev-anand',
      createdAt: ts(ago(0)),
      v: 1,
    });
  }

  await setDoc(doc(db, `groups/${GID}/polls/p1`), {
    question: 'What should the next workshop cover?',
    options: {
      o0: { label: 'Writing a language server', count: 3 },
      o1: { label: 'Profiling and flame graphs', count: 5 },
      o2: { label: 'Postgres query planning', count: 2 },
    },
    authorUid: 'n-rahman',
    authorLogin: 'n-rahman',
    authorAvatarUrl: avatar('n-rahman'),
    state: 'open',
    createdAt: ts(ago(2)),
    v: 1,
  });

  await setDoc(doc(db, `groups/${GID}/announcements/an1`), {
    body: 'Demo night is the 19th, 6pm, room 2.14. Five minutes each, whatever state it is in.',
    authorUid: 'n-rahman',
    authorLogin: 'n-rahman',
    authorAvatarUrl: avatar('n-rahman'),
    createdAt: ts(ago(1)),
    v: 1,
  });

  await setDoc(doc(db, `groups/${GID}/meta/summary`), {
    memberCount: PEOPLE.length,
    repoCount: REPOS.length,
    openAskCount: 3,
    links: [
      { label: 'Club Discord', url: 'https://discord.gg/example' },
      { label: 'How we work', url: 'https://example.dev/handbook' },
    ],
    pinnedRepoId: '1000',
    v: 1,
  });

  // Referenced so the linter sees the import used even if a branch is removed.
  void collection;
});

await env.cleanup();
console.info(
  `Seeded ${GID}: ${PEOPLE.length} members, ${REPOS.length} repos, asks, ideas, a session, a poll and an announcement.\n` +
    'Sign in against the Auth emulator, then open #/join/demo-circle/devtoken',
);
