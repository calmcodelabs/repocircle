import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { buildJourney } from '../../src/util/journey';
import type { Repo, RepoInterest } from '../../src/data/types';
import type { CollabRequest } from '../../src/data/collabs';

const t = (ms: number) => Timestamp.fromMillis(ms);

function repo(over: Partial<Repo> = {}): Repo {
  return {
    id: '1',
    fullName: 'ana/voice-notes',
    htmlUrl: 'https://github.com/ana/voice-notes',
    description: null,
    language: 'TypeScript',
    topics: [],
    githubOwnerLogin: 'ana',
    ownerUid: 'ana',
    registeredBy: 'ana',
    status: 'building',
    demoUrl: null,
    archived: false,
    lastEventAt: null,
    poll: { lastPolledAt: null, etag: null, failing: false },
    stats7d: { commits: 0, prsOpened: 0, prsMerged: 0, issues: 0, releases: 0 },
    createdAt: t(100),
    v: 1,
    ...over,
  };
}

function interest(login: string, ms: number): RepoInterest {
  return { uid: login, login, avatarUrl: '', createdAt: t(ms) };
}

function collab(
  login: string,
  ms: number,
  state: CollabRequest['state'] = 'accepted',
): CollabRequest {
  return {
    id: login,
    repoId: '1',
    repoFullName: 'ana/voice-notes',
    requesterUid: login,
    requesterLogin: login,
    note: '',
    repoOwnerUid: 'ana',
    state,
    decidedAt: t(ms),
    createdAt: t(ms - 1),
  };
}

describe('buildJourney', () => {
  it('orders started → interest → joined chronologically', () => {
    const j = buildJourney(repo(), [interest('bo', 200)], [collab('bo', 300)], []);
    expect(j.map((m) => m.kind)).toEqual(['started', 'interest', 'joined']);
    expect(j[0]?.text).toBe('started by @ana');
    expect(j[2]?.text).toBe('@bo joined');
  });

  it('ignores non-accepted collabs', () => {
    const j = buildJourney(repo(), [], [collab('bo', 300, 'declined')], []);
    expect(j.map((m) => m.kind)).toEqual(['started']);
  });

  it('collapses interest overflow into a count', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((l, i) => interest(l, 200 + i));
    const j = buildJourney(repo(), many, [], []);
    expect(j.filter((m) => m.kind === 'interest')).toHaveLength(5);
    expect(j.some((m) => m.text === '2 more raised a hand')).toBe(true);
  });

  it('adoption shows and credits the starter', () => {
    const j = buildJourney(
      repo({
        adoptedByLogin: 'bo',
        adoptedByUid: 'bo',
        adoptedFromLogin: 'ana',
        adoptedAt: t(400),
      }),
      [],
      [],
      [],
    );
    expect(j.map((m) => m.kind)).toEqual(['started', 'adopted']);
    expect(j[0]?.text).toBe('started by @ana');
    expect(j[1]?.text).toBe('taken over by @bo');
  });

  it('uses the oldest release in the window', () => {
    const j = buildJourney(
      repo(),
      [],
      [],
      [
        { occurredAt: t(900), summary: 'released v0.2' },
        { occurredAt: t(500), summary: 'released v0.1' },
      ],
    );
    expect(j.filter((m) => m.kind === 'release')).toHaveLength(1);
    expect(j.at(-1)?.text).toBe('released v0.1');
  });
});

describe('idea origin (M15)', () => {
  it('opens the story with the idea chapter, chronological', () => {
    const j = buildJourney(repo({ createdAt: t(300) }), [], [], [], 4, {
      authorLogin: 'dana',
      createdAt: t(100),
      germinatedAt: t(200),
    });
    expect(j.map((m) => m.kind)).toEqual(['idea', 'germinated', 'started']);
    expect(j[0]?.text).toBe('born as an idea by @dana');
    expect(j[1]?.text).toBe('the idea became this repo');
  });

  it('does not claim birth when the repo predates the idea', () => {
    // Linking an existing repo to a later idea: "born" would be a lie, and the
    // timeline would read as starting before being born.
    const j = buildJourney(repo({ createdAt: t(100) }), [], [], [], 4, {
      authorLogin: 'dana',
      createdAt: t(300),
      germinatedAt: t(400),
    });
    expect(j.map((m) => m.kind)).toEqual(['started', 'idea', 'germinated']);
    expect(j[1]?.text).toBe('@dana pitched the idea behind this');
    expect(j[2]?.text).toBe('the idea was linked here');
  });
  it('no idea → unchanged story', () => {
    const j = buildJourney(repo(), [], [], []);
    expect(j[0]?.kind).toBe('started');
  });
});
