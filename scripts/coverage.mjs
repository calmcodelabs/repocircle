/**
 * Merge per-layer coverage and enforce the floor (TESTING.md §5).
 *
 * The layers cannot run in one pass — unit is node, integration needs the
 * emulators, component needs a browser — so each writes its own istanbul
 * report and this merges them. That merge is the point: "is this line covered
 * anywhere" is the only question worth asking, and a data module exercised by
 * an integration test is covered whether or not a unit test touches it.
 *
 * The floor is a no-regression baseline, the same shape as KNOWN_GAPS: coverage
 * may not drop below what is recorded, and when it rises the floor is expected
 * to be raised with it. A fixed 90% target would have failed from day one and
 * been switched off within a week; a ratchet that only moves up actually holds.
 *
 *   npm run coverage           # collect every layer, then merge and check
 *   node scripts/coverage.mjs  # merge and check what is already collected
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES } from '../test/registry/features.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COV_DIR = join(ROOT, 'reports', 'raw', 'coverage');
const FLOOR_PATH = join(ROOT, 'test', 'registry', 'coverage-floor.json');

/** Istanbul counter maps merge by summing hits for the same file and key. */
function mergeInto(target, source) {
  for (const [file, cov] of Object.entries(source)) {
    const existing = target[file];
    if (!existing) {
      target[file] = JSON.parse(JSON.stringify(cov));
      continue;
    }
    for (const key of ['s', 'f']) {
      for (const [id, hits] of Object.entries(cov[key] ?? {})) {
        existing[key][id] = (existing[key][id] ?? 0) + hits;
      }
    }
    for (const [id, arms] of Object.entries(cov.b ?? {})) {
      const mine = existing.b[id];
      if (!mine) {
        existing.b[id] = [...arms];
        continue;
      }
      arms.forEach((hits, i) => {
        mine[i] = (mine[i] ?? 0) + hits;
      });
    }
  }
  return target;
}

function collect() {
  if (!existsSync(COV_DIR)) return { merged: {}, layers: [] };
  const merged = {};
  const layers = [];
  for (const layer of readdirSync(COV_DIR)) {
    const file = join(COV_DIR, layer, 'coverage-final.json');
    if (!existsSync(file)) continue;
    layers.push(layer);
    mergeInto(merged, JSON.parse(readFileSync(file, 'utf8')));
  }
  return { merged, layers };
}

const pct = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

function fileStats(cov) {
  const statements = Object.values(cov.s ?? {});
  const functions = Object.values(cov.f ?? {});
  const branches = Object.values(cov.b ?? {}).flat();
  return {
    statements: { covered: statements.filter((n) => n > 0).length, total: statements.length },
    functions: { covered: functions.filter((n) => n > 0).length, total: functions.length },
    branches: { covered: branches.filter((n) => n > 0).length, total: branches.length },
  };
}

function summarise(merged) {
  const perFile = {};
  const totals = {
    statements: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
  };
  for (const [absPath, cov] of Object.entries(merged)) {
    const rel = relative(ROOT, cov.path ?? absPath).replace(/\\/g, '/');
    if (!rel.startsWith('src/')) continue;
    const stats = fileStats(cov);
    perFile[rel] = stats;
    for (const key of Object.keys(totals)) {
      totals[key].covered += stats[key].covered;
      totals[key].total += stats[key].total;
    }
  }
  return { perFile, totals };
}

/** Roll file coverage up to the features that claim those files. */
function byFeature(perFile) {
  const out = {};
  for (const f of FEATURES) {
    const acc = { statements: { covered: 0, total: 0 }, files: [] };
    for (const file of f.files) {
      const stats = perFile[`src/${file}`];
      if (!stats) continue;
      acc.statements.covered += stats.statements.covered;
      acc.statements.total += stats.statements.total;
      acc.files.push(`src/${file}`);
    }
    if (acc.files.length > 0) {
      out[f.id] = {
        pct: Number(pct(acc.statements.covered, acc.statements.total).toFixed(1)),
        ...acc.statements,
        files: acc.files.length,
      };
    }
  }
  return out;
}

const { merged, layers } = collect();
if (layers.length === 0) {
  console.error('No coverage collected. Run `npm run coverage` (or a coverage:* script) first.');
  process.exit(1);
}

const { perFile, totals } = summarise(merged);
const overall = {
  statements: Number(pct(totals.statements.covered, totals.statements.total).toFixed(2)),
  functions: Number(pct(totals.functions.covered, totals.functions.total).toFixed(2)),
  branches: Number(pct(totals.branches.covered, totals.branches.total).toFixed(2)),
};

const features = byFeature(perFile);
const summary = {
  generatedFrom: layers,
  totals,
  overall,
  files: Object.keys(perFile).length,
  features,
};
mkdirSync(join(ROOT, 'reports', 'raw'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'raw', 'coverage-summary.json'), JSON.stringify(summary, null, 2));

console.log(`Coverage merged from: ${layers.join(', ')}`);
console.log(`  statements ${overall.statements}%  functions ${overall.functions}%  branches ${overall.branches}%`);
console.log(`  ${Object.keys(perFile).length} source files, ${Object.keys(features).length} features attributed`);

// ------------------------------------------------------------------ ratchet

const UPDATE = process.argv.includes('--update-floor');
const floor = existsSync(FLOOR_PATH) ? JSON.parse(readFileSync(FLOOR_PATH, 'utf8')) : null;

if (UPDATE || !floor) {
  const next = {
    note:
      'No-regression floor for merged coverage. Raise it when coverage rises; it must ' +
      'never be lowered to make a run pass. Regenerate with `node scripts/coverage.mjs --update-floor`.',
    recordedAt: new Date().toISOString().slice(0, 10),
    layers,
    overall,
  };
  writeFileSync(FLOOR_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nFloor ${floor ? 'raised' : 'recorded'} at test/registry/coverage-floor.json`);
  process.exit(0);
}

// A tenth of a percent of slack: istanbul counts can shift by a statement or
// two between runs without anything meaningful changing.
const SLACK = 0.1;
const drops = Object.entries(floor.overall)
  .filter(([metric, was]) => overall[metric] < was - SLACK)
  .map(([metric, was]) => `${metric}: ${overall[metric]}% is below the floor of ${was}%`);

if (floor.layers.length > layers.length) {
  console.warn(
    `\nnote: the floor was recorded from ${floor.layers.join(', ')} but this run only had ` +
      `${layers.join(', ')} — comparing anyway, which is why a partial run can look like a drop.`,
  );
}

if (drops.length > 0) {
  console.error('\nCoverage regressed:');
  for (const d of drops) console.error(`  - ${d}`);
  console.error('\nAdd tests, or justify the drop and re-record with --update-floor.');
  process.exit(1);
}

const rises = Object.entries(floor.overall)
  .filter(([metric, was]) => overall[metric] > was + 1)
  .map(([metric, was]) => `${metric} ${was}% -> ${overall[metric]}%`);
if (rises.length > 0) {
  console.log(`\nCoverage rose (${rises.join(', ')}) — raise the floor with --update-floor.`);
}
console.log('\nCoverage floor held.');
