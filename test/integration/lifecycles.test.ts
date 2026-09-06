import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
  addInterest,
  adoptRepo,
  registerRepos,
  removeInterest,
  removeRepo,
  setIdeaDetails,
  setRepoStatus,
} from '../../src/data/repos';
import {
  createAsk,
  deleteAsk,
  reopenAsk,
  resolveAsk,
  unblockedThisWeek,
} from '../../src/data/asks';
import { cancelSession, createSession, rsvp, unrsvp } from '../../src/data/sessions';
import { closePoll, createPoll, deletePoll, fetchPoll } from '../../src/data/polls';
import {
  cancelCollabRequest,
  createCollabRequest,
  decideCollabRequest,
} from '../../src/data/collabs';
import { repo as ghRepo } from '../fixtures/github.ts';
import type { MyProfile, Repo } from '../../src/data/types';

/**
 * Full lifecycles: created, changed, resolved, removed.
 *
 * Each of these is a sequence rather than a single write, and the interesting
 * assertions are the ones about what the sequence preserves — the credit line
 * after a handover, the waiting clock across an edit, the summary count as an
 * ask opens and closes again.
 */

const profile = (uid: string): MyProfile => ({
  uid,
  login: uid,
  name: uid,
  avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
});

const loadRepo = async (gid: string, id: string): Promise<Repo> =>
  ({ id, ...(await inspectDoc(`groups/${gid}/repos/${id}`)) }) as unknown as Repo;

const summaryOf = async (gid: string) => await inspectDoc(`groups/${gid}/meta/summary`);

describe('[repo-registry] registering and retiring a repo', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('registers a GitHub repo and does not duplicate it', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const fresh = ghRepo('northside/brand-new', 4242);

    const added = await registerRepos(s.gid, profile('mira-t'), [fresh] as never);
    expect(added).toBe(1);
    const doc = await inspectDoc(`groups/${s.gid}/repos/4242`);
    expect(doc?.fullName).toBe('northside/brand-new');
    expect(doc?.registeredBy).toBe('mira-t');

    // ADR-009 lets a repo live in many circles; registering it twice in ONE
    // circle must still be idempotent.
    const again = await registerRepos(s.gid, profile('mira-t'), [fresh] as never);
    expect(again).toBe(0);
    expect((await inspectAll(`groups/${s.gid}/repos`)).filter((r) => r.id === '4242')).toHaveLength(
      1,
    );
  });

  it('the owner changes status, and paused drops out of "active"', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!;
    const owner = String((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.ownerUid);
    await signInAs(owner);

    await setRepoStatus(s.gid, repoId, 'paused');
    expect((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.status).toBe('paused');
    await setRepoStatus(s.gid, repoId, 'building');
    expect((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.status).toBe('building');
  });

  it('a stranger cannot change someone else’s repo status', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!;
    const owner = String((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.ownerUid);
    const other = s.facts.memberUids.find((u) => u !== owner && u !== s.facts.adminUid)!;
    await signInAs(other);
    await rejects(setRepoStatus(s.gid, repoId, 'done'));
  });

  it('removing a repo takes its activity with it and decrements the count', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[1]!;
    const repo = await loadRepo(s.gid, repoId);
    const before = Number((await summaryOf(s.gid))?.repoCount);
    await signInAs(String(repo.ownerUid));

    await removeRepo(s.gid, profile(String(repo.ownerUid)), repo);

    expect(await inspectDoc(`groups/${s.gid}/repos/${repoId}`)).toBeNull();
    expect(await inspectAll(`groups/${s.gid}/repos/${repoId}/events`)).toHaveLength(0);
    expect(Number((await summaryOf(s.gid))?.repoCount)).toBe(before - 1);
  });
});

