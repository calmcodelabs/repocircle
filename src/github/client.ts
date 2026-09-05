import { signal } from '@preact/signals';
import { log } from '../util/log';

// The single chokepoint for every GitHub API call (SECURITY §5):
// api.github.com only, token injected from a provider (never logged, never in
// errors), ETag-cached GETs, rate-limit tracking, typed error taxonomy.

export type GhErrorKind =
  | 'auth' // token missing/revoked — reconnect GitHub
  | 'rate_limit' // primary or secondary limit hit
  | 'not_found'
  | 'forbidden'
  | 'network'
  | 'server'
  | 'invalid'; // anything else (bad request, unprocessable…)

export class GhError extends Error {
  kind: GhErrorKind;
  status: number | undefined;
  constructor(kind: GhErrorKind, message: string, status?: number) {
    super(message); // message must never contain the token
    this.kind = kind;
    this.status = status;
  }
}

type TokenProvider = {
  /** Current token, if any. Must be cheap. */
  get(): string | null;
  /** Interactively obtain a (fresh) token, e.g. via re-auth popup. Null = user declined/blocked. */
  refresh(): Promise<string | null>;
};

let tokens: TokenProvider = {
  get: () => null,
  refresh: () => Promise.resolve(null),
};

export function configureTokenProvider(p: TokenProvider): void {
  tokens = p;
}

/** Live headroom from the last response; #/diag shows it (ARCHITECTURE §5). */
export const rateRemaining = signal<number | null>(null);

const API = 'https://api.github.com';
const etagCache = new Map<string, { etag: string; body: unknown }>();

function friendly(kind: GhErrorKind, status?: number): string {
  switch (kind) {
    case 'auth':
      return 'GitHub connection needed — reconnect and retry.';
    case 'rate_limit':
      return 'GitHub rate limit reached — wait a few minutes and retry.';
    case 'not_found':
      return 'GitHub says that doesn’t exist (or it’s private).';
    case 'forbidden':
      return 'GitHub refused this request.';
    case 'network':
      return 'Network hiccup talking to GitHub.';
    case 'server':
      return `GitHub is having trouble (HTTP ${status ?? '5xx'}).`;
    default:
      return `GitHub rejected the request (HTTP ${status ?? '4xx'}).`;
  }
}

async function rawFetch(path: string, token: string | null, useEtag: boolean): Promise<Response> {
  if (!path.startsWith('/')) throw new GhError('invalid', 'Client bug: relative GitHub path required.');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const cached = useEtag ? etagCache.get(path) : undefined;
  if (cached) headers['If-None-Match'] = cached.etag;
  try {
    return await fetch(API + path, { headers });
  } catch {
    throw new GhError('network', friendly('network'));
  }
}

function trackRate(res: Response): void {
  const rem = res.headers.get('X-RateLimit-Remaining');
  if (rem !== null) rateRemaining.value = Number(rem);
}

function isRateLimited(res: Response): boolean {
  return (
    res.status === 429 ||
    (res.status === 403 &&
      (res.headers.get('X-RateLimit-Remaining') === '0' ||
        res.headers.get('Retry-After') !== null))
  );
}

/**
 * GET with ETag caching and one transparent re-auth retry on 401.
 * Never throws anything containing the token.
 */
