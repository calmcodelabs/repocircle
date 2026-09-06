import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import istanbul from 'vite-plugin-istanbul';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Content-Security-Policy, injected at build time only (dev needs Vite's HMR client).
// Keep in sync with docs/SECURITY.md §6. frame-src + apis.google.com script:
// Firebase Auth's popup flow injects gapi (apis.google.com/js/api.js) into the
// opener page as the popup→app result relay — blocking it = auth/internal-error.
//
// `--mode emulator` builds the same source for the E2E harness (TESTING.md §3).
// Its only differences from the production bundle are the VITE_EMULATORS define
// and the loopback connect-src below; scripts/verify-build-delta.mjs asserts
// exactly that, so the artifact E2E runs against cannot quietly diverge from
// the one users get.
// The Auth emulator is framed, not just fetched — Firebase Auth relays through
// an iframe, and production satisfies that with *.firebaseapp.com. The emulator
// build needs the loopback equivalent or auth is blocked, which surfaces as an
// unrelated-looking SDK error rather than as a policy violation.
const EMULATOR_CONNECT = [
  'http://127.0.0.1:8080',
  'http://127.0.0.1:9099',
  'http://localhost:8080',
  'http://localhost:9099',
  'ws://127.0.0.1:8080',
  'ws://localhost:8080',
];

const cspFor = (emulator: boolean): string =>
  [
    "default-src 'none'",
    "script-src 'self' https://apis.google.com",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' https://avatars.githubusercontent.com https://opengraph.githubassets.com data:",
    `connect-src 'self' https://api.github.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://discord.com${emulator ? ' ' + EMULATOR_CONNECT.join(' ') : ''}`,
    `frame-src https://*.firebaseapp.com${emulator ? ' http://127.0.0.1:9099 http://localhost:9099' : ''}`,
    "base-uri 'none'",
    "form-action 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; ');

let buildId = 'dev';

export default defineConfig(({ mode }) => {
  const emulator = mode === 'emulator';
  return {
    base: '/repocircle/',
    plugins: [
      preact(),
      // Coverage instrumentation, emulator builds only.
      //
      // The journeys walk most of src/views, and without this every line they
      // execute counts as uncovered — the merged figure said the views were
      // untested while an E2E run was stepping through them. Instrumenting the
      // build the journeys actually run against is the only way to credit it.
      //
      // Never in production: the transform rewrites every function, and the
      // emitted counters would ship. scripts/verify-build-delta.mjs asserts the
      // two bundles still emit the same chunk set, so a leak here is caught.
      ...(emulator
        ? [
            istanbul({
              include: 'src/*',
              exclude: ['node_modules', 'test/*'],
              extension: ['.ts', '.tsx'],
              requireEnv: false,
              forceBuildInstrument: true,
            }),
          ]
        : []),
      {
        // A service worker only updates when its bytes change. Ours was identical
        // across every deploy, so browsers kept the original — no cache cleanup,
        // no controllerchange, and the update prompt could never fire. Stamp the
        // main chunk's hash in so each build ships a genuinely different worker.
        name: 'stamp-sw-build-id',
        apply: 'build',
        generateBundle(_options, bundle) {
          const entry = Object.keys(bundle).find(
            (f) => f.startsWith('assets/index-') && f.endsWith('.js'),
          );
          buildId = entry?.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? 'dev';
        },
        writeBundle(options) {
          const dir = options.dir ?? 'dist';
          const swPath = `${dir}/sw.js`;
          const sw = readFileSync(swPath, 'utf8');
          // Fail the build rather than ship a worker that can never update — the
          // failure mode is silent and costs days of "why is it still broken".
          if (!sw.includes('__BUILD_ID__')) {
            throw new Error('sw.js has no __BUILD_ID__ placeholder — updates would stop working');
          }
          writeFileSync(swPath, sw.replace(/__BUILD_ID__/g, buildId));
        },
      },
      {
        name: 'inject-csp',
        apply: 'build',
        transformIndexHtml(html: string) {
          return html.replace(
            '<!--CSP-->',
            `<meta http-equiv="Content-Security-Policy" content="${cspFor(emulator)}">`,
          );
        },
      },
    ],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      target: 'es2022',
      sourcemap: false,
      // The emulator build is a test artifact and must never be mistaken for the
      // deployable one, so it does not share dist/.
      outDir: emulator ? 'dist-emulator' : 'dist',
    },
  };
});