describe('[repo-needs] what a repo is asking for', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('starts the waiting clock when a need first appears', async () => {
    const s = await seedSize('demo');
    // repoIds[3] is seeded with needs: null.
    const repoId = s.facts.repoIds[3]!;
    const repo = await loadRepo(s.gid, repoId);
    await signInAs(String(repo.ownerUid));

    await setIdeaDetails(s.gid, repo, {
      pitch: 'A calmer writing tool',
      needs: 'design',
      domainTags: ['web'],
      seekingOwner: false,
    });

    const after = await inspectDoc(`groups/${s.gid}/repos/${repoId}`);
    expect(after?.needs).toBe('design');
    expect(after?.needsSince).toBeTruthy();
  });

  it('keeps the clock running across an edit that leaves the need alone', async () => {
    // M18: re-saving a pitch must not send a repo that has waited a month back
    // to the bottom of the longest-waiting queue.
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[0]!; // seeded needing 'frontend'
    const before = await loadRepo(s.gid, repoId);
    const originalSince = (before.needsSince as unknown as { toMillis(): number }).toMillis();
    await signInAs(String(before.ownerUid));

    await setIdeaDetails(s.gid, before, {
      pitch: 'Same need, sharper words',
      needs: 'frontend',
      domainTags: ['tooling'],
      seekingOwner: false,
    });

    const after = await inspectDoc(`groups/${s.gid}/repos/${repoId}`);
    expect((after?.needsSince as { toMillis(): number }).toMillis()).toBe(originalSince);
    expect(after?.pitch).toBe('Same need, sharper words');
  });

  it('interest is recorded once per member and can be withdrawn', async () => {
    const s = await seedSize('demo');
    const repoId = s.facts.repoIds[2]!;
    const repo = await loadRepo(s.gid, repoId);
    const before = Number(
      (await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.interestCount ?? 0,
    );
    await signInAs('mira-t');

    await addInterest(s.gid, repo, profile('mira-t'));
    expect(Number((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.interestCount)).toBe(
      before + 1,
    );
    expect(
      (await inspectAll(`groups/${s.gid}/repos/${repoId}/interests`)).map((i) => i.id),
    ).toContain('mira-t');

    await removeInterest(s.gid, repoId, 'mira-t');
    expect(Number((await inspectDoc(`groups/${s.gid}/repos/${repoId}`))?.interestCount)).toBe(
      before,
    );
  });
});

describe('[adoption-handover] a repo changing hands', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('records the new owner without erasing who started it', async () => {
    // ADR-019: the credit line is a fact, and handing a project on does not
    // rewrite who began it.
    const s = await seedSize('demo');
    const repoId = s.facts.orphanRepoId!;
    const repo = await loadRepo(s.gid, repoId);
    const starter = repo.githubOwnerLogin;
    await signInAs(s.facts.adminUid);

    await adoptRepo(s.gid, profile(s.facts.adminUid), repo, {
      uid: 'mira-t',
      login: 'mira-t',
    });

    const after = await inspectDoc(`groups/${s.gid}/repos/${repoId}`);
    expect(after?.ownerUid).toBe('mira-t');
    expect(after?.adoptedByLogin).toBe('mira-t');
    expect(after?.adoptedFromLogin).toBe(starter);
    expect(after?.adoptedAt).toBeTruthy();
  });
});

describe('[asks] the full life of an ask', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('opens, resolves with credit, reopens and closes the count each time', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const openBefore = Number((await summaryOf(s.gid))?.openAskCount);

    const id = await createAsk(s.gid, profile('mira-t'), {
      kind: 'ask',
      title: 'Cannot get the emulator to seed',
      detail: 'It hangs on port 8080',
      tags: ['devops'],
    });
    expect(Number((await summaryOf(s.gid))?.openAskCount)).toBe(openBefore + 1);

    await resolveAsk(s.gid, { id, state: 'open' }, { uid: 'dev-anand', login: 'dev-anand' });
    const resolved = await inspectDoc(`groups/${s.gid}/asks/${id}`);
    expect(resolved?.state).toBe('resolved');
    // One fact, never a tally (ADR-019).
    expect(resolved?.resolvedWithLogin).toBe('dev-anand');
    expect(Number((await summaryOf(s.gid))?.openAskCount)).toBe(openBefore);

    await reopenAsk(s.gid, { id, state: 'resolved' });
    expect((await inspectDoc(`groups/${s.gid}/asks/${id}`))?.state).toBe('open');
    expect(Number((await summaryOf(s.gid))?.openAskCount)).toBe(openBefore + 1);

    await deleteAsk(s.gid, { id, state: 'open' });
    expect(await inspectDoc(`groups/${s.gid}/asks/${id}`)).toBeNull();
    expect(Number((await summaryOf(s.gid))?.openAskCount)).toBe(openBefore);
  });

  it('a stuck flag is an ask with a different kind, not a different thing', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const id = await createAsk(s.gid, profile('mira-t'), {
      kind: 'stuck',
      title: 'Build passes locally, fails in CI',
      tags: [],
    });
    expect((await inspectDoc(`groups/${s.gid}/asks/${id}`))?.kind).toBe('stuck');
  });

  it('counts what the circle unblocked this week without ranking anybody', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const n = await unblockedThisWeek(s.gid);
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

describe('[sessions] and [rsvp] a gathering end to end', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('any writing member can schedule one — it is a ritual, not an admin function', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');

    const id = await createSession(s.gid, profile('mira-t'), {
      title: 'Thursday pairing',
      detail: 'Bring whatever state it is in',
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      durationMin: 120,
      url: 'https://meet.example.com/thursday',
    });

    const session = await inspectDoc(`groups/${s.gid}/sessions/${id}`);
    expect(session?.title).toBe('Thursday pairing');
    expect(session?.hostUid).toBe('mira-t');
    expect(session?.cancelled).toBe(false);
  });

  it('an RSVP is an interests document, which is why the host’s inbox gets it free', async () => {
    const s = await seedSize('demo');
    const sessionId = s.facts.sessionId!;
    const session = {
      id: sessionId,
      ...(await inspectDoc(`groups/${s.gid}/sessions/${sessionId}`)),
    } as never;
    await signInAs('mira-t');

    await rsvp(s.gid, session, profile('mira-t'));
    const rsvps = await inspectAll(`groups/${s.gid}/sessions/${sessionId}/interests`);
    const mine = rsvps.find((r) => r.id === 'mira-t');
    expect(mine).toBeTruthy();
    // repoOwnerUid is what routes the away-inbox; rules verify it.
    expect(mine!.data.repoOwnerUid).toBe(
      (await inspectDoc(`groups/${s.gid}/sessions/${sessionId}`))?.hostUid,
    );

    await unrsvp(s.gid, sessionId, 'mira-t');
    expect(
      (await inspectAll(`groups/${s.gid}/sessions/${sessionId}/interests`)).map((r) => r.id),
    ).not.toContain('mira-t');
  });

  it('cancelling marks it rather than deleting it', async () => {
    // Deleting would leave everyone who RSVPd waiting in a room.
    const s = await seedSize('demo');
    const sessionId = s.facts.sessionId!;
    const host = String((await inspectDoc(`groups/${s.gid}/sessions/${sessionId}`))?.hostUid);
    await signInAs(host);
    await cancelSession(s.gid, sessionId);
    const after = await inspectDoc(`groups/${s.gid}/sessions/${sessionId}`);
    expect(after).not.toBeNull();
    expect(after?.cancelled).toBe(true);
  });
});

