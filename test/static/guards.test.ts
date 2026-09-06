import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../registry/scan.ts';

const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');

/**
 * Source-shape guards for the one-artifact rule (TESTING.md §3, ADR-026).
 *
 * The deep version of this check reads the built bundles
 * (scripts/verify-build-delta.mjs) and needs two builds. These are the cheap
 * half: they run in the fast gate and catch the specific regression that would
 * silently break E2E — reintroducing an `import.meta.env.DEV` term into the
 * emulator guard, which is false in every build and so makes the emulator
 * branch unreachable from any built artifact.
 */
describe('[infrastructure] the emulator guard stays build-reachable', () => {
  const files = ['src/firebase.ts', 'src/main.tsx'];

  it('keys on VITE_EMULATORS alone, never conjoined with DEV', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of read(f).split('\n')) {
        if (!line.includes('VITE_EMULATORS')) continue;
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
        if (line.includes('import.meta.env.DEV')) offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      'import.meta.env.DEV is false in every build, so this makes the emulator branch unreachable',
    ).toEqual([]);
  });

  it('still gates on the flag in both places', () => {
    for (const f of files) {
      expect(read(f), `${f} no longer references VITE_EMULATORS`).toContain(
        'import.meta.env.VITE_EMULATORS',
      );
    }
  });

  it('the emulator env file exists and sets the flag', () => {
    expect(read('.env.emulator')).toMatch(/VITE_EMULATORS\s*=\s*1/);
  });
});

describe('[infrastructure] the service worker can still update', () => {
  it('keeps the BUILD_ID placeholder the build asserts on', () => {
    // vite.config.ts throws if this is missing; the failure mode it prevents
    // (a byte-identical worker that never updates) cost days once already.
    expect(read('public/sw.js')).toContain('__BUILD_ID__');
  });

  it('vite still fails the build when the placeholder is gone', () => {
    expect(read('vite.config.ts')).toContain('__BUILD_ID__');
    expect(read('vite.config.ts')).toMatch(/throw new Error\([^)]*BUILD_ID/);
  });
});
