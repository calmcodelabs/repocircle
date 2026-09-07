import { describe, expect, it } from 'vitest';
import { CIRCLE_SHAPE, SWEPT_SEPARATELY } from '../../src/data/deleteGroup';
import { rulesMatchBlocks } from '../registry/scan.ts';

/**
 * The delete sweep must know the shape of a circle.
 *
 * Firestore does not cascade, so deleting a circle means naming every
 * collection and every subcollection explicitly. That list was wrong for three
 * milestones — it predated ideas, announcements, sessions and polls, and each
 * shipped without anyone touching deleteGroup.ts — so deleting a circle left
 * them orphaned: unreachable, because the group document and every membership
 * were gone, but still stored.
 *
 * A comment asking the next person to remember would not have worked; nothing
 * in the codebase connected the two files. This does: firestore.rules already
 * describes the shape of a circle exactly, because every collection needs a
 * match block to be writable at all. Deriving the expected shape from the rules
 * makes the build fail the moment a new collection exists and the sweep does
 * not know about it.
 */

type Shape = Map<string, Set<string>>;

/** The circle's shape as firestore.rules describes it. */
function shapeFromRules(): Shape {
  const shape: Shape = new Map();
  for (const block of rulesMatchBlocks()) {
    // /groups/{gid}/repos/{repoId}/comments/{commentId} -> repos, comments
    const m = /^\/groups\/\{gid\}\/([a-zA-Z]+)\/\{[^}]+\}(?:\/([a-zA-Z]+)\/\{[^}]+\})?$/.exec(
      block,
    );
    if (!m) continue;
    const [, parent, child] = m;
    if (!parent) continue;
    if (!shape.has(parent)) shape.set(parent, new Set());
    if (child) shape.get(parent)!.add(child);
  }
  return shape;
}

describe('[group-delete] the sweep covers the whole circle', () => {
  const shape = shapeFromRules();
  const handled = new Set([...Object.keys(CIRCLE_SHAPE), ...SWEPT_SEPARATELY]);

  it('reads a plausible shape out of the rules', () => {
    // Guard the derivation itself: a regex that silently matched nothing would
    // make every assertion below vacuously true.
    expect(shape.size).toBeGreaterThan(8);
    expect([...shape.keys()]).toContain('repos');
    expect([...(shape.get('repos') ?? [])]).toContain('events');
  });

  it('sweeps every collection a circle can contain', () => {
    const missed = [...shape.keys()].filter((name) => !handled.has(name));
    expect(
      missed,
      'These collections exist in firestore.rules but deleteGroupEverything would leave them behind',
    ).toEqual([]);
  });

  it('sweeps every subcollection of every collection', () => {
    const missed: string[] = [];
    for (const [parent, children] of shape) {
      const known = new Set(CIRCLE_SHAPE[parent] ?? []);
      for (const child of children) {
        if (!known.has(child)) missed.push(`${parent}/{id}/${child}`);
      }
    }
    expect(
      missed,
      'Firestore does not cascade — these would survive their parent document',
    ).toEqual([]);
  });

  it('claims no collection that the rules do not describe', () => {
    // The reverse direction: a stale entry means the sweep spends reads on a
    // collection that no longer exists, and quietly suggests the list is
    // maintained when it is not.
    const stale = Object.keys(CIRCLE_SHAPE).filter((name) => !shape.has(name));
    expect(stale, 'CIRCLE_SHAPE names collections with no match block').toEqual([]);
  });

  it('claims no subcollection that the rules do not describe', () => {
    const stale: string[] = [];
    for (const [parent, children] of Object.entries(CIRCLE_SHAPE)) {
      const real = shape.get(parent) ?? new Set<string>();
      for (const child of children) {
        if (!real.has(child)) stale.push(`${parent}/{id}/${child}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('handles members separately, and says so', () => {
    // Members cannot ride along with the rest: the caller's own membership has
    // to outlive every rule check that needs it, so it is swept last.
    expect(SWEPT_SEPARATELY).toContain('members');
    expect(Object.keys(CIRCLE_SHAPE)).not.toContain('members');
  });
});
