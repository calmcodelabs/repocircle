import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FirestoreError } from 'firebase/firestore';
import { resilientWatch } from '../../src/data/resilientWatch';

const denied = { code: 'permission-denied' } as FirestoreError;
const unavailable = { code: 'unavailable' } as FirestoreError;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('[resilient-listeners] resilientWatch', () => {
  it('retries a transient permission-denied and recovers', () => {
    const unsubs: Array<() => void> = [];
    let attaches = 0;
    const onGiveUp = vi.fn();
    let capturedOk: (() => void) | null = null;

    resilientWatch(
      (onOk, onErr) => {
        attaches += 1;
        capturedOk = onOk;
        // First attach fails the way a just-joined member's listener does.
        if (attaches === 1) queueMicrotask(() => onErr(denied));
        const u = vi.fn();
        unsubs.push(u);
        return u;
      },
      { onGiveUp, baseDelayMs: 10 },
    );

    return Promise.resolve().then(() => {
      vi.advanceTimersByTime(50);
      expect(attaches).toBe(2); // re-attached instead of dying
      expect(onGiveUp).not.toHaveBeenCalled();
      capturedOk?.();
    });
  });

  it('gives up after exhausting retries', async () => {
    const onGiveUp = vi.fn();
    let attaches = 0;
    resilientWatch(
      (_onOk, onErr) => {
        attaches += 1;
        queueMicrotask(() => onErr(denied));
        return vi.fn();
      },
      { onGiveUp, retries: 2, baseDelayMs: 5 },
    );
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      vi.advanceTimersByTime(50);
    }
    expect(attaches).toBe(3); // initial + 2 retries
    expect(onGiveUp).toHaveBeenCalledWith('permission-denied');
  });

  it('does not retry non-permission errors', async () => {
    const onGiveUp = vi.fn();
    let attaches = 0;
    resilientWatch(
      (_onOk, onErr) => {
        attaches += 1;
        queueMicrotask(() => onErr(unavailable));
        return vi.fn();
      },
      { onGiveUp, baseDelayMs: 5 },
    );
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    expect(attaches).toBe(1);
    expect(onGiveUp).toHaveBeenCalledWith('unavailable');
  });

  it('unsubscribing stops pending retries', async () => {
    const onGiveUp = vi.fn();
    let attaches = 0;
    const stop = resilientWatch(
      (_onOk, onErr) => {
        attaches += 1;
        queueMicrotask(() => onErr(denied));
        return vi.fn();
      },
      { onGiveUp, baseDelayMs: 20 },
    );
    await Promise.resolve();
    stop();
    vi.advanceTimersByTime(500);
    expect(attaches).toBe(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });
});
