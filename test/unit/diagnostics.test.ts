import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearServerError,
  log,
  logBuffer,
  noteServerError,
  serverUnavailable,
} from '../../src/util/log';
import { newGroupId, randomToken } from '../../src/data/ids';

/**
 * Diagnostics and identifiers.
 *
 * The logging module is where an outage becomes a sentence a member reads, and
 * the id module is what stands between an invite token and a guessable one —
 * so the assertions here are about honesty and about distribution, not shape.
 */

describe('[infrastructure] the diagnostics ring buffer', () => {
  beforeEach(() => {
    logBuffer.value = [];
    serverUnavailable.value = null;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps what was logged, with its level', () => {
    log('info', 'polling started');
    log('warn', 'poll failed');
    expect(logBuffer.value.map((e) => e.msg)).toEqual(['polling started', 'poll failed']);
    expect(logBuffer.value[1]!.level).toBe('warn');
  });

  it('stays bounded, so a long-lived tab cannot grow it forever', () => {
    for (let i = 0; i < 120; i++) log('info', `entry ${i}`);
    expect(logBuffer.value.length).toBeLessThanOrEqual(50);
    // It keeps the newest, which is the half worth having when something breaks.
    expect(logBuffer.value.at(-1)!.msg).toBe('entry 119');
  });

  it('stamps each entry so #/diag can order them', () => {
    log('info', 'x');
    expect(typeof logBuffer.value[0]!.at).toBe('number');
  });
});

describe('[infrastructure] server errors that a member should be told about', () => {
  beforeEach(() => {
    serverUnavailable.value = null;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('speaks up for the codes that mean the page is incomplete', () => {
    // The app renders from cache in these states, which looks exactly like data
    // going missing — members vanishing, a circle emptying. Saying nothing is
    // the bug this exists to prevent.
    for (const code of ['resource-exhausted', 'unavailable', 'permission-denied']) {
      serverUnavailable.value = null;
      noteServerError(code, 'members');
      expect(serverUnavailable.value, `${code} should surface`).toBeTruthy();
    }
  });

  it('says what it means for the reader, not what the code was', () => {
    noteServerError('resource-exhausted', 'members');
    const message = serverUnavailable.value!;
    expect(message).toContain('Can’t reach RepoCircle');
    expect(message).toContain('changes won’t save');
    // No jargon leaks into the sentence a member reads.
    expect(message).not.toContain('resource-exhausted');
    expect(message).not.toContain('permission');
  });

  it('stays quiet for codes that do not mean the page is wrong', () => {
    noteServerError('not-found', 'members');
    noteServerError('cancelled', 'members');
    noteServerError(undefined, 'members');
    expect(serverUnavailable.value).toBeNull();
  });

  it('can be cleared once a read succeeds again (Class B)', () => {
    noteServerError('unavailable', 'members');
    expect(serverUnavailable.value).toBeTruthy();
    clearServerError();
    expect(serverUnavailable.value).toBeNull();
  });
});

describe('[infrastructure] random identifiers', () => {
  it('produces the requested length', () => {
    expect(randomToken(26)).toHaveLength(26);
    expect(randomToken(8)).toHaveLength(8);
    expect(randomToken()).toHaveLength(26);
  });

  it('uses only the base36 alphabet, so a token survives a URL', () => {
    expect(randomToken(200)).toMatch(/^[a-z0-9]+$/);
  });

  it('does not repeat itself', () => {
    // An invite token is the whole of the access control on a join link
    // (ADR-010), so collisions are not a cosmetic concern.
    const seen = new Set(Array.from({ length: 500 }, () => randomToken(26)));
    expect(seen.size).toBe(500);
  });

  it('is not biased towards the start of the alphabet', () => {
    // Rejection sampling exists here for a reason: `b % 36` over a full byte
    // would over-represent the first four letters by about 14%. A skewed token
    // is a smaller token than it looks.
    const counts = new Map<string, number>();
    for (const ch of randomToken(20_000)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(36);
    const values = [...counts.values()];
    const expected = 20_000 / 36;
    // Every symbol within 25% of even — loose enough not to flake, tight enough
    // that reintroducing modulo bias would fail it.
    for (const [ch, n] of counts) {
      expect(Math.abs(n - expected) / expected, `'${ch}' appeared ${n} times`).toBeLessThan(0.25);
    }
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  it('group ids are shorter, because they are not secrets', () => {
    // Membership rules gate access to a circle; the id only has to be unique.
    expect(newGroupId()).toHaveLength(12);
    expect(newGroupId()).toMatch(/^[a-z0-9]+$/);
    expect(newGroupId()).not.toBe(newGroupId());
  });
});
