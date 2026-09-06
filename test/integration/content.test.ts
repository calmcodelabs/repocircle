import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import {
  asAdmin,
  assertEmulators,
  clearData,
  closeHarness,
  inspectAll,
  inspectDoc,
  rejects,
  seedSize,
  signInAs,
} from './harness.ts';
import {
  addComment,
  deleteComment,
  editComment,
  setPinned,
  type CommentSubject,
} from '../../src/data/comments';
import { extractMentions, extractRepoRefs } from '../../src/util/mentions';
import {
  addIdea,
  addIdeaInterest,
  deleteIdea,
  editIdea,
  germinateIdea,
  removeIdeaInterest,
  setIdeaState,
} from '../../src/data/ideas';
import {
  deleteAnnouncement,
  fetchAnnouncements,
  postAnnouncement,
} from '../../src/data/announcements';
import type { MyProfile } from '../../src/data/types';

/**
 * The content primitives, through the app's own write paths.
 *
 * Comments, ideas and announcements are where a member's words live, so the
 * interesting assertions are about what survives and who may change it —
 * editing someone else's comment, deleting an idea that has become a repo,
 * posting an announcement as a non-admin.
 */

const profile = (uid: string): MyProfile => ({
  uid,
  login: uid,
  name: uid,
  avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
});

const repoSubject = (repoId: string): CommentSubject => ({ kind: 'repo', id: repoId });

/**
 * What the composer builds before calling addComment.
 *
 * Mentions and repo refs are resolved against the circle's actual members and
 * repos, not parsed blindly — so `@nobody` is left as plain text and never
 * lands in anyone's away-inbox.
 */
const commentInput = (body: string, logins: string[] = [], repos: string[] = []) => ({
  body,
  parentId: null,
  mentions: extractMentions(body, logins),
  repoRefs: extractRepoRefs(body, repos),
});

describe('[comments] a thread on a repo', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('posts a comment and counts it on the subject', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    const before = (await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.commentCount ?? 0;
    await signInAs('mira-t');

    await addComment(
      s.gid,
      repoSubject(repoId),
      profile('mira-t'),
      commentInput('Does this handle 500 nodes?'),
    );

    const comments = await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.data.body).toBe('Does this handle 500 nodes?');
    expect(comments[0]!.data.authorUid).toBe('mira-t');
    // Class C: the mirror moves by increment, never by read-modify-write.
    expect((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.commentCount).toBe(
      Number(before) + 1,
    );
  });

  it('records mentions so the away-inbox can find them', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    await signInAs('mira-t');
    await addComment(
      s.gid,
      repoSubject(repoId),
      profile('mira-t'),
      commentInput('nice one @n-rahman and @nobody-here', s.facts.memberUids),
    );
    const comments = await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`);
    expect(comments[0]!.data.mentions).toContain('n-rahman');
    // Resolved against the roster: a stranger's handle stays plain text rather
    // than routing a notification to nobody.
    expect(comments[0]!.data.mentions).not.toContain('nobody-here');
    // gid is denormalised onto the comment precisely so a collection-group
    // query can scope to one circle (M12).
    expect(comments[0]!.data.gid).toBe(s.gid);
  });

  it('the author can edit their own comment', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    await signInAs('mira-t');
    await addComment(s.gid, repoSubject(repoId), profile('mira-t'), commentInput('first thought'));
    const id = (await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`))[0]!.id;

    await editComment(s.gid, repoSubject(repoId), id, 'a better thought', [], []);

    const after = await inspectDoc(`groups/${s.gid}/repos/${repoId}/comments/${id}`);
    expect(after?.body).toBe('a better thought');
    expect(after?.editedAt).toBeTruthy();
  });

  it('nobody else can edit it', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    await signInAs('mira-t');
    await addComment(s.gid, repoSubject(repoId), profile('mira-t'), commentInput('mine'));
    const id = (await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`))[0]!.id;

    await signInAs('dev-anand');
    await rejects(editComment(s.gid, repoSubject(repoId), id, 'hijacked', [], []));
    expect((await inspectDoc(`groups/${s.gid}/repos/${repoId}/comments/${id}`))?.body).toBe('mine');
  });

  it('deleting a comment takes the count back down', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    await signInAs('mira-t');
    await addComment(s.gid, repoSubject(repoId), profile('mira-t'), commentInput('to be removed'));
    const id = (await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`))[0]!.id;
    const mid = Number((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.commentCount);

    await deleteComment(s.gid, repoSubject(repoId), id);

    expect(await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`)).toHaveLength(0);
    expect((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.commentCount).toBe(mid - 1);
  });

  it('an admin can pin a comment, a member cannot', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    await signInAs('mira-t');
    await addComment(
      s.gid,
      repoSubject(repoId),
      profile('mira-t'),
      commentInput('worth keeping at the top'),
    );
    const id = (await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`))[0]!.id;

    await rejects(setPinned(s.gid, repoSubject(repoId), id, true));

    await signInAs(s.facts.adminUid);
    await setPinned(s.gid, repoSubject(repoId), id, true);
    expect((await inspectDoc(`groups/${s.gid}/repos/${repoId}/comments/${id}`))?.pinned).toBe(true);
  });

  it('a guest cannot comment at all', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    await asAdmin(async (fs) => {
      await setDoc(doc(fs, `groups/${s.gid}/members/gia`), {
        role: 'guest',
        login: 'gia',
        name: 'gia',
        avatarUrl: '',
        availability: { status: 'free' },
        helpWith: [],
        learning: [],
        checklist: {},
        joinedAt: Timestamp.now(),
        joinedVia: 'seed',
        v: 1,
      });
    });
    await signInAs('gia');
    await rejects(addComment(s.gid, repoSubject(repoId), profile('gia'), commentInput('can I?')));
  });
});

