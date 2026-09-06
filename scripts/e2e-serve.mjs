/**
 * Everything the E2E layer needs, in one process (TESTING.md §2, L5).
 *
 * Builds the emulator-mode bundle, starts the Firestore and Auth emulators,
 * seeds a circle, and serves dist-emulator/ under the app's real base path.
 * Playwright's webServer points at this, so `npm run test:e2e` is one command
 * and CI does not need a bespoke sequence of background jobs.
 *
 * The static server deliberately mimics GitHub Pages: it serves the subpath,
 * has no SPA rewrite (the app uses hash routing precisely because Pages has
 * none), and sets no caching headers the real host would not.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePorts } from './free-ports.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist-emulator');
const PORT = Number(process.env.E2E_PORT ?? 4178);
const BASE = '/repocircle/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function log(msg) {
  console.log(`[e2e-serve] ${msg}`);
}

freePorts([8080, 9099, PORT], (m) => log(m));

log('building the emulator-mode bundle');
execFileSync('npx', ['vite', 'build', '--mode', 'emulator'], { cwd: ROOT, stdio: 'inherit' });

log('starting emulators');
const emulators = spawn(
  'npx',
  [
    '-y',
    'firebase-tools@14',
    'emulators:exec',
    '--only',
    'firestore,auth',
    // Seed, then hold the emulators open until this process is killed.
    'node scripts/seed-emulator.mjs && node -e "setInterval(()=>{},1<<30)"',
  ],
  // Deliberately NOT detached. Playwright tears its webServer down by killing
  // the process tree, so staying inside this process's group is what lets the
  // emulator JVMs die with it. Giving them their own group (detached: true)
  // does the opposite — it shields them, they keep port 8080, and the next run
  // fails to seed for a reason that looks nothing like the real cause.
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);

let seeded = false;
let lastOutput = '';
const watchOutput = (stream) => {
  stream.on('data', (buf) => {
    const text = String(buf);
    lastOutput = (lastOutput + text).slice(-4000);
    if (text.includes('Seeded')) seeded = true;
    if (process.env.E2E_VERBOSE) process.stdout.write(text);
  });
};
watchOutput(emulators.stdout);
watchOutput(emulators.stderr);

/**
 * Stop the emulators for real.
 *
 * SIGTERM to the npx wrapper alone leaves the Firestore JVM running, and a
 * survivor on port 8080 makes the *next* run fail to seed — a failure that
 * looks nothing like its cause. So: signal the whole process group, and escalate
 * to SIGKILL, because a test harness that leaks a JVM is worse than an abrupt one.
 */
function stopEmulators(signal = 'SIGTERM') {
  if (emulators.pid === undefined) return;
  for (const target of [() => emulators.kill(signal), () => process.kill(emulators.pid, signal)]) {
    try {
      target();
      return;
    } catch {
      /* try the next form */
    }
  }
}

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  stopEmulators('SIGTERM');
  setTimeout(() => {
    stopEmulators('SIGKILL');
    process.exit(0);
  }, 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Last resort: exit handlers cannot await, so this one does not ask nicely.
process.on('exit', () => stopEmulators('SIGKILL'));

// Wait for the seed to land before serving, so the first navigation in a
// journey never races the fixture data.
const started = Date.now();
while (!seeded && Date.now() - started < 150_000) {
  await new Promise((r) => setTimeout(r, 250));
}
if (!seeded) {
  console.error('[e2e-serve] emulators did not seed in time. Last output:\n' + lastOutput);
  console.error(
    '[e2e-serve] a stale emulator from a previous run holding port 8080 is the usual cause.',
  );
  stopEmulators();
  process.exit(1);
}
log('emulators seeded');

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  let path = decodeURIComponent(url.pathname);

  // Reset to the seeded state. Journeys mutate the database — joining a circle
  // is the point of several of them — so without this each test inherits
  // whatever the previous one left, and "is the test user already a member?"
  // silently changes the flow under test. That is not flakiness to tolerate;
  // it is shared state to remove.
  if (path === '/__reset') {
    try {
      execFileSync('node', ['scripts/seed-emulator.mjs'], {
        cwd: ROOT,
        stdio: 'pipe',
        env: {
          ...process.env,
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
          GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? 'repocircle-3e9a6',
        },
      });
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('reseeded');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e));
    }
    return;
  }

  if (!path.startsWith(BASE)) {
    // Pages serves nothing outside the project subpath.
    res.writeHead(404).end('not found');
    return;
  }
  path = path.slice(BASE.length) || 'index.html';
  const file = join(DIST, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  const target = existsSync(file) && statSync(file).isFile() ? file : join(DIST, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
    // The service worker must be revalidated or a stale one pins the shell.
    'Cache-Control': target.endsWith('sw.js') ? 'no-cache' : 'no-store',
  });
  createReadStream(target).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  log(`serving dist-emulator at http://127.0.0.1:${PORT}${BASE}`);
});
