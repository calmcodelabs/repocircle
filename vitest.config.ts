import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { playwright } from '@vitest/browser-playwright';

/**
 * The test layers (TESTING.md §2), as vitest projects.
 *
 * Projects rather than separate config files so every layer shares one
 * transformation pipeline and one reporter setup, and so `--project` can pick
 * any combination — notably rules+integration together, which lets both share
 * a single emulator boot instead of paying for two.
 *
 * Layers that need a browser (component) or a driver (e2e, visual) arrive in
 * T3/T4 and get their own projects here.
 *
 *   npm test                 static + unit          (no emulator, the quick loop)
 *   npm run test:rules       rules                  (emulators:exec)
 *   npm run test:integration integration            (emulators:exec)
 *   npm run test:backend     rules + integration    (one emulator boot)
 */
export default defineConfig({
  test: {
    /**
     * Coverage is collected per layer into its own directory and merged by
     * scripts/coverage.mjs, because the layers cannot run in one pass: unit is
     * node, integration needs the emulators, component needs a browser. Merging
     * is the only way to answer "is this line covered *anywhere*", which is the
     * question that matters — a data module exercised only by an E2E journey is
     * still exercised.
     */
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/vite-env.d.ts', 'src/firebase-config.ts'],
      reporter: ['json', 'text-summary'],
      // Thresholds are enforced by scripts/coverage.mjs against a recorded
      // floor, not here: vitest would apply them per-run, and no single layer
      // is meant to cover the app on its own.
      thresholds: undefined,
      all: true,
      clean: false,
    },
    projects: [
      {
        test: {
          name: 'static',
          include: ['test/static/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rules',
          include: ['test/rules/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20000,
          hookTimeout: 40000,
          // Rules tests share one emulator database; parallel files would see
          // each other's clearFirestore().
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
          hookTimeout: 40000,
          // One emulator database, shared: parallel files would clear each
          // other's data mid-test.
          fileParallelism: false,
          // The app's own firebase.ts reads this to decide whether to connect to
          // the emulators, so integration tests exercise the real wiring rather
          // than a test-only handle (ADR-026).
          env: { VITE_EMULATORS: '1' },
        },
      },
      {
        // L4 — real Chromium, real layout, real events. jsdom would answer
        // questions about a fake DOM; the states these tests drive (focus,
        // visibility, disabled controls) are only meaningful in a browser.
        plugins: [preact()],
        test: {
          name: 'component',
          include: ['test/component/**/*.test.tsx'],
          setupFiles: ['test/component/setup.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
