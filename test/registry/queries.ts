/**
 * The query manifest (TESTING.md §7).
 *
 * The Firestore emulator ignores firestore.indexes.json entirely, so a query
 * that needs a composite index passes every local test and every rules test,
 * then fails in production with FAILED_PRECONDITION the first time a real user
 * hits it. Nothing in the test pyramid catches that — which is why it gets a
 * manifest instead.
 *
 * Every `query(...)` construction in src/ is listed here with the shape of its
 * filters, and test/static/queries.test.ts checks two directions:
 *
 *   - every listed query that needs a composite index has one declared;
 *   - every `query(` callsite in src/ appears in this list, so a new query
 *     cannot be added without deciding whether it needs an index.
 *
 * When adding a query: add it here first, run the gate, and let it tell you
 * whether firestore.indexes.json needs an entry.
 */

export type FilterOp =
  '==' | 'in' | 'array-contains' | 'array-contains-any' | '<' | '<=' | '>' | '>=' | '!=';

export type QueryFilter = { field: string; op: FilterOp };
export type QueryOrder = { field: string; dir: 'asc' | 'desc' };

export type QuerySpec = {
  /** `file:line` of the `query(` call. Line is informational; file is checked. */
  site: string;
  /** Collection id (the last path segment), e.g. 'asks'. */
  collection: string;
  /** COLLECTION for a normal path, COLLECTION_GROUP for collectionGroup(). */
  scope: 'COLLECTION' | 'COLLECTION_GROUP';
  filters: QueryFilter[];
  orderBy: QueryOrder[];
  /** What this query is for — read when deciding if an index is worth it. */
  note?: string;
  /**
   * Set when this query is believed to need an index that is NOT declared and
   * the claim has not been confirmed against the real project. The gate reports
   * these loudly rather than failing, because the emulator cannot settle it.
   */
  unverified?: string;
};

const EQ: FilterOp[] = ['==', 'in'];
const ARRAY: FilterOp[] = ['array-contains', 'array-contains-any'];

export const isEquality = (op: FilterOp): boolean => EQ.includes(op);
export const isArray = (op: FilterOp): boolean => ARRAY.includes(op);
export const isRange = (op: FilterOp): boolean => !isEquality(op) && !isArray(op);

/**
 * Does this query need a composite index?
 *
 * Firestore serves from automatic single-field indexes when the query touches
 * one field only — including a range filter plus an orderBy on that same field,
 * which is why declaring such an index is not merely redundant but a 400 that
 * fails the whole deploy (see the guard in queries.test.ts).
 *
 * Anything spanning two or more distinct fields across filters and ordering
 * needs a composite index. Equality-only queries can sometimes be served by a
 * merge join, but array-contains combined with any other constraint reliably
 * cannot, so this returns true for the multi-field case and the manifest
 * records the exceptions.
 */
export function needsCompositeIndex(q: QuerySpec): boolean {
  const fields = new Set<string>([
    ...q.filters.map((f) => f.field),
    ...q.orderBy.map((o) => o.field),
  ]);
  return fields.size > 1;
}

