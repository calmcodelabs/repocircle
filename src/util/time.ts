import type { Timestamp } from 'firebase/firestore';

/** "in 6d" / "in 3h" / "4d ago" / "just now" — compact, no library. */
export function relTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return relMs(ts.toMillis());
}

export function relMs(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const unit =
    abs >= 86_400_000
      ? `${Math.round(abs / 86_400_000)}d`
      : abs >= 3_600_000
        ? `${Math.round(abs / 3_600_000)}h`
        : abs >= 60_000
          ? `${Math.round(abs / 60_000)}m`
          : null;
  if (!unit) return diff >= 0 ? 'now' : 'just now';
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}
