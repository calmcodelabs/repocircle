/**
 * Signal state control for component tests (TESTING.md §2, L4).
 *
 * The app's stores are module-level Preact signals. That is right for the app
 * and hostile to tests: a value set in one test is still there in the next, so
 * a passing test can be passing on another test's data. Everything here exists
 * to make each test start from nothing and say explicitly what it wants.
 */
import { sessionUser } from '../../../src/auth/session';
import { myUserDoc } from '../../../src/data/users';
import {
  activeDenied,
  activeGid,
  activeGroup,
  activeMembers,
  activeSummary,
  myMembership,
} from '../../../src/data/activeGroup';
import { route } from '../../../src/router';
import { logBuffer, serverUnavailable } from '../../../src/util/log';
import { updateReady } from '../../../src/util/appUpdate';
import { buildScenario, type Size } from '../../fixtures/scenarios.ts';
import type { CircleSummary, Group, Member } from '../../../src/data/types';

/** Undo everything a previous test may have left behind. */
export function resetStores(): void {
  sessionUser.value = null;
  myUserDoc.value = undefined;
  activeGid.value = null;
  activeGroup.value = undefined;
  activeSummary.value = null;
  activeMembers.value = null;
  myMembership.value = null;
  activeDenied.value = false;
  serverUnavailable.value = null;
  updateReady.value = false;
  logBuffer.value = [];
  route.value = { name: 'root' };
}

export type Timestampish = { toMillis(): number; toDate(): Date; seconds: number };

/** A Timestamp-shaped value, without dragging the Firestore SDK into the browser bundle. */
export function ts(ms: number): Timestampish {
  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
    seconds: Math.floor(ms / 1000),
  };
}

const DAY = 86_400_000;
export const NOW = Date.parse('2026-09-01T12:00:00.000Z');
export const ago = (days: number) => ts(NOW - days * DAY);
export const ahead = (days: number) => ts(NOW + days * DAY);

/**
 * Sign a test in as a member of a circle. Returns the scenario so a test can
 * assert against the same facts it seeded from.
 */
export function signedInAs(
  uid: string,
  opts: { role?: Member['role']; size?: Size; groupIds?: string[] } = {},
) {
  const scenario = buildScenario(opts.size ?? 'demo', { now: NOW });
  const gid = scenario.gid;

  sessionUser.value = { uid, displayName: uid, photoURL: '', email: null } as never;
  myUserDoc.value = {
    uid,
    login: uid,
    name: uid,
    avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
    groupIds: opts.groupIds ?? [gid],
    createdAt: ago(60),
    v: 1,
  } as never;

  activeGid.value = gid;
  activeGroup.value = {
    id: gid,
    name: scenario.facts.groupName,
    description: 'A circle for testing',
    visibility: 'private',
    createdBy: scenario.facts.adminUid,
    memberCount: scenario.facts.counts.members,
    settings: { askTags: ['frontend', 'backend'], defaultRole: 'member' },
    createdAt: ago(120),
    v: 1,
  } as unknown as Group;

  myMembership.value = member(uid, opts.role ?? 'member');
  activeSummary.value = {
    memberCount: scenario.facts.counts.members,
    repoCount: scenario.facts.counts.repos,
    openAskCount: scenario.facts.counts.openAsks,
    links: [],
    pinnedRepoId: null,
    v: 1,
  } as CircleSummary;

  return scenario;
}

export function member(uid: string, role: Member['role'] = 'member', over: Partial<Member> = {}) {
  return {
    uid,
    role,
    login: uid,
    name: uid,
    avatarUrl: `https://avatars.githubusercontent.com/${uid}`,
    availability: { status: 'free' },
    helpWith: [],
    learning: [],
    checklist: {},
    joinedAt: ago(30),
    joinedVia: 'seed',
    v: 1,
    ...over,
  } as unknown as Member;
}

/** Put the circle into the state where its listeners were denied. */
export function denyCircle(): void {
  activeDenied.value = true;
}

/** Report a backend problem the way the data layer does. */
export function serverProblem(code: string): void {
  serverUnavailable.value = code;
}
