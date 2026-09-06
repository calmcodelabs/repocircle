import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import {
  appDb,
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
import { joinViaInvite, leaveGroup, removeMember, setRole } from '../../src/data/members';
import { ensureUserDoc } from '../../src/data/groups';
import { anonymizeMyContent } from '../../src/util/anonymize';
import { markReposOwnerLeft } from '../../src/data/repos';
import type { Invite, Member, MyProfile } from '../../src/data/types';

/**
 * The multi-step flows, run as the app runs them (TESTING.md §2, L3).
 *
 * These are the functions with no transaction around them: `leaveGroup` is five
 * sequential awaits whose order matters because each one needs the membership
 * that a later step deletes. The rules layer proves each individual write is
 * allowed; only this layer can prove what the sequence leaves behind when a
 * step in the middle does not happen.
 */

const profileOf = (uid: string): MyProfile => ({
  uid,
  login: uid,
  name: uid,
  avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
});

async function readMember(gid: string, uid: string): Promise<Member | null> {
  const data = await inspectDoc(`groups/${gid}/members/${uid}`);
  return data ? ({ uid, ...data } as unknown as Member) : null;
}

/** The summary, with its counts typed — inspectDoc returns unknown values. */
async function summaryOf(gid: string): Promise<{ memberCount: number; repoCount: number } | null> {
  const d = await inspectDoc(`groups/${gid}/meta/summary`);
  return d ? { memberCount: Number(d.memberCount), repoCount: Number(d.repoCount) } : null;
}

describe('[join-flow] joining through an invite', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  // Reading the invite is arrangement — the Join screen's own read is covered by
  // the rules layer and by the E2E journey.
  async function inviteFrom(gid: string, token: string): Promise<Invite> {
    const data = await inspectDoc(`groups/${gid}/invites/${token}`);
    return { token, ...data } as unknown as Invite;
  }

  it('writes the membership, the user mirror and the count in one flow', async () => {
    const s = await seedSize('minimal');
    await signInAs('newcomer');
    await ensureUserDoc(profileOf('newcomer'));
    const invite = await inviteFrom(s.gid, s.facts.inviteToken);
    const before = await summaryOf(s.gid);

    await joinViaInvite(s.gid, invite, profileOf('newcomer'), {
      helpWith: ['frontend'],
      domainTags: ['web'],
    });

    const member = await readMember(s.gid, 'newcomer');
    expect(member?.role).toBe('member');
    expect(member?.helpWith).toEqual(['frontend']);
    expect(member?.domainTags).toEqual(['web']);
    // M17: answering at the door ticks the checklist item it satisfies.
    expect(member?.checklist?.saidHelpWith).toBe(true);
    expect(member?.joinedVia).toBe(s.facts.inviteToken);

    const user = await inspectDoc('users/newcomer');
    expect(user?.groupIds).toContain(s.gid);
    expect((await summaryOf(s.gid))?.memberCount).toBe((before?.memberCount ?? 0) + 1);
  });

  it('joins without answers, leaving the checklist untouched', async () => {
    const s = await seedSize('minimal');
    await signInAs('quiet');
    await ensureUserDoc(profileOf('quiet'));
    await joinViaInvite(s.gid, await inviteFrom(s.gid, s.facts.inviteToken), profileOf('quiet'));
    const m = await readMember(s.gid, 'quiet');
    expect(m?.helpWith).toEqual([]);
    expect(m?.checklist?.saidHelpWith).toBeUndefined();
  });

  it('does not count a join the server rejected', async () => {
    // The local SDK applies writes optimistically, so a batch the server later
    // refuses still looks successful to the caller. joinViaInvite re-reads from
    // the server precisely to catch that, and must not bump the mirror when the
    // membership did not land.
    const s = await seedSize('minimal');
    const base = await inspectDoc(`groups/${s.gid}/invites/${s.facts.inviteToken}`);
    await asAdmin(async (fs) => {
      await setDoc(doc(fs, `groups/${s.gid}/invites/revoked-token`), {
        ...base,
        token: 'revoked-token',
        revoked: true,
      });
    });
    await signInAs('rejected');
    await ensureUserDoc(profileOf('rejected'));
    const before = await summaryOf(s.gid);

    const invite = await inviteFrom(s.gid, 'revoked-token');
    await rejects(joinViaInvite(s.gid, invite, profileOf('rejected')));

    expect(await readMember(s.gid, 'rejected')).toBeNull();
    expect((await summaryOf(s.gid))?.memberCount).toBe(before?.memberCount);
  });

  it('an expired invite cannot be used', async () => {
    const s = await seedSize('minimal');
    const base = await inspectDoc(`groups/${s.gid}/invites/${s.facts.inviteToken}`);
    await asAdmin(async (fs) => {
      await setDoc(doc(fs, `groups/${s.gid}/invites/expired`), {
        ...base,
        token: 'expired',
        expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000),
      });
    });
    await signInAs('latecomer');
    await ensureUserDoc(profileOf('latecomer'));
    await rejects(joinViaInvite(s.gid, await inviteFrom(s.gid, 'expired'), profileOf('latecomer')));
    expect(await readMember(s.gid, 'latecomer')).toBeNull();
  });
});