export const QUERIES: QuerySpec[] = [
  // ---------------------------------------------------------------- asks
  {
    site: 'src/data/asks.ts:38',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: 'in' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Home: asks needing help',
  },
  {
    site: 'src/data/asks.ts:65',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'asc' }],
    note: 'M18: longest-waiting asks, oldest first',
  },
  {
    site: 'src/data/asks.ts:95',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [{ field: 'authorUid', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Your activity: asks you posted',
  },
  {
    site: 'src/data/asks.ts:105',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [{ field: 'claimerUids', op: 'array-contains' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Your activity: asks you claimed',
  },
  {
    site: 'src/data/asks.ts:229',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [
      { field: 'state', op: '==' },
      { field: 'resolvedAt', op: '>=' },
    ],
    orderBy: [],
    note: 'Unblocked this week',
  },
  {
    site: 'src/data/asks.ts:260',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [
      { field: 'authorUid', op: '==' },
      { field: 'state', op: 'in' },
    ],
    orderBy: [],
    note: 'PersonalHome: my open asks. Served by the authorUid+state+createdAt index as a prefix.',
  },
  {
    site: 'src/data/asks.ts:275',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [
      { field: 'claimerUids', op: 'array-contains' },
      { field: 'state', op: 'in' },
    ],
    orderBy: [],
    note: 'PersonalHome: asks I claimed that are still open',
    unverified:
      'No declared index covers claimerUids(array-contains) + state. The only claimerUids ' +
      'index is claimerUids+createdAt, which does not serve this. Reachable from PersonalHome ' +
      'for any member who has claimed an ask, so it would surface as a failed-precondition ' +
      'there. Confirm against the real project before adding an index (2026-09-06).',
  },
  // --------------------------------------------------------------- repos
  {
    site: 'src/data/repos.ts:62',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'lastEventAt', dir: 'desc' }],
    note: 'Repos page: most recent event first',
  },
  {
    site: 'src/data/repos.ts:98',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'ownerUid', op: '==' }],
    orderBy: [],
    note: 'Repos owned by a member',
  },
  {
    site: 'src/data/repos.ts:103',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'githubOwnerLogin', op: '==' }],
    orderBy: [],
    note: 'Repos by GitHub login (adoption paths)',
  },
  {
    site: 'src/data/repos.ts:154',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [
      { field: 'archived', op: '==' },
      { field: 'status', op: 'in' },
    ],
    orderBy: [{ field: 'lastEventAt', dir: 'desc' }],
    note: 'Active this week',
  },
  {
    site: 'src/data/repos.ts:174',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'archived', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'New this week',
  },
  {
    site: 'src/data/repos.ts:202',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'needs', op: 'in' }],
    orderBy: [{ field: 'needsSince', dir: 'asc' }],
    note: 'Wants a hand / matcher, longest-waiting first',
  },
  {
    site: 'src/data/repos.ts:221',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'seekingOwner', op: '==' }],
    orderBy: [],
    note: 'Open for adoption',
  },
  {
    site: 'src/data/repos.ts:270',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [],
    note: 'Subcollection sweep on deregister — limit only',
  },
  {
    site: 'src/poll/engine.ts:92',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'archived', op: '==' }],
    orderBy: [{ field: 'poll.lastPolledAt', dir: 'asc' }],
    note: 'Poll engine: the 20 stalest repos per cycle',
  },
  {
    site: 'src/data/summary.ts:106',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [{ field: 'archived', op: '==' }],
    orderBy: [],
    note: 'Summary rebuild: repo count',
  },
  // --------------------------------------------------------------- ideas
  {
    site: 'src/data/ideas.ts:38',
    collection: 'ideas',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'All ideas, newest first',
  },
  {
    site: 'src/data/ideas.ts:52',
    collection: 'ideas',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Ideas brewing',
  },
  {
    site: 'src/data/ideas.ts:76',
    collection: 'ideas',
    scope: 'COLLECTION',
    filters: [
      { field: 'state', op: '==' },
      { field: 'needs', op: 'in' },
    ],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Idea matcher against helpWith',
  },
  {
    site: 'src/data/ideas.ts:94',
    collection: 'ideas',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: '==' }],
    orderBy: [],
    note: 'Has anything germinated (existence probe)',
  },
  // -------------------------------------------------------- collabRequests
  {
    site: 'src/data/collabs.ts:94',
    collection: 'collabRequests',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Building together',
  },
  {
    site: 'src/data/collabs.ts:113',
    collection: 'collabRequests',
    scope: 'COLLECTION',
    filters: [{ field: 'repoId', op: '==' }],
    orderBy: [],
    note: 'Requests on one repo',
  },
  {
    site: 'src/data/collabs.ts:127',
    collection: 'collabRequests',
    scope: 'COLLECTION',
    filters: [
      { field: 'repoOwnerUid', op: '==' },
      { field: 'state', op: '==' },
    ],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Collab inbox for a repo owner',
  },
  {
    site: 'src/data/collabs.ts:144',
    collection: 'collabRequests',
    scope: 'COLLECTION',
    filters: [{ field: 'requesterUid', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Requests I sent',
  },
  // ------------------------------------------------------------- sessions
  {
    site: 'src/data/sessions.ts:39',
    collection: 'sessions',
    scope: 'COLLECTION',
    filters: [{ field: 'startsAt', op: '>=' }],
    orderBy: [{ field: 'startsAt', dir: 'asc' }],
    note:
      'Coming up. Range + orderBy on ONE field — Firestore serves this from the ' +
      'automatic single-field index, and declaring it 400s the whole deploy.',
  },
  // ---------------------------------------------------------------- polls
  {
    site: 'src/data/polls.ts:33',
    collection: 'polls',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'The open poll',
  },
  // -------------------------------------------------------- announcements
  {
    site: 'src/data/announcements.ts:47',
    collection: 'announcements',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Latest announcement',
  },
  {
    site: 'src/data/announcements.ts:56',
    collection: 'announcements',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Announcement list',
  },
  // ------------------------------------------------------------- comments
  {
    site: 'src/data/comments.ts:48',
    collection: 'comments',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'createdAt', dir: 'asc' }],
    note: 'A thread on one subject',
  },
  {
    site: 'src/data/comments.ts:145',
    collection: 'comments',
    scope: 'COLLECTION_GROUP',
    filters: [{ field: 'gid', op: '==' }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Recent discussion across the circle',
  },
  // ---------------------------------------------------------------- inbox
  {
    site: 'src/data/inbox.ts:84',
    collection: 'comments',
    scope: 'COLLECTION_GROUP',
    filters: [
      { field: 'gid', op: '==' },
      { field: 'mentions', op: 'array-contains' },
    ],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Away-inbox: mentions of me',
  },
  {
    site: 'src/data/inbox.ts:94',
    collection: 'comments',
    scope: 'COLLECTION_GROUP',
    filters: [
      { field: 'gid', op: '==' },
      { field: 'replyToUid', op: '==' },
    ],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Away-inbox: replies to me',
  },
  {
    site: 'src/data/inbox.ts:107',
    collection: 'interests',
    scope: 'COLLECTION_GROUP',
    filters: [
      { field: 'gid', op: '==' },
      { field: 'repoOwnerUid', op: '==' },
    ],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Away-inbox: interest in my things, and M19 RSVPs for free',
  },
  // -------------------------------------------------------------- members
  {
    site: 'src/data/members.ts:31',
    collection: 'members',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'joinedAt', dir: 'asc' }],
    note: 'Members page: the full roster, oldest first',
  },
  {
    site: 'src/data/members.ts:61',
    collection: 'members',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'joinedAt', dir: 'desc' }],
    note: 'M16: newest members only, for the avatar strip and arrivals',
  },
  // -------------------------------------------------------------- invites
  {
    site: 'src/data/invites.ts:70',
    collection: 'invites',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    note: 'Invite manager list',
  },
  // ------------------------------------------------------- housekeeping
  {
    site: 'src/data/deleteGroup.ts:16',
    collection: '*',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [],
    note: 'Delete sweep over an arbitrary subcollection path — limit only',
  },
  {
    site: 'src/data/summary.ts:109',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [{ field: 'state', op: 'in' }],
    orderBy: [],
    note: 'Summary rebuild: open ask count',
  },
  {
    site: 'src/util/anonymize.ts:12',
    collection: 'asks',
    scope: 'COLLECTION',
    filters: [{ field: 'authorUid', op: '==' }],
    orderBy: [],
    note: 'Leave-group: my authored asks, to anonymize',
  },
  // ------------------------------------------------------- view-local reads
  {
    site: 'src/views/AskComposer.tsx:23',
    collection: 'repos',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'lastEventAt', dir: 'desc' }],
    note: 'Ask composer: repos to attach an ask to',
  },
  {
    site: 'src/views/RepoDetail.tsx:93',
    collection: 'events',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [{ field: 'occurredAt', dir: 'desc' }],
    note: 'Repo detail: recent activity',
  },
  // -------------------------------------------------------------- watches
  {
    site: 'src/data/watches.ts:117',
    collection: 'watches',
    scope: 'COLLECTION',
    filters: [],
    orderBy: [],
    note: 'My saved items — limit only',
  },
];