export async function ghGet<T>(path: string, opts: { etag?: boolean } = {}): Promise<T> {
  const useEtag = opts.etag !== false;
  let token = tokens.get();
  let res = await rawFetch(path, token, useEtag);

  if (res.status === 401) {
    log('warn', `github 401 on ${path} — attempting re-auth`);
    token = await tokens.refresh();
    if (!token) throw new GhError('auth', friendly('auth'), 401);
    res = await rawFetch(path, token, useEtag);
  }

  trackRate(res);

  if (res.status === 304) {
    const cached = etagCache.get(path);
    if (cached) return cached.body as T;
    // Cache evicted between request and response — refetch without the ETag.
    etagCache.delete(path);
    return ghGet<T>(path, { etag: false });
  }
  if (res.ok) {
    const body = (await res.json()) as T;
    const etag = res.headers.get('ETag');
    if (useEtag && etag) etagCache.set(path, { etag, body });
    return body;
  }
  if (res.status === 401) throw new GhError('auth', friendly('auth'), 401);
  if (isRateLimited(res)) throw new GhError('rate_limit', friendly('rate_limit'), res.status);
  if (res.status === 404) throw new GhError('not_found', friendly('not_found'), 404);
  if (res.status === 403) throw new GhError('forbidden', friendly('forbidden'), 403);
  if (res.status >= 500) throw new GhError('server', friendly('server', res.status), res.status);
  throw new GhError('invalid', friendly('invalid', res.status), res.status);
}

/** Conditional GET against a caller-stored ETag (polling engine). */
export type CondResult<T> = { status: 200; body: T; etag: string | null } | { status: 304 };

export async function ghGetConditional<T>(path: string, etag: string | null): Promise<CondResult<T>> {
  let token = tokens.get();
  const withEtag = async (tok: string | null): Promise<Response> => {
    if (!path.startsWith('/')) throw new GhError('invalid', 'Client bug: relative GitHub path required.');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (etag) headers['If-None-Match'] = etag;
    try {
      return await fetch(API + path, { headers });
    } catch {
      throw new GhError('network', friendly('network'));
    }
  };
  let res = await withEtag(token);
  if (res.status === 401) {
    token = await tokens.refresh();
    if (!token) throw new GhError('auth', friendly('auth'), 401);
    res = await withEtag(token);
  }
  trackRate(res);
  if (res.status === 304) return { status: 304 };
  if (res.ok) return { status: 200, body: (await res.json()) as T, etag: res.headers.get('ETag') };
  throw mapError(res);
}

// GitHub asks clients to space out mutating calls (secondary rate limits).
let writeChain: Promise<unknown> = Promise.resolve();
let lastWriteAt = 0;
const WRITE_SPACING_MS = 30_000;

/**
 * Mutating call (POST/PUT/PATCH/DELETE). Serialized and spaced ≥30s apart —
 * callers should treat this as potentially slow and show progress.
 */
export function ghSend<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T | null> {
  const run = async (): Promise<T | null> => {
    const wait = lastWriteAt + WRITE_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastWriteAt = Date.now();

    let token = tokens.get();
    const doSend = async (tok: string | null): Promise<Response> => {
      if (!path.startsWith('/')) throw new GhError('invalid', 'Client bug: relative GitHub path required.');
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      };
      if (tok) headers.Authorization = `Bearer ${tok}`;
      try {
        return await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch {
        throw new GhError('network', friendly('network'));
      }
    };
    let res = await doSend(token);
    if (res.status === 401) {
      token = await tokens.refresh();
      if (!token) throw new GhError('auth', friendly('auth'), 401);
      res = await doSend(token);
    }
    trackRate(res);
    if (res.status === 204) return null;
    if (res.ok) return (await res.json()) as T;
    throw mapError(res);
  };
  const p = writeChain.then(run, run);
  writeChain = p.catch(() => undefined);
  return p;
}

function mapError(res: Response): GhError {
  if (res.status === 401) return new GhError('auth', friendly('auth'), 401);
  if (isRateLimited(res)) return new GhError('rate_limit', friendly('rate_limit'), res.status);
  if (res.status === 404) return new GhError('not_found', friendly('not_found'), 404);
  if (res.status === 403) return new GhError('forbidden', friendly('forbidden'), 403);
  if (res.status >= 500) return new GhError('server', friendly('server', res.status), res.status);
  return new GhError('invalid', friendly('invalid', res.status), res.status);
}

export function ghErrorKind(e: unknown): GhErrorKind | null {
  return e instanceof GhError ? e.kind : null;
}
