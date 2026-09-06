/**
 * M16 — pure list arithmetic for the circle summary doc. Kept out of the data
 * layer so the capping and dedupe rules are testable without Firestore, the
 * same way inboxItems.ts and journey.ts are.
 *
 * The lists are capped mirrors, so every edit is "newest first, one entry per
 * subject, trimmed to the cap". A lost update under concurrency drops one card
 * from a display block — priced in by ADR-021, which is why nothing acts on it.
 */

/** Newest-first insert: drop any existing entry for the same subject, then trim. */
export function prependCapped<T>(
  list: readonly T[] | undefined,
  entry: T,
  idOf: (item: T) => string,
  cap: number,
): T[] {
  const id = idOf(entry);
  const rest = (list ?? []).filter((x) => idOf(x) !== id);
  return [entry, ...rest].slice(0, cap);
}

/** Insert several newest-first, preserving the order they were given. */
export function prependAllCapped<T>(
  list: readonly T[] | undefined,
  entries: readonly T[],
  idOf: (item: T) => string,
  cap: number,
): T[] {
  let out = [...(list ?? [])];
  for (const e of [...entries].reverse()) out = prependCapped(out, e, idOf, cap);
  return out;
}

export function dropById<T>(
  list: readonly T[] | undefined,
  id: string,
  idOf: (item: T) => string,
): T[] {
  return (list ?? []).filter((x) => idOf(x) !== id);
}

/**
 * "New this week" is a claim about time, so entries age out of the mirror
 * rather than sitting there forever. Pruned at write time — there is no
 * scheduled job to do it (no server), and reading is not the place to mutate.
 */
export function pruneOlderThan<T>(
  list: readonly T[] | undefined,
  atOf: (item: T) => { toMillis: () => number } | null | undefined,
  maxAgeMs: number,
  now: number,
): T[] {
  return (list ?? []).filter((x) => {
    const ms = atOf(x)?.toMillis();
    // An entry with no timestamp predates the field; keep it rather than
    // silently deleting something we cannot date.
    return ms === undefined || now - ms <= maxAgeMs;
  });
}
