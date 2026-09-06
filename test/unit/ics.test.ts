import { describe, it, expect } from 'vitest';
import { buildIcs, icsEscape, icsStamp } from '../../src/util/ics';

describe('[ics-export] icsStamp', () => {
  it('is basic-format UTC with no punctuation', () => {
    expect(icsStamp(new Date(Date.UTC(2026, 8, 12, 14, 30, 0)))).toBe('20260912T143000Z');
  });
});

// RFC 5545 §3.3.11. The backslash has to be escaped first or it escapes the
// escapes — String.raw here so the expectations say exactly what they mean.
describe('[ics-export] icsEscape', () => {
  it('escapes backslashes, semicolons and commas', () => {
    expect(icsEscape(String.raw`a,b;c\d`)).toBe(String.raw`a\,b\;c\\d`);
  });

  it('turns newlines into a literal backslash-n', () => {
    expect(icsEscape('one\ntwo')).toBe(String.raw`one\ntwo`);
  });

  it('escapes the backslash before escaping what follows it', () => {
    expect(icsEscape(String.raw`\;`)).toBe(String.raw`\\\;`);
  });

  it('leaves ordinary text alone', () => {
    expect(icsEscape('Saturday build session')).toBe('Saturday build session');
  });
});

describe('[ics-export] buildIcs', () => {
  const start = new Date(Date.UTC(2026, 8, 12, 14, 0, 0));

  it('wraps events in a calendar', () => {
    const out = buildIcs([{ uid: 's1', title: 'Build session', startsAt: start }]);
    expect(out.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(out.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(out).toContain('SUMMARY:Build session');
    expect(out).toContain('UID:s1@repocircle');
  });

  it('defaults to an hour when no duration is given', () => {
    const out = buildIcs([{ uid: 's1', title: 'x', startsAt: start }]);
    expect(out).toContain('DTSTART:20260912T140000Z');
    expect(out).toContain('DTEND:20260912T150000Z');
  });

  it('honours a duration', () => {
    const out = buildIcs([{ uid: 's1', title: 'x', startsAt: start, durationMin: 30 }]);
    expect(out).toContain('DTEND:20260912T143000Z');
  });

  it('uses CRLF, which is what the spec requires', () => {
    expect(buildIcs([{ uid: 's1', title: 'x', startsAt: start }])).toContain('\r\n');
  });

  it('omits description and url when absent', () => {
    const out = buildIcs([{ uid: 's1', title: 'x', startsAt: start }]);
    expect(out).not.toContain('DESCRIPTION:');
    expect(out).not.toContain('URL:');
  });

  it('escapes a title that would otherwise break the format', () => {
    const out = buildIcs([{ uid: 's1', title: 'Demo; bring laptops, all', startsAt: start }]);
    expect(out).toContain(String.raw`SUMMARY:Demo\; bring laptops\, all`);
  });

  it('folds a line longer than 75 octets', () => {
    const out = buildIcs([{ uid: 's1', title: 'x'.repeat(200), startsAt: start }]);
    expect(out.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });

  it('holds several events', () => {
    const out = buildIcs([
      { uid: 'a', title: 'one', startsAt: start },
      { uid: 'b', title: 'two', startsAt: start },
    ]);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('produces a valid empty calendar', () => {
    const out = buildIcs([]);
    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).not.toContain('BEGIN:VEVENT');
  });
});
