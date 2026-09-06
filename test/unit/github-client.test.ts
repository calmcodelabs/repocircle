import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GhError, configureTokenProvider, ghGet, rateRemaining } from '../../src/github/client';

const TOKEN = 'gho_secret_token_value';

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  configureTokenProvider({ get: () => TOKEN, refresh: async () => TOKEN });
});

describe('[poll-engine] github client', () => {
  it('rejects non-relative paths (no token exfiltration surface)', async () => {
    await expect(ghGet('https://evil.example/steal')).rejects.toMatchObject({ kind: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends bearer token and api version to api.github.com only', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: 1 }));
    await ghGet('/user/repos');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/user/repos');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('caches by ETag and replays the body on 304', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { n: 1 }, { ETag: 'W/"e1"' }));
    const first = await ghGet<{ n: number }>('/repos/a/b');
    fetchMock.mockResolvedValueOnce(res(304));
    const second = await ghGet<{ n: number }>('/repos/a/b');
    expect(first.n).toBe(1);
    expect(second.n).toBe(1);
    expect(fetchMock.mock.calls[1]![1].headers['If-None-Match']).toBe('W/"e1"');
  });

  it('retries once after 401 via the refresh provider', async () => {
    const refresh = vi.fn(async () => 'gho_fresh');
    configureTokenProvider({ get: () => TOKEN, refresh });
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200, { ok: 1 }));
    await expect(ghGet('/user')).resolves.toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer gho_fresh');
  });

  it('maps 401-with-failed-refresh to auth, without leaking the token', async () => {
    configureTokenProvider({ get: () => TOKEN, refresh: async () => null });
    fetchMock.mockResolvedValueOnce(res(401));
    const err = await ghGet('/user').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GhError);
    expect((err as GhError).kind).toBe('auth');
    expect((err as GhError).message).not.toContain(TOKEN);
  });

  it('distinguishes rate-limit 403 from plain 403, and tracks headroom', async () => {
    fetchMock.mockResolvedValueOnce(res(403, {}, { 'X-RateLimit-Remaining': '0' }));
    await expect(ghGet('/a/b')).rejects.toMatchObject({ kind: 'rate_limit' });
    fetchMock.mockResolvedValueOnce(res(403, {}, { 'X-RateLimit-Remaining': '4200' }));
    await expect(ghGet('/a/c')).rejects.toMatchObject({ kind: 'forbidden' });
    expect(rateRemaining.value).toBe(4200);
  });

  it('maps 404, 5xx and network failures', async () => {
    fetchMock.mockResolvedValueOnce(res(404));
    await expect(ghGet('/repos/x/y')).rejects.toMatchObject({ kind: 'not_found' });
    fetchMock.mockResolvedValueOnce(res(502));
    await expect(ghGet('/repos/x/z')).rejects.toMatchObject({ kind: 'server' });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(ghGet('/repos/x/w')).rejects.toMatchObject({ kind: 'network' });
  });
});
