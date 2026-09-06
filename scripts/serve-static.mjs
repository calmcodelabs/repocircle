/**
 * A minimal static server with correct MIME types.
 *
 * Exists because Lighthouse CI's built-in static server does not set
 * `text/javascript` on `.js`, and a browser refuses to execute a module script
 * served with the wrong type — which presents as "the page painted nothing"
 * rather than as a content-type problem. Serving it ourselves also matches how
 * GitHub Pages behaves, which is the point of auditing the built bundle at all.
 *
 *   node scripts/serve-static.mjs <dir> [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dir = process.argv[2];
const port = Number(process.argv[3] ?? 4199);
if (!dir) {
  console.error('usage: node scripts/serve-static.mjs <dir> [port]');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  let file = join(dir, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`serving ${dir} at http://127.0.0.1:${port}`);
});
