import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES } from '../registry/features.ts';
import { REPO_ROOT, srcFiles } from '../registry/scan.ts';

const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');

/**
 * Class G, the half a machine can check (REVIEW.md).
 *
 * Whether the words are true is a component test driving each state (T3). What
 * is checkable here is the bookkeeping that makes those tests possible: any
 * view that can render an empty list must belong to a feature that has
 * enumerated the distinct reasons it can be empty. "Nothing yet" is only honest
 * for one of them, and the enumeration is what stops the other reasons being
 * quietly answered with the same sentence.
 */
describe('[empty-states] every empty list has its reasons enumerated', () => {
  /** Views that render an EmptyState, mapped to the features that claim them. */
  function viewsWithEmptyState(): string[] {
    return srcFiles()
      .filter((f) => f.startsWith('views/'))
      .filter((f) => /\bEmptyState\b/.test(read(`src/${f}`)));
  }

  const views = viewsWithEmptyState();

  it('finds the views that can render empty', () => {
    expect(views.length).toBeGreaterThan(5);
  });

  it('each is owned by a feature that lists its empty states', () => {
    // Structural views (NotFound, the circle shell's denied screen) render a
    // single state that is definitionally the only reason — nothing to
    // enumerate. Everything else is a list, and a list has reasons.
    const STRUCTURAL = new Set(['views/NotFound.tsx', 'views/GroupShell.tsx']);

    const offenders: string[] = [];
    for (const view of views) {
      if (STRUCTURAL.has(view)) continue;
      const owners = FEATURES.filter((f) => f.files.includes(view));
      if (owners.length === 0) {
        offenders.push(`${view}: claimed by no feature`);
        continue;
      }
      if (!owners.some((f) => (f.emptyStates?.length ?? 0) > 0)) {
        offenders.push(
          `${view}: owned by ${owners.map((f) => f.id).join(', ')} — none list emptyStates`,
        );
      }
    }
    expect(
      offenders,
      'Add the distinct reasons this list can be empty to the owning feature in test/registry/features.ts',
    ).toEqual([]);
  });

  it('no feature enumerates the same reason twice', () => {
    const dupes: string[] = [];
    for (const f of FEATURES) {
      const seen = new Set<string>();
      for (const e of f.emptyStates ?? []) {
        if (seen.has(e)) dupes.push(`${f.id}: "${e}"`);
        seen.add(e);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('reports how many empty states T3 has to cover', () => {
    const total = FEATURES.reduce((n, f) => n + (f.emptyStates?.length ?? 0), 0);
    console.info(`[copy] ${total} enumerated empty states await component tests`);
    expect(total).toBeGreaterThan(20);
  });
});

/**
 * The CSP is the app's only defence-in-depth against injected script, and it
 * exists solely in production builds — so a change to it is invisible to dev,
 * to the emulator and to every other layer. This pins the policy: widening it
 * requires editing this list, which is the point.
 *
 * The built-bundle half (the header is actually present, byte-exact, in the
 * shipped HTML) is asserted in scripts/verify-artifact.mjs.
 */
describe('[csp] the content security policy stays closed', () => {
  const config = read('vite.config.ts');

  const EXPECTED: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'", 'https://apis.google.com'],
    'style-src': ["'self'"],
    'font-src': ["'self'"],
    'img-src': [
      "'self'",
      'https://avatars.githubusercontent.com',
      'https://opengraph.githubassets.com',
      'data:',
    ],
    'frame-src': ['https://*.firebaseapp.com'],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"],
  };

  it('declares exactly the expected directives', () => {
    for (const [directive, sources] of Object.entries(EXPECTED)) {
      const line = config
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !l.startsWith('//') && !l.startsWith('*'))
        .find((l) => l.includes(`${directive} `));
      expect(line, `${directive} is missing from the CSP`).toBeTruthy();
      for (const src of sources) {
        expect(line, `${directive} no longer allows ${src}`).toContain(src);
      }
    }
  });

  it('never allows unsafe-inline or unsafe-eval anywhere', () => {
    expect(config).not.toContain("'unsafe-inline'");
    expect(config).not.toContain("'unsafe-eval'");
  });

  it('connect-src allows only the four hosts the app talks to', () => {
    const HOSTS = [
      'https://api.github.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com',
      'https://discord.com',
    ];
    const line = config
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('`connect-src'));
    expect(line, 'connect-src directive not found').toBeTruthy();
    for (const h of HOSTS) expect(line).toContain(h);
    // Any other https origin would be a new external dependency; make adding
    // one a deliberate edit here rather than a silent widening.
    const extras = [...(line ?? '').matchAll(/https:\/\/[a-z0-9.*-]+/g)]
      .map((m) => m[0])
      .filter((h) => !HOSTS.includes(h));
    expect(extras, 'A new external origin was added to connect-src').toEqual([]);
  });

  it('the loopback origins are reachable only in emulator mode', () => {
    // The E2E build widens connect-src; production must never see it (ADR-026).
    const loopbackBlock = config.slice(
      config.indexOf('const EMULATOR_CONNECT'),
      config.indexOf('const cspFor'),
    );
    expect(loopbackBlock).toContain('127.0.0.1');
    expect(config).toMatch(/emulator \?.*EMULATOR_CONNECT/s);
  });

  it('the policy is injected on build only', () => {
    // Dev needs Vite's HMR client, so the meta tag is a build-time transform.
    // If that ever became unconditional, dev would break and someone would
    // "fix" it by loosening the policy.
    const plugin = config.slice(config.indexOf("name: 'inject-csp'"));
    expect(plugin).toContain("apply: 'build'");
  });
});
