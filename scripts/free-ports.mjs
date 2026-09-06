/**
 * Clear the emulator ports before anything tries to bind them.
 *
 * `firebase emulators:exec` runs Firestore as a JVM grandchild that does not
 * reliably die when its parent is torn down — Playwright killing its webServer
 * is the usual way this happens. The survivor holds port 8080, and the next
 * command to want an emulator fails with "port taken", which looks nothing like
 * the thing that actually went wrong.
 *
 * Rather than keep trying to win that race on the way out, every emulator-using
 * script runs this on the way in. A suite that cannot be run twice in a row is
 * not a suite anyone will run.
 *
 *   node scripts/free-ports.mjs [port...]     # defaults to 8080 9099 4178 4400
 */
import { execFileSync } from 'node:child_process';

const DEFAULTS = [8080, 9099, 4178, 4400];

export function freePorts(ports = DEFAULTS, log = () => {}) {
  let cleared = 0;
  for (const port of ports) {
    let pids;
    try {
      const out = execFileSync('ss', ['-lptnH', `sport = :${port}`], { encoding: 'utf8' });
      pids = new Set([...out.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])));
    } catch {
      // `ss` unavailable or nothing listening; either way there is nothing here.
      continue;
    }
    for (const pid of pids) {
      if (pid === process.pid) continue;
      try {
        process.kill(pid, 'SIGKILL');
        log(`cleared a leftover process on port ${port} (pid ${pid})`);
        cleared++;
      } catch {
        // Already gone, or not ours to kill — not worth failing a test run over.
      }
    }
  }
  return cleared;
}

// Run directly: `node scripts/free-ports.mjs`
if (process.argv[1]?.endsWith('free-ports.mjs')) {
  const ports = process.argv.slice(2).map(Number).filter(Boolean);
  const n = freePorts(ports.length > 0 ? ports : DEFAULTS, (m) => console.log(`[free-ports] ${m}`));
  if (n > 0) {
    // The OS needs a moment to actually release a socket after the holder dies.
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      /* brief settle */
    }
  }
}
