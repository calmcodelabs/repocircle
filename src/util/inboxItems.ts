import type { Timestamp } from 'firebase/firestore';

/**
 * M12 — pure derivation for the away-inbox. Everything here is testable
 * without Firestore: path parsing, merging, newness, self-filtering.
 */
export type InboxKind = 'mention' | 'reply' | 'interest';

export type InboxItem = {
  key: string; // doc path — stable dedupe key
  kind: InboxKind;
  /** What the item is about — copy differs ("your repo" vs "your idea"). */
  subject: SubjectKind;
  gid: string;
  actorLogin: string;
  actorAvatarUrl?: string;
  /** Comment preview or interest note; already plain text upstream. */
  body?: string;
  /** App link to where it happened. */
  href: string;
  at: Timestamp | null;
  isNew: boolean;
};

export type SubjectKind = 'repo' | 'ask' | 'idea';
export type ParsedSubject = { gid: string; kind: SubjectKind; subjectId: string } | null;

/** groups/G/(repos|asks|ideas)/ID/(comments|interests)/X → where that lives in the app. */
export function parseSubjectPath(path: string): ParsedSubject {
  const p = path.split('/');
  if (p[0] !== 'groups' || !p[1] || !p[3]) return null;
  if (p[2] === 'repos') return { gid: p[1], kind: 'repo', subjectId: p[3] };
  if (p[2] === 'asks') return { gid: p[1], kind: 'ask', subjectId: p[3] };
  if (p[2] === 'ideas') return { gid: p[1], kind: 'idea', subjectId: p[3] };
  return null;
}

export function subjectHref(s: Exclude<ParsedSubject, null>): string {
  const seg = s.kind === 'repo' ? 'repo' : s.kind === 'ask' ? 'ask' : 'idea';
  return `#/g/${s.gid}/${seg}/${s.subjectId}`;
}

/**
 * Merge raw candidate items: drop my own actions, dedupe by path (a reply that
 * also mentions me is one moment, and 'reply' reads better than 'mention'),
 * newest first, capped.
 */
export function mergeInbox(
  candidates: Array<InboxItem & { actorUid: string }>,
  myUid: string,
  cap = 20,
): InboxItem[] {
  const byKey = new Map<string, InboxItem & { actorUid: string }>();
  const rank: Record<InboxKind, number> = { reply: 0, interest: 1, mention: 2 };
  for (const c of candidates) {
    if (c.actorUid === myUid) continue;
    const prev = byKey.get(c.key);
    if (!prev || rank[c.kind] < rank[prev.kind]) byKey.set(c.key, c);
  }
  return [...byKey.values()]
    .sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0))
    .slice(0, cap)
    .map(({ actorUid: _drop, ...item }) => item);
}

export function isNewSince(at: Timestamp | null, lastSeen: Timestamp | null | undefined): boolean {
  if (!at) return false;
  if (!lastSeen) return true; // never marked seen — everything recent is news
  return at.toMillis() > lastSeen.toMillis();
}

/**
 * The server watermark (users.lastSeenAt) advances at most hourly to save
 * writes, so "new" dots survived reloads inside that hour. A per-device,
 * per-account watermark closes the gap: anything older than the last local
 * visit stops being new, whatever the server thinks.
 */
export function applyLocalWatermark(items: InboxItem[], localSeenMs: number): InboxItem[] {
  if (!localSeenMs) return items;
  return items.map((i) =>
    i.isNew && (i.at?.toMillis() ?? 0) <= localSeenMs ? { ...i, isNew: false } : i,
  );
}
