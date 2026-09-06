import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { audit } from './audit';
import { randomToken } from './ids';
import { resilientWatch } from './resilientWatch';
import type { Idea, MyProfile, Repo, RepoInterest, RepoNeed } from './types';

/**
 * M15 — ideas: repos minus the code. Same vocabulary (pitch/needs/tags), same
 * mechanics (comments, interests, matcher, inbox), one lifecycle:
 * open → germinated (linked to a real repo) | parked. Germination links both
 * ways and leaves the idea doc in place — facts never move (ADR-019).
 */
export function watchIdeas(
  gid: string,
  cb: (ideas: Idea[]) => void,
  onError: (code: string) => void,
): Unsubscribe {
  return resilientWatch(
    (onOk, onErr) =>
      onSnapshot(
        collection(db(), `groups/${gid}/ideas`),
        (snap) => {
          onOk();
          const ideas = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Idea, 'id'>) }));
          ideas.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
          cb(ideas);
        },
        onErr,
      ),
    { onGiveUp: onError },
  );
}

export async function addIdea(
  gid: string,
  profile: MyProfile,
  input: {
    title: string;
    pitch: string;
    detail?: string;
    domainTags: string[];
    needs: RepoNeed | null;
  },
): Promise<string> {
  const id = randomToken(16);
  await setDoc(doc(db(), `groups/${gid}/ideas/${id}`), {
    title: input.title.trim().slice(0, 80),
    pitch: input.pitch.trim().slice(0, 200),
    ...(input.detail?.trim() ? { detail: input.detail.trim().slice(0, 1000) } : {}),
    domainTags: input.domainTags,
    needs: input.needs,
    authorUid: profile.uid,
    authorLogin: profile.login,
    authorAvatarUrl: profile.avatarUrl,
    state: 'open',
    interestCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    v: 1,
  });
  return id;
}

export async function editIdea(
  gid: string,
  ideaId: string,
  input: {
    title: string;
    pitch: string;
    detail?: string;
    domainTags: string[];
    needs: RepoNeed | null;
  },
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/ideas/${ideaId}`), {
    title: input.title.trim().slice(0, 80),
    pitch: input.pitch.trim().slice(0, 200),
    detail: input.detail?.trim() ? input.detail.trim().slice(0, 1000) : null,
    domainTags: input.domainTags,
    needs: input.needs,
  });
}

export async function setIdeaState(
  gid: string,
  ideaId: string,
  state: 'open' | 'parked',
): Promise<void> {
  await updateDoc(doc(db(), `groups/${gid}/ideas/${ideaId}`), { state });
}

export async function deleteIdea(gid: string, ideaId: string): Promise<void> {
  await deleteDoc(doc(db(), `groups/${gid}/ideas/${ideaId}`));
}

/**
 * It's real now. One batch: the idea records where it went, the repo records
 * where it came from. Allowed (rules-enforced) for the idea's author, an
 * admin, or the linked repo's owner — someone else building your idea is the
 * value moment, not an edge case.
 */
export async function germinateIdea(
  gid: string,
  actor: MyProfile,
  idea: Idea,
  repo: Pick<Repo, 'id' | 'fullName'>,
): Promise<void> {
  const batch = writeBatch(db());
  batch.update(doc(db(), `groups/${gid}/ideas/${idea.id}`), {
    state: 'germinated',
    repoId: repo.id,
    repoFullName: repo.fullName,
    germinatedAt: serverTimestamp(),
    germinatedByUid: actor.uid,
    germinatedByLogin: actor.login,
  });
  batch.update(doc(db(), `groups/${gid}/repos/${repo.id}`), {
    ideaId: idea.id,
    ideaByLogin: idea.authorLogin,
  });
  await batch.commit();
  audit(gid, actor, 'idea_germinated', 'idea', idea.title, `→ ${repo.fullName}`);
}

// ---- interests on an idea — same shape as repos', routed to the author ----

export function watchIdeaInterests(
  gid: string,
  ideaId: string,
  cb: (list: RepoInterest[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db(), `groups/${gid}/ideas/${ideaId}/interests`), (snap) =>
    cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<RepoInterest, 'uid'>) }))),
  );
}

export async function addIdeaInterest(gid: string, idea: Idea, profile: MyProfile): Promise<void> {
  const batch = writeBatch(db());
  batch.set(doc(db(), `groups/${gid}/ideas/${idea.id}/interests/${profile.uid}`), {
    login: profile.login,
    avatarUrl: profile.avatarUrl,
    gid,
    repoOwnerUid: idea.authorUid, // routes the author's away-inbox; rules verify
    createdAt: serverTimestamp(),
    v: 1,
  });
  batch.update(doc(db(), `groups/${gid}/ideas/${idea.id}`), { interestCount: increment(1) });
  await batch.commit();
}

export async function removeIdeaInterest(gid: string, ideaId: string, uid: string): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(doc(db(), `groups/${gid}/ideas/${ideaId}/interests/${uid}`));
  batch.update(doc(db(), `groups/${gid}/ideas/${ideaId}`), { interestCount: increment(-1) });
  await batch.commit();
}
