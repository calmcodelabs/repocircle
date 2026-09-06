import { describe, expect, it } from 'vitest';
import { circleOwner, languageEvidence, ownsRepo, suggestHelpWith } from '../../src/util/skills';
import type { Repo } from '../../src/data/types';

function repo(over: Partial<Repo>): Repo {
  return {
    id: '1',
    fullName: 'x/y',
    htmlUrl: 'https://github.com/x/y',
    description: null,
    language: null,
    topics: [],
    githubOwnerLogin: 'x',
    ownerUid: null,
    registeredBy: 'u1',
    status: 'building',
    demoUrl: null,
    archived: false,
    lastEventAt: null,
    poll: { lastPolledAt: null, etag: null, failing: false },
    stats7d: { commits: 0, prsOpened: 0, prsMerged: 0, issues: 0, releases: 0 },
    createdAt: null,
    v: 1,
    ...over,
  };
}

describe('[skills-matcher] ownsRepo', () => {
  it('matches by ownerUid', () => {
    expect(ownsRepo(repo({ ownerUid: 'u9' }), { uid: 'u9', login: 'other' })).toBe(true);
  });
  it('matches by login case-insensitively', () => {
    expect(ownsRepo(repo({ githubOwnerLogin: 'ShAsH' }), { uid: 'nope', login: 'shash' })).toBe(
      true,
    );
  });
  it('rejects a stranger', () => {
    expect(
      ownsRepo(repo({ githubOwnerLogin: 'a', ownerUid: 'u1' }), { uid: 'u2', login: 'b' }),
    ).toBe(false);
  });
});

describe('[skills-matcher] languageEvidence', () => {
  it('counts and sorts by use, ties alphabetical', () => {
    const ev = languageEvidence([
      repo({ language: 'Python' }),
      repo({ language: 'Python' }),
      repo({ language: 'Rust' }),
      repo({ language: 'Go' }),
      repo({ language: null }),
    ]);
    expect(ev).toEqual([
      { language: 'Python', repos: 2 },
      { language: 'Go', repos: 1 },
      { language: 'Rust', repos: 1 },
    ]);
  });
  it('empty input → empty evidence', () => {
    expect(languageEvidence([])).toEqual([]);
  });
});

describe('[skills-matcher] suggestHelpWith', () => {
  it('maps languages to areas, deduped, in evidence order', () => {
    const ev = languageEvidence([
      repo({ language: 'TypeScript' }),
      repo({ language: 'TypeScript' }),
      repo({ language: 'Python' }),
      repo({ language: 'Svelte' }),
    ]);
    expect(suggestHelpWith(ev)).toEqual(['frontend', 'backend', 'ml']);
  });
  it('unknown languages suggest nothing', () => {
    expect(suggestHelpWith(languageEvidence([repo({ language: 'COBOL' })]))).toEqual([]);
  });
  it('never suggests design or feedback', () => {
    const all = suggestHelpWith(
      languageEvidence([
        repo({ language: 'TypeScript' }),
        repo({ language: 'Python' }),
        repo({ language: 'C++' }),
      ]),
    );
    expect(all).not.toContain('design');
    expect(all).not.toContain('feedback');
  });
});

describe('[skills-matcher] circleOwner', () => {
  const members = [
    { uid: 'u-new', login: 'newowner' },
    { uid: 'u-auth', login: 'GithubAuthor' },
  ];
  it('prefers in-app ownership over the GitHub login', () => {
    const r = repo({ ownerUid: 'u-new', githubOwnerLogin: 'githubauthor' });
    expect(circleOwner(r, members)?.uid).toBe('u-new');
  });
  it('falls back to the GitHub author when no uid matches', () => {
    const r = repo({ ownerUid: 'gone', githubOwnerLogin: 'GITHUBAUTHOR' });
    expect(circleOwner(r, members)?.uid).toBe('u-auth');
  });
  it('undefined when nobody in the circle owns it', () => {
    const r = repo({ ownerUid: 'gone', githubOwnerLogin: 'stranger' });
    expect(circleOwner(r, members)).toBeUndefined();
  });
});
