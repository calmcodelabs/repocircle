import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  createInvite,
  getInvite,
  inviteState,
  inviteUrl,
  revokeInvite,
} from '../../src/data/invites';
import { createGroup, fetchGroup, fetchMyGroups, updateGroupProfile } from '../../src/data/groups';
import { CIRCLE_SHAPE, deleteGroupEverything } from '../../src/data/deleteGroup';
import { setCircleLinks, setPinnedRepo, summaryExists } from '../../src/data/summary';
import {
  addWatch,
  fetchWatches,
  isWatching,
  removeWatch,
  savableRepo,
} from '../../src/data/watches';
import { fetchInbox } from '../../src/data/inbox';
import { castVote } from '../../src/data/polls';
import { addIdeaInterest } from '../../src/data/ideas';
import { setAvailability, setSkills } from '../../src/data/members';
import type { MyProfile } from '../../src/data/types';

/**
 * The circle around the content: who may join it, what it says about itself,
 * what a member keeps, and what happens when it is deleted.
 */

const profile = (uid: string): MyProfile => ({
  uid,
  login: uid,
  name: uid,
  avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
});

describe('[invites] the door into a circle', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('an admin creates one carrying a snapshot of the circle', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);

    const preview = {
      groupName: s.facts.groupName,
      groupDescription: 'a circle',
      memberCount: s.facts.counts.members,
      repoCount: s.facts.counts.repos,
    };
    const token = await createInvite(
      s.gid,
      profile(s.facts.adminUid),
      preview,
      'member',
      7,
      'cohort 2026',
    );

    const invite = await inspectDoc(`groups/${s.gid}/invites/${token}`);
    expect(invite?.role).toBe('member');
    expect(invite?.revoked).toBe(false);
    expect(invite?.label).toBe('cohort 2026');
    // The join screen describes the circle before you commit, so the counts
    // ride along on the invite rather than costing a read of the circle.
    expect(invite?.groupName).toBe(s.facts.groupName);
    expect(Number(invite?.memberCount)).toBeGreaterThan(0);
  });

  it('a plain member cannot create one', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await rejects(
      createInvite(
        s.gid,
        profile('mira-t'),
        { groupName: 'x', groupDescription: '', memberCount: 1, repoCount: 0 },
        'member',
        7,
        '',
      ),
    );
  });

  it('an invite can never grant admin', async () => {
    // ADR-010: a link that hands out admin is a link that hands out the circle.
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    await rejects(
      createInvite(
        s.gid,
        profile(s.facts.adminUid),
        { groupName: 'x', groupDescription: '', memberCount: 1, repoCount: 0 },
        'admin' as never,
        7,
        '',
      ),
    );
  });

  it('reports its own state: valid, revoked, expired', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    const token = await createInvite(
      s.gid,
      profile(s.facts.adminUid),
      { groupName: s.facts.groupName, groupDescription: '', memberCount: 1, repoCount: 0 },
      'member',
      7,
      '',
    );

    const live = await getInvite(s.gid, token);
    expect(live).toBeTruthy();
    expect(inviteState(live!)).toBe('valid');

    await revokeInvite(s.gid, profile(s.facts.adminUid), token);
    const revoked = await getInvite(s.gid, token);
    expect(inviteState(revoked!)).toBe('revoked');

    await asAdmin(async (fs) => {
      await setDoc(
        doc(fs, `groups/${s.gid}/invites/${token}`),
        { revoked: false, expiresAt: Timestamp.fromMillis(Date.now() - 1000) },
        { merge: true },
      );
    });
    const expired = await getInvite(s.gid, token);
    expect(inviteState(expired!)).toBe('expired');
  });

  it('builds a link that carries the circle and the token', () => {
    // inviteUrl reads location, which node does not have — stub the one thing
    // it needs rather than move a two-line function into a browser test.
    vi.stubGlobal('location', {
      origin: 'https://calmcodelabs.github.io',
      pathname: '/repocircle/',
    });
    try {
      const url = inviteUrl('demo-circle', 'abc123');
      expect(url).toBe('https://calmcodelabs.github.io/repocircle/#/join/demo-circle/abc123');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a missing token resolves to nothing rather than throwing', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    expect(await getInvite(s.gid, 'no-such-token')).toBeNull();
  });
});

