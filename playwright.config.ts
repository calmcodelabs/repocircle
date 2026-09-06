import { defineConfig, devices } from '@playwright/test';

/**
 * E2E and visual layers (TESTING.md §2, L5/L6).
 *
 * Runs against the emulator-mode *build* — the same source, same plugins, same
 * service worker stamping as production, differing only by one define and the
 * loopback connect-src, which scripts/verify-build-delta.mjs asserts on every
 * run (ADR-026). Testing the dev server instead would validate an artifact no
 * user ever receives.
 *
 * The emulators and the static server are started by scripts/e2e-serve.mjs,
 * which also seeds the circle, so a run is one command.
 */
const PORT = 4178;
const BASE = `http://127.0.0.1:${PORT}/repocircle/`;

export default defineConfig({
  testDir: 'test/e2e',
  outputDir: 'reports/raw/playwright-artifacts',
  fullyParallel: false, // one emulator database, shared
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/raw/playwright.json' }],
    ['html', { outputFolder: 'reports/raw/playwright-html', open: 'never' }],
  ],
  use: {
    baseURL: BASE,
    // A failure without a trace is a failure you debug by guessing.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'journeys',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /.*\.visual\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-serve.mjs',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
