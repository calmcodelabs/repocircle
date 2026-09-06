import { describe, it, expect } from 'vitest';
import { parseRepoRef } from '../../src/util/repoRef';

describe('[mentions] parseRepoRef', () => {
  it('parses bare owner/name', () => {
    expect(parseRepoRef('calmcodelabs/score-keeper')).toEqual({
      owner: 'calmcodelabs',
      name: 'score-keeper',
    });
  });
  it('parses github URLs in common shapes', () => {
    expect(parseRepoRef('https://github.com/a/b')).toEqual({ owner: 'a', name: 'b' });
    expect(parseRepoRef('http://www.github.com/a/b/')).toEqual({ owner: 'a', name: 'b' });
    expect(parseRepoRef('github.com/a/b.git')).toEqual({ owner: 'a', name: 'b' });
    expect(parseRepoRef('https://github.com/a/b/tree/main/src')).toEqual({ owner: 'a', name: 'b' });
    expect(parseRepoRef('  https://github.com/a/b?tab=readme  ')).toEqual({
      owner: 'a',
      name: 'b',
    });
  });
  it('rejects junk', () => {
    expect(parseRepoRef('')).toBeNull();
    expect(parseRepoRef('justoneword')).toBeNull();
    expect(parseRepoRef('https://gitlab.com/a/b')).toBeNull();
    expect(parseRepoRef('a/b/c')).toBeNull();
    expect(parseRepoRef('.hidden/repo')).toBeNull();
  });
});