describe('[leave-rejoin] leaving a circle', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('anonymizes authored content, flags repos, decrements and detaches — in that order', async () => {
    const s = await seedSize('demo');
    const leaver = s.facts.memberUids[2]!;
    await asAdmin(async (fs) => {
      await setDoc(doc(fs, `users/${leaver}`), {
        login: leaver,
        name: leaver,
        avatarUrl: '',
        groupIds: [s.gid],
        createdAt: Timestamp.now(),
        v: 1,
      });
    });
    await signInAs(leaver);
    const before = await summaryOf(s.gid);

    await leaveGroup(s.gid, profileOf(leaver));

    // Membership gone, mirror decremented, user's group list detached.
    expect(await readMember(s.gid, leaver)).toBeNull();
    expect((await summaryOf(s.gid))?.memberCount).toBe((before?.memberCount ?? 1) - 1);
    const user = await inspectDoc(`users/${leaver}`);
    expect((user?.groupIds as string[]) ?? []).not.toContain(s.gid);
  });

  it('leaves their asks readable but unattributed', async () => {
    const s = await seedSize('demo');
    const author = s.facts.memberUids[1]!;
    await asAdmin(async (fs) => {
      await setDoc(doc(fs, `users/${author}`), {
        login: author,
        name: author,
        avatarUrl: '',
        groupIds: [s.gid],
        createdAt: Timestamp.now(),
        v: 1,
      });
      await setDoc(doc(fs, `groups/${s.gid}/asks/mine`), {
        kind: 'ask',
        title: 'Something I asked before leaving',
        detail: 'seeded',
        tags: [],
        authorUid: author,
        authorLogin: author,
        authorAvatarUrl: `https://avatars.githubusercontent.com/${author}`,
        state: 'open',
        claimCount: 0,
        createdAt: Timestamp.now(),
        v: 1,
      });
    });
    await signInAs(author);

    const touched = await anonymizeMyContent(s.gid, author);
    expect(touched).toBeGreaterThan(0);

    const ask = await inspectDoc(`groups/${s.gid}/asks/mine`);
    expect(ask?.authorLogin).toBe('(left the group)');
    expect(ask?.authorAvatarUrl).toBe('');
    // The ask itself survives — the circle keeps its history (DATA-MODEL §5).
    expect(ask?.title).toBe('Something I asked before leaving');
    expect(ask?.authorUid).toBe(author);
  });

  it('hands the leaver’s repos to the circle rather than orphaning them', async () => {
    const s = await seedSize('demo');
    // The scenario's first repo is owned by the admin; use a plain member's.
    const owner = 's-qureshi';
    await signInAs(owner);
    const flagged = await markReposOwnerLeft(s.gid, owner);
    expect(flagged).toBeGreaterThan(0);

    const repos = await inspectAll(`groups/${s.gid}/repos`);
    const theirs = repos.filter((r) => r.data.ownerUid === owner);
    expect(theirs.length).toBe(flagged);
    for (const r of theirs) {
      expect(r.data.ownerLeft).toBe(true);
      expect(r.data.seekingOwner).toBe(true);
    }
  });

  it('a partial leave leaves repos adoptable rather than invisible', async () => {
    // The order in leaveGroup is deliberate: repos are flagged while the
    // membership still authorizes it. If the process dies after that step, the
    // circle sees adoptable repos and a member who is still listed — recoverable.
    // The failure it avoids is the reverse: membership gone, repos unreachable.
    const s = await seedSize('demo');
    const owner = 's-qureshi';
    await signInAs(owner);

    await markReposOwnerLeft(s.gid, owner); // step 2 of leaveGroup, then "crash"

    expect(await readMember(s.gid, owner)).not.toBeNull();
    const repos = await inspectAll(`groups/${s.gid}/repos`);
    const theirs = repos.filter((r) => r.data.ownerUid === owner);
    expect(theirs.every((r) => r.data.seekingOwner === true)).toBe(true);
  });
});

