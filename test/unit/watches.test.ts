import { describe, expect, it } from 'vitest';
import {
  pruneDecision,
  savableAsk,
  savableIdea,
  savableRepo,
  watchHref,
  watchId,
  watchPath,
} from '../../src/data/watches';

// Class A: only a provable not-exists deletes; ambiguity hides, never prunes.
describe('[watches] pruneDecision', () => {
  it('prunes only on a successful read that finds nothing', () => {
    expect(pruneDecision({ ok: true, exists: false }, true)).toBe('prune');
    expect(pruneDecision({ ok: true, exists: false }, false)).toBe('prune');
  });
  it('a failed read never deletes, whatever the mirror says', () => {
    expect(pruneDecision({ ok: false, exists: false }, false)).toBe('hide');
    expect(pruneDecision({ ok: false, exists: false }, true)).toBe('hide');
  });
  it('a readable repo outside the mirror hides but survives', () => {
    expect(pruneDecision({ ok: true, exists: true }, false)).toBe('hide');
  });
  it('a readable repo in the mirror shows', () => {
    expect(pruneDecision({ ok: true, exists: true }, true)).toBe('keep');
  });
});

// M18 — saved things widened beyond repos.
describe('[watches] watchId', () => {
  it('keeps the original two-part id for repos so old saves still resolve', () => {
    expect(watchId('g1', 'repo', '42')).toBe('g1_42');
  });

  it('namespaces the other kinds', () => {
    expect(watchId('g1', 'ask', 'a1')).toBe('g1_ask_a1');
    expect(watchId('g1', 'idea', 'i1')).toBe('g1_idea_i1');
  });
});

describe('[watches] watchPath and watchHref', () => {
  it('point at the right collection per kind', () => {
    expect(watchPath({ gid: 'g1', kind: 'repo', itemId: '42' })).toBe('groups/g1/repos/42');
    expect(watchPath({ gid: 'g1', kind: 'ask', itemId: 'a1' })).toBe('groups/g1/asks/a1');
    expect(watchPath({ gid: 'g1', kind: 'idea', itemId: 'i1' })).toBe('groups/g1/ideas/i1');
  });

  it('route to the right screen per kind', () => {
    expect(watchHref({ gid: 'g1', kind: 'repo', itemId: '42' })).toBe('#/g/g1/repo/42');
    expect(watchHref({ gid: 'g1', kind: 'ask', itemId: 'a1' })).toBe('#/g/g1/ask/a1');
    expect(watchHref({ gid: 'g1', kind: 'idea', itemId: 'i1' })).toBe('#/g/g1/idea/i1');
  });
});

describe('[watches] savable builders', () => {
  it('title a repo by its full name and the others by their title', () => {
    expect(savableRepo({ id: '1', fullName: 'a/b' })).toEqual({
      kind: 'repo',
      id: '1',
      title: 'a/b',
    });
    expect(savableAsk({ id: '2', title: 'help' }).kind).toBe('ask');
    expect(savableIdea({ id: '3', title: 'notion for cats' }).kind).toBe('idea');
  });
});
