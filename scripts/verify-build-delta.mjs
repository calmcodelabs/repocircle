/**
 * Proves the one-artifact rule (TESTING.md §3, ADR-026).
 *
 * E2E runs against a build produced with `--mode emulator`, not against the
 * production bundle. That is a deliberate, contained exception to "test what
 * you ship", and it is only safe while the difference between the two builds
 * stays exactly what we said it is:
 *
 *   1. the production bundle contains NO emulator wiring at all;
 *   2. the emulator bundle DOES (otherwise E2E is testing nothing);
 *   3. both emit the same set of chunks — no code moved, nothing extra shipped;
 *   4. the CSPs differ only by the loopback connect-src entries;
 *   5. both stamp a real BUILD_ID into sw.js.
 *
 * Any drift beyond that means the artifact E2E validates is no longer a stand-in
 * for the artifact users get, and this script fails.
 *
 *   node scripts/verify-build-delta.mjs          # builds both, then checks
 *   node scripts/verify-build-delta.mjs --no-build
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: the repo path can contain spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROD = join(ROOT, 'dist');
const EMU = join(ROOT, 'dist-emulator');

/** Strings that exist only because our emulator branch survived tree-shaking. */
const EMULATOR_MARKERS = ['using local emulators', '127.0.0.1:9099', 'connectAuthEmulator'];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${message}`);
};

function build() {
  console.log('Building production and emulator bundles from the same tree...');
  execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('npx', ['vite', 'build', '--mode', 'emulator'], { cwd: ROOT, stdio: 'inherit' });
}

const appJs = (dir) =>
  readdirSync(join(dir, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(dir, 'assets', f), 'utf8'))
    .join('\n');

/**
 * Chunk names with content hashes removed, so the two builds are comparable.
 *
 * Source maps are excluded: the emulator build is instrumented for coverage and
 * that turns them on, which is a debugging aid rather than a difference in the
 * code either build runs. Production carrying no maps is asserted separately —
 * a map is a full copy of the source, and shipping one is its own problem.
 */
const chunkShape = (dir) =>
  readdirSync(join(dir, 'assets'))
    .filter((f) => !f.endsWith('.map'))
    .map((f) => f.replace(/-[A-Za-z0-9_-]{6,}\./, '.'))
    .sort()
    .join(',');

const cspOf = (dir) => {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const m = /content="([^"]*)"/.exec(html.slice(html.indexOf('Content-Security-Policy')));
  return m ? m[1] : '';
};

if (!process.argv.includes('--no-build')) build();

if (!existsSync(PROD) || !existsSync(EMU)) {
  console.error('Both dist/ and dist-emulator/ must exist. Run without --no-build.');
  process.exit(1);
}

console.log('\nProduction bundle carries no emulator wiring');
const prodJs = appJs(PROD);
for (const marker of EMULATOR_MARKERS) {
  check(!prodJs.includes(marker), `dist/ is free of "${marker}"`);
}
check(!cspOf(PROD).includes('127.0.0.1'), 'dist/ CSP has no loopback origin');
check(
  readdirSync(join(PROD, 'assets')).every((f) => !f.endsWith('.map')),
  'dist/ ships no source maps',
);
// The coverage instrumentation must never reach production: it rewrites every
// function and its counters would ship with them.
check(!prodJs.includes('__coverage__'), 'dist/ carries no coverage instrumentation');

console.log('\nEmulator bundle actually reaches the emulators');
const emuJs = appJs(EMU);
check(
  EMULATOR_MARKERS.some((m) => emuJs.includes(m)),
  'dist-emulator/ contains the emulator wiring',
);
check(cspOf(EMU).includes('127.0.0.1:8080'), 'dist-emulator/ CSP allows the Firestore emulator');

console.log('\nThe two builds are otherwise the same artifact');
check(chunkShape(PROD) === chunkShape(EMU), 'identical chunk set (hashes aside)');

const prodCsp = cspOf(PROD).split('; ').sort();
const emuCsp = cspOf(EMU).split('; ').sort();
const changed = prodCsp
  .filter((d, i) => d !== emuCsp[i])
  .map((d) => d.split(' ')[0])
  .concat(emuCsp.filter((d) => !prodCsp.includes(d)).map((d) => d.split(' ')[0]));
const uniqueChanged = [...new Set(changed)];
// Two directives may differ, and only these two: connect-src for the emulator
// endpoints, frame-src for the Auth emulator's relay iframe. Anything else
// means the artifact E2E validates has drifted from the one users receive.
const ALLOWED_CSP_DELTA = ['connect-src', 'frame-src'];
check(
  uniqueChanged.every((d) => ALLOWED_CSP_DELTA.includes(d)),
  `CSP differs only in ${ALLOWED_CSP_DELTA.join('/')} (differs in: ${uniqueChanged.join(', ') || 'nothing'})`,
);

console.log('\nBoth builds stamp a service worker that can update');
for (const [name, dir] of [
  ['dist', PROD],
  ['dist-emulator', EMU],
]) {
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
  check(!sw.includes('__BUILD_ID__'), `${name}/sw.js has its BUILD_ID placeholder replaced`);
}

console.log();
if (failures.length > 0) {
  console.error(`Build delta verification FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Build delta verified: the emulator build differs only as documented.');
