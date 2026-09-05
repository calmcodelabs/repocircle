import { signal } from '@preact/signals';

// Small diagnostics ring buffer surfaced at #/diag. Never log tokens or doc bodies.
export type LogEntry = { at: number; level: 'info' | 'warn' | 'error'; msg: string };
const MAX = 50;

export const logBuffer = signal<LogEntry[]>([]);

/**
 * Set when Firestore rejects reads (quota exhausted, backend unavailable). The app
 * keeps rendering from its offline cache in that state, which silently looks like
 * data has gone missing — members vanishing, groups emptying. Say so instead.
 */
export const serverUnavailable = signal<string | null>(null);

const BLOCKING_CODES = new Set(['resource-exhausted', 'unavailable', 'permission-denied']);

export function noteServerError(code: string | undefined, context: string): void {
  if (!code || !BLOCKING_CODES.has(code)) return;
  serverUnavailable.value =
    code === 'resource-exhausted'
      ? 'RepoCircle has hit its database quota for today. What you see below may be out of date until it resets.'
      : code === 'unavailable'
        ? 'Can’t reach the database right now. Showing the last data this device saw.'
        : null;
  if (serverUnavailable.value) log('warn', `server blocked (${code}) during ${context}`);
}

export function log(level: LogEntry['level'], msg: string): void {
  console[level]('[rc]', msg);
  logBuffer.value = [...logBuffer.value.slice(-(MAX - 1)), { at: Date.now(), level, msg }];
}
