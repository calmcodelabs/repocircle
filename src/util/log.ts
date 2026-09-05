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
  // One plain sentence. Why the server is unhappy is our problem, not the reader's.
  serverUnavailable.value =
    'Can’t reach RepoCircle right now — this page may be incomplete, and changes won’t save until the connection is back.';
  log('warn', `server blocked (${code}) during ${context}`);
}

export function clearServerError(): void {
  serverUnavailable.value = null;
}

export function log(level: LogEntry['level'], msg: string): void {
  console[level]('[rc]', msg);
  logBuffer.value = [...logBuffer.value.slice(-(MAX - 1)), { at: Date.now(), level, msg }];
}
