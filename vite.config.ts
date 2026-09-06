import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Content-Security-Policy, injected at build time only (dev needs Vite's HMR client).
// Keep in sync with docs/SECURITY.md §6. frame-src + apis.google.com script:
// Firebase Auth's popup flow injects gapi (apis.google.com/js/api.js) into the
// opener page as the popup→app result relay — blocking it = auth/internal-error.
const CSP = [
  "default-src 'none'",
  "script-src 'self' https://apis.google.com",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' https://avatars.githubusercontent.com https://opengraph.githubassets.com data:",
  "connect-src 'self' https://api.github.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://discord.com",
  "frame-src https://*.firebaseapp.com",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

let buildId = 'dev';

export default defineConfig({
  base: '/repocircle/',
  plugins: [
    preact(),
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
          `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
        );
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['test/unit/**/*.test.ts'], environment: 'node' },
});
