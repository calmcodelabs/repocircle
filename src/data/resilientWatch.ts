import type { FirestoreError, Unsubscribe } from 'firebase/firestore';

/**
 * Group-scoped listeners can hit a transient `permission-denied` when they attach
 * in the moment right after a membership write (joining a group, founding one) —
 * the rules engine hasn't seen the membership yet. A plain onSnapshot listener dies
 * permanently on that error, which left brand-new members looking at an empty Home
 * until they reloaded. Retry a few times with backoff before giving up for real.
 *
 * `attach` gets an `onOk` to call when data arrives (resets the retry budget) and an
 * `onErr` to forward listener errors to.
 */
export function resilientWatch(
  attach: (onOk: () => void, onErr: (e: FirestoreError) => void) => Unsubscribe,
  opts: { retries?: number; onGiveUp?: (code: string) => void; baseDelayMs?: number } = {},
): Unsubscribe {
  const maxRetries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 600;
  let unsub: Unsubscribe | null = null;
  let attempt = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const start = (): void => {
    if (cancelled) return;
    unsub = attach(
      () => {
        attempt = 0; // healthy again — restore the full retry budget
      },
      (err) => {
        unsub?.();
        unsub = null;
        if (err.code === 'permission-denied' && attempt < maxRetries) {
          const delay = base * 2 ** attempt;
          attempt += 1;
          timer = setTimeout(start, delay);
        } else {
          opts.onGiveUp?.(err.code);
        }
      },
    );
  };

  start();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    unsub?.();
  };
}
