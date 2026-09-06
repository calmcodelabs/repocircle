import { describe, it, expect } from 'vitest';
import {
  dropById,
  prependAllCapped,
  prependCapped,
  pruneOlderThan,
} from '../../src/util/summaryLists';

type Item = { id: string; at?: { toMillis: () => number } | null };
const idOf = (i: Item) => i.id;
const ts = (ms: number) => ({ toMillis: () => ms });

describe('prependCapped', () => {
  it('puts the newest entry first', () => {
    expect(prependCapped([{ id: 'a' }], { id: 'b' }, idOf, 5).map(idOf)).toEqual(['b', 'a']);
  });

  it('starts from nothing', () => {
    expect(prependCapped(undefined, { id: 'a' }, idOf, 5).map(idOf)).toEqual(['a']);
  });

  it('moves an existing subject to the front instead of duplicating it', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(prependCapped(list, { id: 'c' }, idOf, 5).map(idOf)).toEqual(['c', 'a', 'b']);
  });

  it('trims to the cap, dropping the oldest', () => {
    const list = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    expect(prependCapped(list, { id: 'd' }, idOf, 3).map(idOf)).toEqual(['d', 'c', 'b']);
  });

  it('never exceeds the cap even when the input already did', () => {
    const list = Array.from({ length: 9 }, (_, i) => ({ id: `u${i}` }));
    expect(prependCapped(list, { id: 'new' }, idOf, 8)).toHaveLength(8);
  });
});

describe('prependAllCapped', () => {
  it('keeps the given order at the front', () => {
    const out = prependAllCapped([{ id: 'x' }], [{ id: 'a' }, { id: 'b' }], idOf, 5);
    expect(out.map(idOf)).toEqual(['a', 'b', 'x']);
  });

  it('caps a batch larger than the cap', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));
    const out = prependAllCapped([], many, idOf, 6);
    expect(out).toHaveLength(6);
    expect(out.map(idOf)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('is a no-op for an empty batch', () => {
    expect(prependAllCapped([{ id: 'a' }], [], idOf, 5).map(idOf)).toEqual(['a']);
  });
});

describe('dropById', () => {
  it('removes the matching entry', () => {
    expect(dropById([{ id: 'a' }, { id: 'b' }], 'a', idOf).map(idOf)).toEqual(['b']);
  });

  it('leaves the list alone when nothing matches', () => {
    expect(dropById([{ id: 'a' }], 'zz', idOf).map(idOf)).toEqual(['a']);
  });

  it('tolerates a missing list', () => {
    expect(dropById(undefined, 'a', idOf)).toEqual([]);
  });
});

describe('pruneOlderThan', () => {
  const now = 1_000_000_000;
  const week = 7 * 86_400_000;
  const atOf = (i: Item) => i.at;

  it('keeps entries inside the window', () => {
    const list: Item[] = [{ id: 'fresh', at: ts(now - 86_400_000) }];
    expect(pruneOlderThan(list, atOf, week, now).map(idOf)).toEqual(['fresh']);
  });

  it('drops entries past it', () => {
    const list: Item[] = [
      { id: 'old', at: ts(now - week - 1) },
      { id: 'fresh', at: ts(now) },
    ];
    expect(pruneOlderThan(list, atOf, week, now).map(idOf)).toEqual(['fresh']);
  });

  it('keeps an entry exactly on the boundary', () => {
    const list: Item[] = [{ id: 'edge', at: ts(now - week) }];
    expect(pruneOlderThan(list, atOf, week, now).map(idOf)).toEqual(['edge']);
  });

  // Class A: an undatable entry is not evidence of staleness, so it survives.
  it('keeps an entry that carries no timestamp', () => {
    const list: Item[] = [{ id: 'undated' }, { id: 'null-dated', at: null }];
    expect(pruneOlderThan(list, atOf, week, now).map(idOf)).toEqual(['undated', 'null-dated']);
  });
});
