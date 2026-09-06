import { afterEach, describe, expect, it, vi } from 'vitest';
import { availabilityText } from '../../src/util/availability';
import { langClass } from '../../src/util/lang';
import { relMs, relTime } from '../../src/util/time';
import { LIMITS } from '../../src/util/limits';
import type { Member } from '../../src/data/types';

/**
 * The small formatting helpers.
 *
 * Each of these produces a string a member reads, so the assertions are about
 * the words rather than the shape: "1 event" not "1 events", "away" not
 * "on exams", a language dot that degrades to a neutral class rather than
 * emitting an unknown one.
 */

const member = (availability: Member['availability']): Member =>
  ({ availability }) as unknown as Member;

const stamp = (ms: number) =>
  ({ toMillis: () => ms, toDate: () => new Date(ms) }) as unknown as NonNullable<
    Member['availability']['until']
  >;

describe('[availability] availabilityText', () => {
  it('uses the shared label rather than the raw status', () => {
    expect(availabilityText(member({ status: 'free' }))).toBe('free to help');
    expect(availabilityText(member({ status: 'heads_down' }))).toBe('heads down');
  });

  it('renders "away" for the status, never the reason', () => {
    // ADR-014: statuses are audience-neutral. "on exams" is a student's word;
    // a mentor or an alumnus needs the same status to mean something.
    expect(availabilityText(member({ status: 'away' }))).toBe('away');
  });

  it('shows a custom note when there is one', () => {
    expect(availabilityText(member({ status: 'custom', note: 'reviewing PRs only' }))).toBe(
      'reviewing PRs only',
    );
  });

  it('falls back to "custom" when the note is empty', () => {
    expect(availabilityText(member({ status: 'custom', note: '' }))).toBe('custom');
    expect(availabilityText(member({ status: 'custom' }))).toBe('custom');
  });

  it('appends the until date when one is set', () => {
    const until = stamp(Date.parse('2026-10-01T00:00:00Z'));
    const text = availabilityText(member({ status: 'away', until }));
    expect(text.startsWith('away until ')).toBe(true);
    expect(text.length).toBeGreaterThan('away until '.length);
  });
});

describe('[infrastructure] langClass', () => {
  it('maps a known language to its own class', () => {
    expect(langClass('TypeScript')).toBe('lang--typescript');
    expect(langClass('python')).toBe('lang--python');
  });

  it('normalises the languages whose names are not identifiers', () => {
    expect(langClass('C++')).toBe('lang--cpp');
    expect(langClass('C#')).toBe('lang--csharp');
  });

  it('degrades to a neutral class rather than emitting an unknown one', () => {
    // The classes are real CSS; inventing `lang--brainfuck` would render an
    // uncoloured dot with no rule behind it.
    expect(langClass('Brainfuck')).toBe('lang--other');
  });

  it('has a distinct class for no language at all', () => {
    expect(langClass(null)).toBe('lang--none');
    expect(langClass('')).toBe('lang--none');
  });
});

describe('[infrastructure] relative time', () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it('says "just now" for the very recent past', () => {
    at('2026-09-01T12:00:00Z');
    expect(relMs(Date.now() - 5_000)).toBe('just now');
  });

  it('says "now" for the immediate future', () => {
    at('2026-09-01T12:00:00Z');
    expect(relMs(Date.now() + 5_000)).toBe('now');
  });

  it('counts minutes, hours and days in the past', () => {
    at('2026-09-01T12:00:00Z');
    expect(relMs(Date.now() - 5 * 60_000)).toBe('5m ago');
    expect(relMs(Date.now() - 3 * 3_600_000)).toBe('3h ago');
    expect(relMs(Date.now() - 4 * 86_400_000)).toBe('4d ago');
  });

  it('counts forward too, which is what sessions need', () => {
    at('2026-09-01T12:00:00Z');
    expect(relMs(Date.now() + 2 * 86_400_000)).toBe('in 2d');
    expect(relMs(Date.now() + 90 * 60_000)).toBe('in 2h');
  });

  it('renders nothing for a missing timestamp rather than "Invalid Date"', () => {
    expect(relTime(null)).toBe('');
    expect(relTime(undefined)).toBe('');
  });

  it('reads a Timestamp through toMillis', () => {
    at('2026-09-01T12:00:00Z');
    const ts = { toMillis: () => Date.now() - 86_400_000 } as never;
    expect(relTime(ts)).toBe('1d ago');
  });
});

describe('[infrastructure] shared limits', () => {
  it('are the same numbers the rules enforce', () => {
    // These constants exist so the client can pre-validate with the server's
    // numbers; drifting apart means a form that accepts what the rules reject.
    expect(LIMITS.TITLE_MIN).toBe(4);
    expect(LIMITS.TITLE_MAX).toBe(120);
    expect(LIMITS.GROUP_NAME_MIN).toBe(3);
    expect(LIMITS.INVITE_MAX_DAYS).toBe(30);
  });

  it('are all positive and internally consistent', () => {
    for (const [key, value] of Object.entries(LIMITS)) {
      expect(value, `${key} must be positive`).toBeGreaterThan(0);
    }
    expect(LIMITS.TITLE_MIN).toBeLessThan(LIMITS.TITLE_MAX);
    expect(LIMITS.GROUP_NAME_MIN).toBeLessThan(LIMITS.GROUP_NAME_MAX);
  });
});
