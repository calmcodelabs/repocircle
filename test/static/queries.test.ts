import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, srcFiles } from '../registry/scan.ts';
import {
  QUERIES,
  isArray,
  isEquality,
  needsCompositeIndex,
  type QuerySpec,
} from '../registry/queries.ts';

type IndexField = { fieldPath: string; order?: string; arrayConfig?: string };
type IndexDef = { collectionGroup: string; queryScope: string; fields: IndexField[] };

const indexes: IndexDef[] = JSON.parse(
  readFileSync(join(REPO_ROOT, 'firestore.indexes.json'), 'utf8'),
).indexes;

/**
 * Can this declared index serve this query?
 *
 * Firestore serves a query from an index whose leading fields are exactly the
 * query's equality and array-contains fields (in any order), followed by the
 * range/orderBy fields in order. A longer index still serves a shorter query
 * when the extra fields come after — that is the prefix rule, which is how
 * `authorUid, state, createdAt` covers `authorUid == x AND state in [...]`.
 */
function indexServes(index: IndexDef, q: QuerySpec): boolean {
  if (index.collectionGroup !== q.collection) return false;
  if (index.queryScope !== q.scope) return false;

  const eqFields = q.filters.filter((f) => isEquality(f.op) || isArray(f.op)).map((f) => f.field);
  const tail = [
    ...q.filters.filter((f) => !isEquality(f.op) && !isArray(f.op)).map((f) => f.field),
    ...q.orderBy.map((o) => o.field),
  ];
  const ordered = [...new Set(tail)];

  const head = index.fields.slice(0, eqFields.length).map((f) => f.fieldPath);
  if (head.length !== eqFields.length) return false;
  if ([...head].sort().join(',') !== [...eqFields].sort().join(',')) return false;

  const rest = index.fields.slice(eqFields.length).map((f) => f.fieldPath);
  return ordered.every((f, i) => rest[i] === f);
}

describe('[infrastructure] every composite query has an index', () => {
  const needing = QUERIES.filter(needsCompositeIndex);

  it('finds queries that need composite indexes', () => {
    expect(needing.length).toBeGreaterThan(10);
  });

  it('each one is served by a declared index', () => {
    const uncovered = needing
      .filter((q) => !q.unverified)
      .filter((q) => !indexes.some((i) => indexServes(i, q)))
      .map((q) => `${q.site} — ${q.collection}(${q.scope}) ${describeQuery(q)}`);
    expect(
      uncovered,
      'Add an index to firestore.indexes.json, or record why it is unnecessary in the manifest',
    ).toEqual([]);
  });

  it('reports queries suspected to be missing an index', () => {
    // Not a failure: the emulator ignores indexes and production is the only
    // authority, so these are surfaced for a human to confirm rather than
    // guessed at by the build.
    const suspect = QUERIES.filter((q) => q.unverified);
    for (const q of suspect) {
      console.warn(`[queries] SUSPECTED MISSING INDEX ${q.site}: ${q.unverified}`);
    }
    expect(Array.isArray(suspect)).toBe(true);
  });
});

function describeQuery(q: QuerySpec): string {
  const f = q.filters.map((x) => `${x.field} ${x.op}`).join(' AND ');
  const o = q.orderBy.map((x) => `${x.field} ${x.dir}`).join(', ');
  return [f, o && `order by ${o}`].filter(Boolean).join(' ');
}

describe('[infrastructure] the query manifest matches the source', () => {
  /** Files that actually construct Firestore queries. */
  function queryCallsites(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const rel of srcFiles()) {
      const text = readFileSync(join(REPO_ROOT, 'src', rel), 'utf8');
      // `query(` as a call, not `subquery(` or a word ending in query.
      const n = [...text.matchAll(/(?<![A-Za-z_$.])query\(/g)].length;
      if (n > 0) counts.set(`src/${rel}`, n);
    }
    return counts;
  }

  const callsites = queryCallsites();

  it('every file constructing queries is represented in the manifest', () => {
    const manifestFiles = new Set(QUERIES.map((q) => q.site.split(':')[0]));
    const missing = [...callsites.keys()].filter((f) => !manifestFiles.has(f));
    expect(missing, 'These files build queries that the manifest does not list').toEqual([]);
  });

  it('the manifest names no file that has stopped building queries', () => {
    const stale = [...new Set(QUERIES.map((q) => q.site.split(':')[0]!))].filter(
      (f) => !callsites.has(f),
    );
    expect(stale).toEqual([]);
  });

  it('counts one manifest entry per query construction', () => {
    const perFile = new Map<string, number>();
    for (const q of QUERIES) {
      const f = q.site.split(':')[0]!;
      perFile.set(f, (perFile.get(f) ?? 0) + 1);
    }
    const mismatched: string[] = [];
    for (const [file, n] of callsites) {
      const listed = perFile.get(file) ?? 0;
      if (listed !== n) mismatched.push(`${file}: ${n} in source, ${listed} in manifest`);
    }
    expect(
      mismatched,
      'A query was added or removed without updating test/registry/queries.ts',
    ).toEqual([]);
  });
});

describe('[infrastructure] firestore.indexes.json stays deployable', () => {
  it('declares no single-field index', () => {
    // A single-field entry makes the WHOLE index deploy fail with a 400
    // ("this index is not necessary"). A range filter plus an orderBy on that
    // same field is covered by the automatic index — never declare it.
    const singles = indexes
      .filter((i) => i.fields.length < 2)
      .map((i) => `${i.collectionGroup}: ${i.fields.map((f) => f.fieldPath).join(',')}`);
    expect(singles, 'Single-field indexes 400 the entire deploy').toEqual([]);
  });

  it('declares no duplicate index', () => {
    const keys = indexes.map(
      (i) =>
        `${i.collectionGroup}|${i.queryScope}|${i.fields
          .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`)
          .join(',')}`,
    );
    expect(keys.length - new Set(keys).size).toBe(0);
  });

  it('every declared index is used by at least one manifest query', () => {
    const unused = indexes
      .filter((i) => !QUERIES.some((q) => indexServes(i, q)))
      .map((i) => `${i.collectionGroup}: ${i.fields.map((f) => f.fieldPath).join(',')}`);
    // Unused indexes are not fatal — they cost nothing but write amplification —
    // but they are usually the fossil of a query that changed shape.
    for (const u of unused) console.warn(`[queries] index not used by any listed query: ${u}`);
    expect(Array.isArray(unused)).toBe(true);
  });
});
