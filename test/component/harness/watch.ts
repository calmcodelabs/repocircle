/**
 * The mocked `watch*` boundary (TESTING.md §0 principle 3, §2 L4).
 *
 * This is the one seam in the whole system that is mocked rather than real, and
 * the reason is Class B and Class G: a component test has to be able to say
 * "now this listener fails", "now it returns nothing because the filter
 * excluded everything", "now it recovers" — on demand, in that order. Against a
 * real backend those states are reachable only by luck.
 *
 * The real implementations are covered by the integration layer, and the real
 * wiring by the E2E journeys, so the mock cannot hide a broken query: it can
 * only be wrong about a shape, and the shapes are imported from the modules
 * themselves, so a signature change breaks compilation here first.
 */
import { vi } from 'vitest';

export type Emitter<T> = {
  /** Push a value to every mounted listener. */
  emit: (value: T) => void;
  /** Fail every mounted listener with a Firestore-style code. */
  fail: (code?: string) => void;
  /** How many listeners are currently attached — the read-cost assertion. */
  readonly mounted: number;
  /** Total attaches since reset, including ones already detached. */
  readonly attaches: number;
};

type Sink<T> = { cb: (v: T) => void; onErr?: (code: string) => void };

type Slot = {
  sinks: Set<Sink<unknown>>;
  attaches: number;
  /** Last emitted value, replayed to late subscribers. */
  last?: unknown;
  lastError?: string;
};

const registry = new Map<string, Slot>();

function slot(name: string): Slot {
  let s = registry.get(name);
  if (!s) {
    s = { sinks: new Set(), attaches: 0 };
    registry.set(name, s);
  }
  return s;
}

/**
 * Build a stand-in for a `watch*` function. The returned unsubscribe really
 * detaches, so `mounted` is a truthful answer to "does this block cost a read",
 * which is the M16.5 property worth protecting.
 */
export function watchStub<T>(name: string) {
  const fn = (...args: unknown[]) => {
    const s = slot(name);
    s.attaches += 1;
    const cb = args.find((a) => typeof a === 'function') as (v: T) => void;
    const rest = args.filter((a) => typeof a === 'function') as Array<(x: never) => void>;
    const onErr = rest[1] as ((code: string) => void) | undefined;
    const sink: Sink<unknown> = { cb: cb as (v: unknown) => void, onErr };
    s.sinks.add(sink);
    // Replay, the way onSnapshot delivers current state the moment a listener
    // attaches. Without this a test would have to emit strictly after Preact
    // flushed its effects, which is a race dressed up as a test.
    if (s.lastError !== undefined) onErr?.(s.lastError);
    else if (s.last !== undefined) (cb as (v: unknown) => void)(s.last);
    return () => {
      s.sinks.delete(sink);
    };
  };
  return fn;
}

export function controller<T>(name: string): Emitter<T> {
  return {
    emit(value: T) {
      const s = slot(name);
      s.last = value;
      s.lastError = undefined;
      for (const sink of s.sinks) sink.cb(value);
    },
    fail(code = 'permission-denied') {
      const s = slot(name);
      s.lastError = code;
      for (const sink of s.sinks) sink.onErr?.(code);
    },
    get mounted() {
      return slot(name).sinks.size;
    },
    get attaches() {
      return slot(name).attaches;
    },
  };
}

export function resetWatches(): void {
  registry.clear();
}

/**
 * Replace every `watch*` export of a data module with a stub, keeping the
 * non-watch exports real. Call inside `vi.mock`'s factory.
 */
export function stubWatchExports<M extends Record<string, unknown>>(
  actual: M,
  prefix = 'watch',
): M {
  const out: Record<string, unknown> = { ...actual };
  for (const key of Object.keys(actual)) {
    if (key.startsWith(prefix) && typeof actual[key] === 'function') {
      out[key] = watchStub(key);
    }
  }
  return out as M;
}

/** Convenience: a spy that records calls and resolves, for action handlers. */
export function action<T = void>(result?: T) {
  return vi.fn(async () => result as T);
}
