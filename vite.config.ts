import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Content-Security-Policy, injected at build time only (dev needs Vite's HMR client).
// Keep in sync with docs/SECURITY.md §6. frame-src: Firebase Auth popup handshake.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' https://avatars.githubusercontent.com data:",
  "connect-src 'self' https://api.github.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://discord.com",
  "frame-src https://*.firebaseapp.com",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

export default defineConfig({
  base: '/repocircle/',
  plugins: [
    preact(),
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