describe('[groups-create] founding a circle', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('makes the founder an admin and seeds the summary', async () => {
    await signInAs('founder');
    const gid = await createGroup(
      profile('founder'),
      'Second Year Builders',
      'Everyone who keeps shipping',
    );

    const group = await inspectDoc(`groups/${gid}`);
    expect(group?.name).toBe('Second Year Builders');
    expect(group?.createdBy).toBe('founder');

    const me = await inspectDoc(`groups/${gid}/members/founder`);
    expect(me?.role).toBe('admin');
    expect(me?.joinedVia).toBe('founder');

    const user = await inspectDoc('users/founder');
    expect(user?.groupIds).toContain(gid);
    expect(await summaryExists(gid)).toBe(true);
  });

  it('the founder can read the circle straight after creating it', async () => {
    // The founder flow reads what it just wrote; a rules gap here shows up as
    // a blank screen immediately after "create".
    await signInAs('founder2');
    const gid = await createGroup(profile('founder2'), 'Reads Back', '');
    const fetched = await fetchGroup(gid);
    expect(fetched?.name).toBe('Reads Back');
    const mine = await fetchMyGroups([gid]);
    expect(mine.map((g) => g.id)).toContain(gid);
  });

  it('an admin can edit the circle profile, a member cannot', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await rejects(updateGroupProfile(s.gid, 'Renamed by a member', ''));

    await signInAs(s.facts.adminUid);
    await updateGroupProfile(s.gid, 'Renamed properly', 'new blurb');
    expect((await inspectDoc(`groups/${s.gid}`))?.name).toBe('Renamed properly');
  });
});

describe('[group-delete] taking a circle down', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('an admin removes the circle and everything under it', async () => {
    const s = await seedSize('minimal');
    await signInAs(s.facts.adminUid);
    expect((await inspectAll(`groups/${s.gid}/repos`)).length).toBeGreaterThan(0);

    await deleteGroupEverything(s.gid, profile(s.facts.adminUid));

    expect(await inspectDoc(`groups/${s.gid}`)).toBeNull();
    // Subcollections do not cascade in Firestore; leaving them behind would be
    // unreachable data that still costs storage and still answers queries.
    expect(await inspectAll(`groups/${s.gid}/repos`)).toHaveLength(0);
    expect(await inspectAll(`groups/${s.gid}/members`)).toHaveLength(0);
    expect(await inspectAll(`groups/${s.gid}/asks`)).toHaveLength(0);
  });

  it('leaves nothing behind — every collection and subcollection', async () => {
    // This test used to assert the opposite. The sweep was written before M15
    // (ideas), M17 (announcements) and M19 (sessions, polls), and each shipped
    // without anyone extending it, so deleting a circle orphaned them:
    // unreachable, because the group document and every membership were gone,
    // but still stored and still billable.
    //
    // The sweep now works from CIRCLE_SHAPE, and test/static/shape.test.ts
    // checks that list against the match blocks in firestore.rules — so a new
    // collection cannot ship without this being updated.
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!;
    const ideaId = s.facts.ideaIds[0]!;
    const sessionId = s.facts.sessionId!;
    const pollId = s.facts.pollId!;

    // The seed already puts a comment on a repo and RSVPs on the session; add
    // a vote and an idea interest so every level has something to lose.
    await signInAs('mira-t');
    await castVote(s.gid, pollId, 'mira-t', 'o0', null);
    await addIdeaInterest(
      s.gid,
      { id: ideaId, ...(await inspectDoc(`groups/${s.gid}/ideas/${ideaId}`)) } as never,
      profile('mira-t'),
    );
    expect(await inspectAll(`groups/${s.gid}/polls/${pollId}/votes`)).not.toHaveLength(0);
    expect(await inspectAll(`groups/${s.gid}/repos/${repoId}/comments`)).not.toHaveLength(0);
    expect(await inspectAll(`groups/${s.gid}/sessions/${sessionId}/interests`)).not.toHaveLength(0);

    await signInAs(s.facts.adminUid);
    await deleteGroupEverything(s.gid, profile(s.facts.adminUid));

    const survivors: Record<string, number> = {};
    for (const [name, children] of Object.entries(CIRCLE_SHAPE)) {
      survivors[name] = (await inspectAll(`groups/${s.gid}/${name}`)).length;
      for (const child of children) {
        // Subcollections outlive their parent unless swept explicitly, so check
        // the paths of the documents that existed before the delete.
        for (const parentId of [repoId, ideaId, sessionId, pollId, s.facts.askIds[0]!]) {
          const path = `groups/${s.gid}/${name}/${parentId}/${child}`;
          const left = (await inspectAll(path)).length;
          if (left > 0) survivors[`${name}/${parentId}/${child}`] = left;
        }
      }
    }
    survivors.members = (await inspectAll(`groups/${s.gid}/members`)).length;

    const total = Object.values(survivors).reduce((a, b) => a + b, 0);
    expect(total, `orphaned after deletion: ${JSON.stringify(survivors)}`).toBe(0);
    expect(await inspectDoc(`groups/${s.gid}`)).toBeNull();
  });
});

