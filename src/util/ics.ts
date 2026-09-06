/**
 * M19 — a calendar file built in the browser. A live subscription URL needs
 * something to serve it, which is the Phase-3 Worker (ADR-011); a download
 * needs nothing, so that is what ships now.
 *
 * Pure and string-only so the escaping and the UTC arithmetic are testable
 * without a browser or a clock.
 */
export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  url?: string | null;
  startsAt: Date;
  durationMin?: number;
};

/** RFC 5545 §3.3.5 — basic-format UTC, no punctuation. */
export function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * RFC 5545 §3.3.11: backslash, semicolon and comma are escaped, and newlines
 * become a literal \n. Order matters — the backslash has to go first or it
 * would escape the escapes.
 */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Long lines must be folded at 75 octets, continued with a leading space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

export function buildIcs(events: IcsEvent[], calendarName = 'RepoCircle'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RepoCircle//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ];
  for (const e of events) {
    const end = new Date(e.startsAt.getTime() + (e.durationMin ?? 60) * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@repocircle`,
      `DTSTAMP:${icsStamp(e.startsAt)}`,
      `DTSTART:${icsStamp(e.startsAt)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.url) lines.push(`URL:${icsEscape(e.url)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

/** Hand the browser a file. Separated so buildIcs stays pure. */
export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
