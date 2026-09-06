/**
 * Lighthouse budgets (TESTING.md §2, L6; ARCHITECTURE §7).
 *
 * STATUS (2026-09-07): this config is correct but Lighthouse aborts with NO_FCP
 * — "the page did not paint any content" — on this machine AND on GitHub's
 * Ubuntu runners. The cause is not known. Ruled out with evidence, so nobody repeats the search: the base
 * path (assets 404'd until the bundle was staged under /repocircle/), the
 * static server's MIME types (LHCI's own server does not set text/javascript,
 * hence scripts/serve-static.mjs), the entrance animation and reduced motion,
 * screen emulation, CPU throttling, the Content-Security-Policy, the Chrome
 * binary (Playwright's chromium fails identically), public/recover.js, and the
 * machine itself. A
 * trivial static page on the same server, at the same subpath, audits fine —
 * and the real bundle renders correctly and quickly in headless Chromium when
 * driven by Playwright, and a clean Ubuntu runner fails identically (full suite
 * run 1, 2026-09-07) — so this is the app under Lighthouse, not one machine's
 * quirk. The next thing worth trying is Lighthouse's own trace artifacts
 * (`--save-assets`), which were never captured.
 *
 * Consequently the perf job in full.yml is non-blocking, and the *enforced*
 * weight budget remains the gzip check in scripts/verify-artifact.mjs, which
 * runs in the fast gate and is the number ARCHITECTURE §7 actually commits to.
 *
 * Runs against the **production** bundle, served statically — not the dev
 * server and not the emulator build. The budget is a promise about what users
 * receive on a mid-range Android over 4G, so it has to be measured on the
 * bytes they actually get.
 *
 * The route audited is the sign-in screen, deliberately: it is the only surface
 * reachable without a backend, it is every visitor's first paint, and it
 * carries the whole shell — framework, fonts, styles, service worker. Home is
 * behind auth and a seeded circle, so auditing it would measure the emulator's
 * latency as much as the app's.
 *
 * Assertions are `error` where the number is a commitment (bundle weight, no
 * render-blocking resources) and `warn` where the number is environment-
 * sensitive and would otherwise turn into noise that gets switched off.
 */
module.exports = {
  ci: {
    collect: {
      // Our own server, not LHCI's: its built-in one does not set
      // `text/javascript` on .js, and a browser will not execute a module
      // script served with the wrong type — which shows up as NO_FCP rather
      // than as the content-type bug it is. scripts/perf.mjs stages the bundle
      // under /repocircle/ first so the built base path resolves.
      startServerCommand: 'node scripts/serve-static.mjs reports/raw/lh-root 4199',
      startServerReadyPattern: 'serving',
      url: ['http://127.0.0.1:4199/repocircle/index.html'],
      numberOfRuns: 3, // median of three: a single run is mostly machine noise
      /**
       * Audit as a reduced-motion reader sees it.
       *
       * The shell's entrance animation holds content at opacity 0 until it
       * runs (`fill-mode: both` plus a stagger delay), and Lighthouse's Chrome
       * does not reliably composite it — which it reports as NO_FCP, i.e. "the
       * page painted nothing", aborting the whole audit. Reduced motion is a
       * real user configuration that skips straight to the settled state, so
       * this measures a real experience rather than working around a quirk.
       */
      chromeFlags: '--force-prefers-reduced-motion',
      settings: {
        preset: 'desktop',
        // Firebase Auth and Firestore are unreachable in this context by
        // design; their failed requests are not the app's performance.
        skipAudits: ['uses-http2', 'canonical', 'is-crawlable', 'redirects-http'],
        // Headless Chrome here does not composite under Lighthouse's emulated
        // viewport, which it reports as "the page painted nothing". Using the
        // real window and the real clock removes that variable; the budget is
        // about bytes and blocking resources, which emulation does not change.
        screenEmulation: { disabled: true },
        throttlingMethod: 'provided',
      },
    },
    assert: {
      assertions: {
        // Weight is the commitment: ARCHITECTURE §7 budgets 220 KB gzipped for
        // all JS, and verify-artifact.mjs enforces exactly that on every build.
        // Here it is expressed as transfer size so a regression shows up in the
        // same report as the rest of the performance picture.
        'total-byte-weight': ['error', { maxNumericValue: 1_200_000 }],
        'unused-javascript': ['warn', { maxNumericValue: 250_000 }],
        'render-blocking-resources': ['error', { maxNumericValue: 0 }],
        'uses-text-compression': 'off', // the static server here does not gzip
        'unminified-javascript': 'error',
        'unminified-css': 'error',
        'legacy-javascript': ['warn', { maxNumericValue: 20_000 }],

        // Paint. Generous against the documented target because a CI runner is
        // not a phone; the point is catching a step change, not a stopwatch.
        'first-contentful-paint': ['warn', { maxNumericValue: 2_500 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 3_500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 500 }],

        // Category floors. Accessibility is also audited far more precisely by
        // axe in test/e2e/a11y.spec.ts; this is the coarse backstop.
        'categories:performance': ['warn', { minScore: 0.85 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './reports/raw/lighthouse',
      reportFilenamePattern: '%%PATHNAME%%-report.%%EXTENSION%%',
    },
  },
};
