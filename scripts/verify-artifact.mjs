/**
 * L7 — artifact smoke (TESTING.md §2, §7 Class D).
 *
 * Assertions that can only be made against built bytes. The one that matters
 * most is the consecutive-build check: a service worker is only updated by the
 * browser when *its own bytes* change, and ours was byte-identical from M7 to
 * M14 — so the update check never ran, activate() never re-ran, caches were
 * never cleaned, and six same-day deploys reached nobody. The fix was to stamp
 * the entry chunk hash into sw.js. This script verifies the fix still works, by
 * building twice with a source change in between and requiring the worker to
 * differ. Class D's own rule: a mechanism that only fires on change must itself
 * be verified to change.
 *
 * Deliberately not checked: a precache manifest. This worker precaches nothing
 * — it is network-first for the shell and cache-first for hashed assets — so
 * there is no manifest to drift. What governs the same failure here is the
 * per-build cache names and the no-store shell fetch, both asserted below.
 *
 *   node scripts/verify-artifact.mjs
 *   node scripts/verify-artifact.mjs --no-rebuild   # skip the two-build check
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

/** ARCHITECTURE §7: Home must render on mid-range Android over 4G. */
const BUDGET_KB = { total: 220, entry: 60 };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${message}`);
};

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const gzKb = (buf) => gzipSync(buf).length / 1024;
const build = () => execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'pipe' });

// Always build from the current source. Trusting whatever happens to be in
// dist/ is precisely the "which bundle am I looking at?" ambiguity this script
// exists to eliminate — an earlier draft did that and reported a stale artifact
// as passing.
if (process.argv.includes('--no-rebuild')) {
  if (!existsSync(DIST)) {
    console.error('dist/ does not exist and --no-rebuild was passed.');
    process.exit(1);
  }
  console.log('note: --no-rebuild — asserting against the existing dist/, which may be stale\n');
} else {
  build();
}

const swPath = join(DIST, 'sw.js');
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const sw = readFileSync(swPath, 'utf8');
const assets = readdirSync(join(DIST, 'assets'));
const entry = assets.find((f) => f.startsWith('index-') && f.endsWith('.js'));

console.log('Service worker can update (Class D)');
check(!sw.includes('__BUILD_ID__'), 'BUILD_ID placeholder was replaced');
const stamped = /const BUILD_ID = '([^']+)'/.exec(sw)?.[1];
check(!!stamped && stamped !== 'dev', `BUILD_ID is a real value (${stamped})`);
const entryHash = entry ? /index-([A-Za-z0-9_-]+)\.js/.exec(entry)?.[1] : undefined;
check(!!entryHash && stamped === entryHash, `BUILD_ID matches the entry chunk hash (${entryHash})`);
check(
  sw.includes(`rc-shell-${'$'}{BUILD_ID}`) || /rc-shell-\$\{BUILD_ID\}/.test(sw),
  'shell cache name is per-build, so activate() drops the previous one',
);
check(/rc-assets-\$\{BUILD_ID\}/.test(sw), 'asset cache name is per-build');
check(
  /cache:\s*'no-store'/.test(sw),
  "shell fetch uses cache: 'no-store' (the HTTP cache would pin old asset hashes)",
);

console.log('\nShipped HTML carries the policy');
check(html.includes('Content-Security-Policy'), 'CSP meta tag is present');
const csp =
  /content="([^"]*)"/.exec(html.slice(html.indexOf('Content-Security-Policy')))?.[1] ?? '';
check(csp.includes("default-src 'none'"), "CSP starts closed (default-src 'none')");
check(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'), 'CSP allows no unsafe-*');
check(!csp.includes('127.0.0.1'), 'CSP has no loopback origin (this is the production build)');

console.log('\nNo test or emulator affordance shipped');
const appJs = assets
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(DIST, 'assets', f), 'utf8'))
  .join('\n');
for (const marker of ['using local emulators', '127.0.0.1:9099', 'connectAuthEmulator']) {
  check(!appJs.includes(marker), `bundle is free of "${marker}"`);
}

console.log('\nWithin the performance budget');
let total = 0;
for (const f of assets.filter((a) => a.endsWith('.js'))) {
  total += gzKb(readFileSync(join(DIST, 'assets', f)));
}
check(
  total <= BUDGET_KB.total,
  `total JS ${total.toFixed(1)} KB gz <= ${BUDGET_KB.total} KB budget`,
);
if (entry) {
  const entryKb = gzKb(readFileSync(join(DIST, 'assets', entry)));
  check(
    entryKb <= BUDGET_KB.entry,
    `app entry ${entryKb.toFixed(1)} KB gz <= ${BUDGET_KB.entry} KB budget`,
  );
}
if (total > BUDGET_KB.total * 0.95) {
  console.log(`  note  ${(BUDGET_KB.total - total).toFixed(1)} KB of headroom left`);
}

if (!process.argv.includes('--no-rebuild')) {
  console.log('\nA source change produces a different service worker');
  // The check the M7→M14 outage needed. Restoring the touched file is done in a
  // finally block and then verified, because leaving it modified would be worse
  // than the check is worth.
  const touched = join(ROOT, 'src', 'maintenance.ts');
  const original = readFileSync(touched, 'utf8');
  const before = sha(sw);
  try {
    // Must be a change that survives minification — a comment would be stripped
    // and the build would be byte-identical for a legitimate reason, which
    // would make this check pass or fail for the wrong cause. A shipped string
    // literal is the smallest change that provably reaches the bundle.
    const probed = original.replace(/eta: '[^']*'/, "eta: 'artifact-smoke probe'");
    if (probed === original) throw new Error('probe anchor not found in maintenance.ts');
    writeFileSync(touched, probed);
    build();
    const after = sha(readFileSync(swPath, 'utf8'));
    check(before !== after, `sw.js bytes changed (${before} -> ${after})`);
  } finally {
    writeFileSync(touched, original);
    const restored = readFileSync(touched, 'utf8') === original;
    check(restored, 'the probed source file was restored');
    build(); // leave dist/ matching the committed source
  }
}

console.log();
if (failures.length > 0) {
  console.error(`Artifact smoke FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Artifact smoke passed.');
