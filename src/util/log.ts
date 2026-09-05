import { signal } from '@preact/signals';

// Small diagnostics ring buffer surfaced at #/diag. Never log tokens or doc bodies.
export type LogEntry = { at: number; level: 'info' | 'warn' | 'error'; msg: string };
const MAX = 50;

export const logBuffer = signal<LogEntry[]>([]);

export function log(level: LogEntry['level'], msg: string): void {
  console[level]('[rc]', msg);
  logBuffer.value = [...logBuffer.value.slice(-(MAX - 1)), { at: Date.now(), level, msg }];
}