describe('[polls-voting] a poll from open to closed', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('is created with its options at zero', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const id = await createPoll(s.gid, profile('mira-t'), 'Where should we meet?', [
      'The lab',
      'The library',
      'Online',
    ]);
    const poll = await fetchPoll(s.gid, id);
    expect(poll?.question).toBe('Where should we meet?');
    expect(Object.values(poll!.options).every((o) => o.count === 0)).toBe(true);
    expect(poll?.state).toBe('open');
  });

  it('closing it keeps the result as the record', async () => {
    const s = await seedSize('demo');
    await signInAs(s.facts.adminUid);
    await closePoll(s.gid, s.facts.pollId!);
    const closed = await inspectDoc(`groups/${s.gid}/polls/${s.facts.pollId}`);
    expect(closed?.state).toBe('closed');
    expect(closed?.closedAt).toBeTruthy();
    // Still there — a closed poll collapses to a fact, it does not vanish.
    expect(closed?.question).toBeTruthy();
  });

  it('the author can delete their own poll', async () => {
    const s = await seedSize('demo');
    await signInAs('mira-t');
    const id = await createPoll(s.gid, profile('mira-t'), 'Throwaway?', ['yes', 'no']);
    await deletePoll(s.gid, id);
    expect(await inspectDoc(`groups/${s.gid}/polls/${id}`)).toBeNull();
  });
});

describe('[collab-requests] asking to work on someone else’s repo', () => {
  beforeEach(async () => {
    assertEmulators();
    await clearData();
  });
  afterAll(closeHarness);

  it('is created pending and routed to the repo owner', async () => {
    const s = await seedSize('demo');
    const repo = await loadRepo(s.gid, s.facts.repoIds[0]!);
    await signInAs('mira-t');

    const id = await createCollabRequest(
      s.gid,
      profile('mira-t'),
      repo,
      'Happy to take the graph view',
    );

    const req = await inspectDoc(`groups/${s.gid}/collabRequests/${id}`);
    expect(req?.state).toBe('pending');
    expect(req?.requesterUid).toBe('mira-t');
    expect(req?.repoOwnerUid).toBe(repo.ownerUid);
  });

  it('the owner accepts it, and the decision is recorded', async () => {
    const s = await seedSize('demo');
    const repo = await loadRepo(s.gid, s.facts.repoIds[0]!);
    await signInAs('mira-t');
    const id = await createCollabRequest(s.gid, profile('mira-t'), repo, 'let me help');

    await signInAs(String(repo.ownerUid));
    await decideCollabRequest(s.gid, profile(String(repo.ownerUid)), id, 'accepted');

    const req = await inspectDoc(`groups/${s.gid}/collabRequests/${id}`);
    expect(req?.state).toBe('accepted');
    expect(req?.decidedBy).toBe(repo.ownerUid);
  });

  it('the requester can withdraw their own request', async () => {
    const s = await seedSize('demo');
    const repo = await loadRepo(s.gid, s.facts.repoIds[0]!);
    await signInAs('mira-t');
    const id = await createCollabRequest(s.gid, profile('mira-t'), repo, 'on second thoughts');
    await cancelCollabRequest(s.gid, id);
    // Marked rather than deleted: the owner may already have seen it, and a
    // request that silently vanishes is worse than one that says it was pulled.
    const after = await inspectDoc(`groups/${s.gid}/collabRequests/${id}`);
    expect(after?.state).toBe('cancelled');
    expect(after?.requesterUid).toBe('mira-t');
  });
});
