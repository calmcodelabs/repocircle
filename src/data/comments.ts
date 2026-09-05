import {
  collection,
  collectionGroup,
  doc,
  where,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { randomToken } from './ids';
import type { MyProfile } from './types';
import type { Timestamp } from 'firebase/firestore';

export type CommentSubject = { kind: 'repo' | 'ask'; id: string };

export type Comment = {
  id: string;
  authorUid: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  body: string;
  parentId?: string | null;
  mentions?: string[];
  repoRefs?: string[];
  pinned: boolean;
  createdAt: Timestamp | null;
  editedAt?: Timestamp | null;
};

function basePath(gid: string, subject: CommentSubject): string {
  return subject.kind === 'repo'
    ? `groups/${gid}/repos/${subject.id}`
    : `groups/${gid}/asks/${subject.id}`;
}

export function watchComments(
  gid: string,
  subject: CommentSubject,
  cb: (list: Comment[]) => void,
  onError?: (code: string) => void,
): Unsubscribe {
  const q = query(
    collection(db(), `${basePath(gid, subject)}/comments`),
    orderBy('createdAt', 'asc'),
    limit(200),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, 'id'>) }))),
    (e) => onError?.(e.code),
  );
}

export async function addComment(
  gid: string,
  subject: CommentSubject,
  profile: MyProfile,
  input: {
    body: string;
    parentId?: string | null;
    mentions: string[];
    repoRefs: string[];
    /** Author of the comment being replied to — routes their away-inbox. */
    replyToUid?: string | null;
  },
): Promise<string> {
  const id = randomToken(16);
  const batch = writeBatch(db());
  batch.set(doc(db(), `${basePath(gid, subject)}/comments/${id}`), {
    authorUid: profile.uid,
    authorLogin: profile.login,
    authorAvatarUrl: profile.avatarUrl,
    body: input.body.slice(0, 1000),
    parentId: input.parentId ?? null,
    mentions: input.mentions,
    repoRefs: input.repoRefs,
    pinned: false,
    // gid is denormalized for collection-group reads; rules pin it to the path.
    gid,
    ...(input.replyToUid ? { replyToUid: input.replyToUid } : {}),
    createdAt: serverTimestamp(),
    v: 1,
  });
  // Mirror on the parent so cards can show "4 comments" without a query.
  batch.update(doc(db(), basePath(gid, subject)), { commentCount: increment(1) });
  await batch.commit();
  return id;
}

export async function editComment(
  gid: string,
  subject: CommentSubject,
  commentId: string,
  body: string,
  mentions: string[],
  repoRefs: string[],
): Promise<void> {
  await updateDoc(doc(db(), `${basePath(gid, subject)}/comments/${commentId}`), {
    body: body.slice(0, 1000),
    mentions,
    repoRefs,
    editedAt: serverTimestamp(),
  });
}

export async function deleteComment(
  gid: string,
  subject: CommentSubject,
  commentId: string,
): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(doc(db(), `${basePath(gid, subject)}/comments/${commentId}`));
  batch.update(doc(db(), basePath(gid, subject)), { commentCount: increment(-1) });
  await batch.commit();
}

export async function setPinned(
  gid: string,
  subject: CommentSubject,
  commentId: string,
  pinned: boolean,
): Promise<void> {
  await updateDoc(doc(db(), `${basePath(gid, subject)}/comments/${commentId}`), { pinned });
}

export type RecentComment = Comment & { repoId?: string; subjectLabel?: string };

/**
 * Latest discussion anywhere in the circle — the closest thing to a reason to
 * open the app daily, without inventing notifications.
 */
export function watchRecentComments(
  gid: string,
  cb: (list: RecentComment[]) => void,
  onError?: (code: string) => void,
): Unsubscribe {
  // gid equality is what lets rules prove membership for a collection-group
  // read — without it the whole query is denied server-side (M12 fix).
  const q = query(
    collectionGroup(db(), 'comments'),
    where('gid', '==', gid),
    orderBy('createdAt', 'desc'),
    limit(30),
  );
  return onSnapshot(
    q,
    (snap) => {
      const mine = snap.docs.filter((d) => d.ref.path.startsWith(`groups/${gid}/`));
      cb(
        mine.slice(0, 8).map((d) => {
          const parts = d.ref.path.split('/');
          const kind = parts[2]; // repos | asks
          const parentId = parts[3];
          return {
            id: d.id,
            ...(d.data() as Omit<Comment, 'id'>),
            repoId: kind === 'repos' ? parentId : undefined,
            subjectLabel: kind === 'repos' ? 'repo' : 'ask',
          };
        }),
      );
    },
    (e) => onError?.(e.code),
  );
}
