import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_LAYERS,
  ENFORCED_LAYERS,
  FEATURES,
  KNOWN_GAPS,
  RULES_BLOCKS_EXEMPT,
  type Layer,
} from '../registry/features.ts';
import {
  REPO_ROOT,
  claimedRulesBlocks,
  claimedSrcFiles,
  coverageByFeature,
  rulesMatchBlocks,
  scanAllTests,
  srcFiles,
} from '../registry/scan.ts';

/**
 * The completeness gates (TESTING.md §1). These are what turn "every feature is
 * tested" from a claim into a build failure: add a source file or a rules match
 * block without claiming it in the registry and this suite goes red.
 */
describe('[infrastructure] feature registry integrity', () => {
  it('feature ids are unique and well-formed', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('every file a feature claims actually exists', () => {
    const missing: string[] = [];
    for (const f of FEATURES) {
      for (const file of f.files) {
        if (!existsSync(join(REPO_ROOT, 'src', file))) missing.push(`${f.id} -> src/${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('declared layers are real layers', () => {
    for (const f of FEATURES) {
      for (const l of f.layers) expect(ALL_LAYERS).toContain(l);
    }
  });

  it('exemptions name a layer the feature actually declares', () => {
    for (const f of FEATURES) {
      for (const layer of Object.keys(f.exemptions ?? {}) as Layer[]) {
        expect(f.layers, `${f.id} exempts a layer it does not declare`).toContain(layer);
      }
    }
  });
});

describe('[infrastructure] every source file is claimed by a feature', () => {
  it('leaves nothing under src/ unaccounted for', () => {
    const claimed = claimedSrcFiles();
    const unclaimed = srcFiles().filter((f) => !claimed.has(f));
    expect(
      unclaimed,
      'Add these to a feature in test/registry/features.ts (or the infrastructure bucket)',
    ).toEqual([]);
  });

  it('claims no file that has been deleted', () => {
    const actual = new Set(srcFiles());
    const stale = [...claimedSrcFiles()].filter((f) => !actual.has(f));
    expect(stale, 'Registry claims files that no longer exist').toEqual([]);
  });
});

describe('[infrastructure] every rules match block is claimed by a feature', () => {
  it('parses the rules file into the expected block set', () => {
    const blocks = rulesMatchBlocks();
    // Sanity: the parser must find the nested blocks, not just top-level ones.
    expect(blocks).toContain('/groups/{gid}/asks/{askId}/claims/{uid}');
    expect(blocks).toContain('/groups/{gid}/repos/{repoId}/activityDaily/{day}');
    expect(blocks).toContain('/{path=**}/comments/{commentId}');
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it('leaves no match block unaccounted for', () => {
    const claimed = claimedRulesBlocks();
    const unclaimed = rulesMatchBlocks().filter(
      (b) => !claimed.has(b) && !RULES_BLOCKS_EXEMPT.includes(b),
    );
    expect(unclaimed, 'Claim these in test/registry/features.ts rulesBlocks').toEqual([]);
  });

  it('claims no match block that no longer exists', () => {
    const actual = new Set(rulesMatchBlocks());
    const stale = [...claimedRulesBlocks()].filter((b) => !actual.has(b));
    expect(stale, 'Registry claims rules blocks that are gone').toEqual([]);
  });
});

describe('[infrastructure] every test is tagged with a known feature', () => {
  const scanned = scanAllTests();

  it('finds test files to scan', () => {
    expect(scanned.length).toBeGreaterThan(0);
  });

  it('every test file lives in a known layer directory', () => {
    const orphans = scanned.filter((s) => s.layer === null).map((s) => s.file);
    expect(orphans, 'Test files must live under a directory in LAYER_DIRS').toEqual([]);
  });

  it('every top-level describe carries a [feature] tag', () => {
    const offenders = scanned
      .filter((s) => s.untaggedTopLevel.length > 0)
      .map((s) => `${s.file}: ${s.untaggedTopLevel.join(' | ')}`);
    expect(offenders, 'Prefix each describe title with [feature-slug]').toEqual([]);
  });

  it('every tag resolves to a registry feature', () => {
    const known = new Set(FEATURES.map((f) => f.id));
    const unknown: string[] = [];
    for (const s of scanned) {
      for (const t of s.tags) if (!known.has(t)) unknown.push(`${s.file}: [${t}]`);
    }
    expect(unknown, 'Tag names a feature that is not in the registry').toEqual([]);
  });
});

describe('[infrastructure] enforced layers do not regress', () => {
  const coverage = coverageByFeature();
  const gapKey = (id: string, layer: Layer) => `${id}:${layer}`;
  const known = new Set(KNOWN_GAPS.map(([id, l]) => gapKey(id, l)));

  const declaredGaps = FEATURES.flatMap((f) =>
    f.layers
      .filter((l) => ENFORCED_LAYERS.includes(l))
      .filter((l) => !f.exemptions?.[l] && !coverage.get(f.id)?.has(l))
      .map((l) => gapKey(f.id, l)),
  );

  it('introduces no new gap in an enforced layer', () => {
    const fresh = declaredGaps.filter((g) => !known.has(g));
    expect(
      fresh,
      'Write the test, or add the pair to KNOWN_GAPS with the milestone that closes it',
    ).toEqual([]);
  });

  it('KNOWN_GAPS contains nothing that is now covered', () => {
    const closed = [...known].filter((g) => !declaredGaps.includes(g));
    expect(closed, 'These gaps are closed — delete them from KNOWN_GAPS').toEqual([]);
  });

  it('KNOWN_GAPS only names enforced layers of features that declare them', () => {
    const bad: string[] = [];
    for (const [id, layer] of KNOWN_GAPS) {
      const f = FEATURES.find((x) => x.id === id);
      if (!f) bad.push(`${id}: unknown feature`);
      else if (!f.layers.includes(layer)) bad.push(`${id}: does not declare ${layer}`);
      if (!ENFORCED_LAYERS.includes(layer)) bad.push(`${id}: ${layer} is not enforced`);
    }
    expect(bad).toEqual([]);
  });

  it('reports the outstanding backlog in the unenforced layers', () => {
    // Not a failure: this is the T2..T5 to-do list, surfaced in run output so
    // it is visible without opening the generated report.
    const pending = ALL_LAYERS.filter((l) => !ENFORCED_LAYERS.includes(l));
    const outstanding = FEATURES.flatMap((f) =>
      f.layers
        .filter((l) => pending.includes(l) && !coverage.get(f.id)?.has(l))
        .map((l) => gapKey(f.id, l)),
    );
    console.info(`[registry] ${outstanding.length} feature/layer pairs still to build`);
    expect(Array.isArray(outstanding)).toBe(true);
  });
});
