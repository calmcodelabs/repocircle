import { signal } from '@preact/signals';

// Hash routing (GitHub Pages serves a subpath with no rewrites — ADR-003).
// Two disclosure layers max (PRD §5): home, one module segment, settings.
export type Route =
  | { name: 'root' }
  | { name: 'home'; gid: string }
  | { name: 'repos'; gid: string }
  | { name: 'members'; gid: string }
  | { name: 'settings'; gid: string }
  | { name: 'profile'; gid: string; uid: string }
  | { name: 'ask'; gid: string; askId: string }
  | { name: 'repodetail'; gid: string; repoId: string }
  | { name: 'join'; gid: string; token: string }
  | { name: 'new' }
  | { name: 'diag' }
  | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === undefined) return { name: 'root' };
  if (a === 'diag') return { name: 'diag' };
  if (a === 'new') return { name: 'new' };
  if (a === 'join' && b !== undefined && c !== undefined) return { name: 'join', gid: b, token: c };
  if (a === 'g' && b !== undefined) {
    if (c === undefined) return { name: 'home', gid: b };
    if (c === 'repos') return { name: 'repos', gid: b };
    if (c === 'members') return { name: 'members', gid: b };
    if (c === 'settings') return { name: 'settings', gid: b };
    if (c === 'ask' && d !== undefined) return { name: 'ask', gid: b, askId: d };
    if (c === 'm' && d !== undefined) return { name: 'profile', gid: b, uid: d };
    if (c === 'repo' && d !== undefined) return { name: 'repodetail', gid: b, repoId: d };
  }
  return { name: 'notfound' };
}

export const route = signal<Route>({ name: 'root' });

export function navigate(hash: string): void {
  location.hash = hash;
}

export function initRouter(): void {
  const apply = () => {
    route.value = parseHash(location.hash);
  };
  window.addEventListener('hashchange', apply);
  apply();
}