describe('[ideas] an idea before it is a repo', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('is posted with its pitch and opens in the open state', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');

    await addIdea(s.gid, profile('mira-t'), {
      title: 'A shared reading list',
      pitch: 'Something that survives the semester',
      detail: 'Nobody maintains it, that is the point',
      domainTags: ['web'],
      needs: 'frontend',
    });

    const ideas = await inspectAll(`groups/${s.gid}/ideas`);
    const mine = ideas.find((i) => i.data.title === 'A shared reading list');
    expect(mine).toBeTruthy();
    expect(mine!.data.state).toBe('open');
    expect(mine!.data.authorUid).toBe('mira-t');
    expect(mine!.data.interestCount).toBe(0);
  });

  it('the author can edit and park it', async () => {
    const s = await seedSize('demo');
    const ideaId = s.facts.ideaIds[0]!;
    const author = String((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.authorUid);
    await signInAs(author);

    await editIdea(s.gid, ideaId, {
      title: 'Renamed',
      pitch: 'Sharper pitch',
      domainTags: ['web'],
      needs: null,
    });
    expect((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.title).toBe('Renamed');

    await setIdeaState(s.gid, ideaId, 'parked');
    expect((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.state).toBe('parked');
  });

  it('a plain member cannot edit someone else’s idea', async () => {
    const s = await seedSize('demo');
    const ideaId = s.facts.ideaIds[0]!;
    const author = String((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.authorUid);
    // Not the author and not the admin — admins may edit by design, below.
    const other = s.facts.memberUids.find((u) => u !== author && u !== s.facts.adminUid)!;
    await signInAs(other);
    await rejects(
      editIdea(s.gid, ideaId, {
        title: 'not yours',
        pitch: 'not yours',
        domainTags: [],
        needs: null,
      }),
    );
    expect((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.title).not.toBe('not yours');
  });

  it('an admin may edit it, which is deliberate', async () => {
    // The rule is `authorUid == me() || isAdmin(gid)`: moderation of a small
    // circle is a real job (POSITIONING §5.5), and an admin fixing a typo is
    // not the same as an admin faking a germination — the latter is a separate
    // branch with its own conditions.
    const s = await seedSize('demo');
    const ideaId = s.facts.ideaIds[0]!;
    await signInAs(s.facts.adminUid);
    await editIdea(s.gid, ideaId, {
      title: 'Tidied by an admin',
      pitch: 'Same idea, clearer words',
      domainTags: ['web'],
      needs: null,
    });
    const after = await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`);
    expect(after?.title).toBe('Tidied by an admin');
    // The author is never rewritten — credit survives moderation.
    expect(after?.authorUid).not.toBe(s.facts.adminUid);
  });

  it('interest is one document per member, and counted', async () => {
    const s = await seedSize('demo');
    const ideaId = s.facts.ideaIds[0]!;
    const before = Number(
      (await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.interestCount ?? 0,
    );
    await signInAs('mira-t');

    const idea = { id: ideaId, ...(await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`)) } as never;
    await addIdeaInterest(s.gid, idea, profile('mira-t'));
    expect((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.interestCount).toBe(before + 1);
    const raised = await inspectAll(`groups/${s.gid}/ideas/${ideaId}/interests`);
    expect(raised.map((r) => r.id)).toContain('mira-t');

    await removeIdeaInterest(s.gid, ideaId, 'mira-t');
    expect((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.interestCount).toBe(before);
  });

  it('germinating links the idea to the repo in both directions', async () => {
    // ADR-020: germination links, it never migrates. The idea survives as the
    // record that this started as somebody's suggestion.
    const s = await seedSize('demo');
    const ideaId = s.facts.ideaIds[0]!;
    const repoId = s.facts.repoIds[2]!;
    const author = String((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.authorUid);
    const repo = await inspectDoc(`groups/${s.gid}/repos/${repoId}`);
    await signInAs(s.facts.adminUid);

    await germinateIdea(
      s.gid,
      profile(s.facts.adminUid),
      { id: ideaId, ...(await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`)) } as never,
      { id: repoId, fullName: String(repo?.fullName) },
    );

    const idea = await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`);
    expect(idea?.state).toBe('germinated');
    expect(idea?.repoId).toBe(repoId);
    // The idea document is still there, still crediting its author.
    expect(idea?.authorUid).toBe(author);

    const linked = await inspectDoc(`groups/${s.gid}/repos/${repoId}`);
    expect(linked?.ideaId).toBe(ideaId);
    expect(linked?.ideaByLogin).toBe(author);
  });

  it('the author can delete their idea', async () => {
    const s = await seedSize('demo');
    const ideaId = s.facts.ideaIds[1]!;
    const author = String((await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`))?.authorUid);
    await signInAs(author);
    await deleteIdea(s.gid, ideaId);
    expect(await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`)).toBeNull();
  });
});

describe('[announcements] admin-only, append-only', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('an admin can post one', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    await postAnnouncement(s.gid, profile(s.facts.adminUid), 'Demo night moved to Thursday.');
    const all = await inspectAll(`groups/${s.gid}/announcements`);
    expect(all.some((a) => a.data.body === 'Demo night moved to Thursday.')).toBe(true);
  });

  it('a member cannot', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await rejects(postAnnouncement(s.gid, profile('mira-t'), 'I hereby announce'));
  });

  it('members can read them, newest first', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const list = await fetchAnnouncements(s.gid, 10);
    expect(list.length).toBeGreaterThan(0);
    const times = list.map((a) => a.createdAt?.toMillis() ?? 0);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('an admin can delete one, a member cannot', async () => {
    const s = await seedSize('demo');
    const id = s.facts.announcementId!;
    await signInAs('mira-t');
    await rejects(deleteAnnouncement(s.gid, id));

    await signInAs(s.facts.adminUid);
    await deleteAnnouncement(s.gid, id);
    expect(await inspectDoc(`groups/${s.gid}/announcements/${id}`)).toBeNull();
  });
});
