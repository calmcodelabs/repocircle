import { describe, expect, it } from 'vitest';
import { pruneDecision } from '../../src/data/watches';

// Class A: only a provable not-exists deletes; ambiguity hides, never prunes.
describe('pruneDecision', () => {
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