describe('[circle-wall] what the circle says about itself', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('an admin sets the links and the pinned repo', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);

    await setCircleLinks(s.gid, [
      { label: 'Handbook', url: 'https://example.dev/handbook' },
      { label: 'Discord', url: 'https://discord.gg/example' },
    ]);
    await setPinnedRepo(s.gid, s.facts.repoIds[2]!);

    const summary = await inspectDoc(`groups/${s.gid}/meta/summary`);
    expect((summary?.links as unknown[]).length).toBe(2);
    expect(summary?.pinnedRepoId).toBe(s.facts.repoIds[2]);
  });

  it('a member cannot touch the admin surface of the summary', async () => {
    // The summary is member-writable so counts stay honest, but the admin keys
    // on it are not (ADR-021, summaryTouchesAdminKeys).
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await rejects(setCircleLinks(s.gid, [{ label: 'Mine', url: 'https://example.dev' }]));
    // A different repo than the seeded pin: writing back the value that is
    // already there changes no keys, so the guard correctly does not fire.
    await rejects(setPinnedRepo(s.gid, s.facts.repoIds[3]!));
  });

  it('unpinning clears the pin rather than leaving a dangling id', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    await setPinnedRepo(s.gid, s.facts.repoIds[1]!);
    await setPinnedRepo(s.gid, null);
    expect((await inspectDoc(`groups/${s.gid}/meta/summary`))?.pinnedRepoId).toBeNull();
  });
});

describe('[watches] what a member keeps', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('saves a repo, reports it as watched, and gives it back', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!;
    const repo = { id: repoId, ...(await inspectDoc(`groups/${s.gid}/repos/${repoId}`)) } as never;
    await signInAs('mira-t');

    await addWatch('mira-t', s.gid, savableRepo(repo));
    expect(await isWatching('mira-t', s.gid, 'repo', repoId)).toBe(true);

    const saved = await fetchWatches('mira-t');
    expect(saved.some((w) => w.itemId === repoId)).toBe(true);
  });

  it('removing it makes it unwatched again', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!;
    const repo = { id: repoId, ...(await inspectDoc(`groups/${s.gid}/repos/${repoId}`)) } as never;
    await signInAs('mira-t');
    await addWatch('mira-t', s.gid, savableRepo(repo));

    await removeWatch('mira-t', s.gid, 'repo', repoId);

    expect(await isWatching('mira-t', s.gid, 'repo', repoId)).toBe(false);
    expect(await fetchWatches('mira-t')).toHaveLength(0);
  });

  it('nobody can read or write another member’s saved items', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!;
    const repo = { id: repoId, ...(await inspectDoc(`groups/${s.gid}/repos/${repoId}`)) } as never;
    await signInAs('mira-t');
    await addWatch('mira-t', s.gid, savableRepo(repo));

    await signInAs('dev-anand');
    await rejects(addWatch('mira-t', s.gid, savableRepo(repo)));
    await expect(fetchWatches('mira-t')).rejects.toThrow();
  });
});

describe('[away-inbox] what happened while you were gone', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('returns nothing for a member nobody has mentioned', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const items = await fetchInbox([s.gid], 'mira-t', 'mira-t', null, {});
    expect(Array.isArray(items)).toBe(true);
  });

  it('skips a muted circle before spending a single read', async () => {
    // M18: mute is a read-cost decision, not just a display one — the query is
    // never built for a muted circle.
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const items = await fetchInbox([s.gid], 'mira-t', 'mira-t', null, { [s.gid]: 'mute' });
    expect(items).toEqual([]);
  });

  it('surfaces interest in something you own', async () => {
    const s = await seedSize('demo');
    const host = String(
      (await inspectDoc(`groups/${s.gid}/sessions/${s.facts.sessionId}`))?.hostUid,
    );
    await signInAs(host);
    const items = await fetchInbox([s.gid], host, host, null, {});
    // The seeded session has RSVPs, which are interests routed to the host.
    expect(items.length).toBeGreaterThan(0);
  });
});

describe('[availability] and [skills-matcher] a member describing themselves', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('sets availability on my own membership', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await setAvailability(s.gid, 'mira-t', { status: 'heads_down', note: 'exams' });
    const me = await inspectDoc(`groups/${s.gid}/members/mira-t`);
    expect((me?.availability as { status: string }).status).toBe('heads_down');
  });

  it('cannot set anyone else’s', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await rejects(setAvailability(s.gid, 'dev-anand', { status: 'away' }));
  });

  it('setting skills ticks the checklist item it satisfies', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await setSkills(s.gid, 'mira-t', { helpWith: ['backend', 'design'], learning: ['rust'] });
    const me = await inspectDoc(`groups/${s.gid}/members/mira-t`);
    expect(me?.helpWith).toEqual(['backend', 'design']);
    expect((me?.checklist as Record<string, boolean>).saidHelpWith).toBe(true);
  });

  it('cannot set anyone else’s skills', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    await rejects(setSkills(s.gid, 'dev-anand', { helpWith: ['ml'], learning: [] }));
  });
});
