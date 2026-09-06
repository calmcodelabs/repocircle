/**
 * Lighthouse against the production bundle (TESTING.md §2, L6).
 *
 * The app is served from a subpath (`/repocircle/`) and its assets are built
 * with that base, so serving `dist/` at the root gives a page whose scripts all
 * 404 — Lighthouse then reports a broken page rather than a slow one. This
 * stages the bundle under its real base path first, so what gets audited is
 * laid out exactly as GitHub Pages lays it out.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const STAGE = join(ROOT, 'reports', 'raw', 'lh-root');

if (!existsSync(DIST)) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, 'repocircle'), { recursive: true });
cpSync(DIST, join(STAGE, 'repocircle'), { recursive: true });
console.log('[perf] staged dist/ at /repocircle/ for the audit');

try {
  execFileSync('npx', ['lhci', 'autorun', '--config=lighthouserc.cjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} finally {
  rmSync(STAGE, { recursive: true, force: true });
}