describe('[membership-roles] admin actions on other members', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('removing a member flags their repos and decrements the count', async () => {
    const s = await seedSize('demo');
    const admin = s.facts.adminUid;
    const target = (await readMember(s.gid, 's-qureshi'))!;
    await signInAs(admin);
    const before = await summaryOf(s.gid);

    await removeMember(s.gid, profileOf(admin), target);

    expect(await readMember(s.gid, target.uid)).toBeNull();
    expect((await summaryOf(s.gid))?.memberCount).toBe((before?.memberCount ?? 1) - 1);
    const repos = await inspectAll(`groups/${s.gid}/repos`);
    const theirs = repos.filter((r) => r.data.ownerUid === target.uid);
    expect(theirs.every((r) => r.data.ownerLeft === true)).toBe(true);
  });

  it('a plain member cannot remove anyone', async () => {
    const s = await seedSize('demo');
    const target = (await readMember(s.gid, 's-qureshi'))!;
    await signInAs('mira-t');
    await rejects(removeMember(s.gid, profileOf('mira-t'), target));
    expect(await readMember(s.gid, target.uid)).not.toBeNull();
  });

  it('a plain member cannot promote themselves', async () => {
    const s = await seedSize('demo');
    const me = (await readMember(s.gid, 'mira-t'))!;
    await signInAs('mira-t');
    await rejects(setRole(s.gid, profileOf('mira-t'), me, 'admin'));
    expect((await readMember(s.gid, 'mira-t'))?.role).toBe('member');
  });

  it('an admin can change a role, and it is recorded', async () => {
    const s = await seedSize('demo');
    const target = (await readMember(s.gid, 'mira-t'))!;
    await signInAs(s.facts.adminUid);
    await setRole(s.gid, profileOf(s.facts.adminUid), target, 'admin');
    expect((await readMember(s.gid, 'mira-t'))?.role).toBe('admin');
    const audit = await inspectAll(`groups/${s.gid}/auditLog`);
    expect(audit.some((a) => a.data.action === 'role_changed')).toBe(true);
  });
});

describe('[adoption-handover] repos outlive their owner', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('an orphaned repo stays readable and is marked for adoption', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const orphan = await getDoc(doc(appDb(), `groups/${s.gid}/repos/${s.facts.orphanRepoId}`));
    expect(orphan.exists()).toBe(true);
    expect(orphan.data()?.seekingOwner).toBe(true);
  });

  it('deleting the owner’s membership does not delete their repos', async () => {
    const s = await seedSize('demo');
    await asAdmin(async (fs) => {
      await deleteDoc(doc(fs, `groups/${s.gid}/members/s-qureshi`));
    });
    await signInAs('mira-t');
    const repos = await getDocs(collection(appDb(), `groups/${s.gid}/repos`));
    expect(repos.docs.some((d) => d.data().ownerUid === 's-qureshi')).toBe(true);
  });
});
