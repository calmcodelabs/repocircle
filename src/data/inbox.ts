import {
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  isNewSince,
  mergeInbox,
  parseSubjectPath,
  subjectHref,
  type InboxItem,
  type InboxKind,
} from '../util/inboxItems';

/**
 * M12 — "While you were away": replies to me, mentions of me, interest in my
 * repos. One-shot getDocs per group (an inbox is a visit-time digest, not a
 * live wire), each query pinned to a gid so rules can prove membership.
 */
const PER_QUERY = 8;
const GROUP_CAP = 8;

type RawDoc = {
  ref: { path: string };
  id: string;
  data: () => Record<string, unknown>;
};

function toCandidate(
  d: RawDoc,
  kind: InboxKind,
  lastSeen: Timestamp | null | undefined,
): (InboxItem & { actorUid: string }) | null {
  const s = parseSubjectPath(d.ref.path);
  if (!s) return null;
  const data = d.data();
  const at = (data.createdAt ?? null) as Timestamp | null;
  const actorUid = kind === 'interest' ? d.id : ((data.authorUid ?? '') as string);
  const actorLogin = ((kind === 'interest' ? data.login : data.authorLogin) ?? '') as string;
  const avatar = (kind === 'interest' ? data.avatarUrl : data.authorAvatarUrl) as
    string | undefined;
  const body = ((kind === 'interest' ? data.note : data.body) ?? '') as string;
  return {
    key: d.ref.path,
    kind,
    gid: s.gid,
    actorUid,
    actorLogin,
    actorAvatarUrl: avatar,
    body: body.slice(0, 160),
    href: subjectHref(s),
    at,
    isNew: isNewSince(at, lastSeen),
  };
}

export async function fetchInbox(
  groupIds: string[],
  myUid: string,
  myLogin: string,
  lastSeen: Timestamp | null | undefined,
): Promise<InboxItem[]> {
  const gids = groupIds.slice(0, GROUP_CAP);
  const candidates: Array<InboxItem & { actorUid: string }> = [];
  await Promise.all(
    gids.flatMap((gid) => {
      const comments = collectionGroup(db(), 'comments');
      const interests = collectionGroup(db(), 'interests');
      const runs: Array<[InboxKind, ReturnType<typeof query>]> = [
        [
          'mention',
          query(
            comments,
            where('gid', '==', gid),
            where('mentions', 'array-contains', myLogin),
            orderBy('createdAt', 'desc'),
            limit(PER_QUERY),
          ),
        ],
        [
          'reply',
          query(
            comments,
            where('gid', '==', gid),
            where('replyToUid', '==', myUid),
            orderBy('createdAt', 'desc'),
            limit(PER_QUERY),
          ),
        ],
        [
          'interest',
          query(
            interests,
            where('gid', '==', gid),
            where('repoOwnerUid', '==', myUid),
            orderBy('createdAt', 'desc'),
            limit(PER_QUERY),
          ),
        ],
      ];
      return runs.map(([kind, q]) =>
        getDocs(q)
          .then((snap) => {
            for (const d of snap.docs) {
              const c = toCandidate(d as unknown as RawDoc, kind, lastSeen);
              if (c) candidates.push(c);
            }
          })
          // A group mid-outage or freshly-left must not sink the whole inbox.
          .catch(() => undefined),
      );
    }),
  );
  return mergeInbox(candidates, myUid);
}
