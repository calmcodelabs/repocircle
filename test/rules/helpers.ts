import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { Timestamp, type Firestore } from 'firebase/firestore';

export const GID = 'g1';

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-repocircle',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

/** Modular-API view of a test context's Firestore. */
export function db(ctx: RulesTestContext): Firestore {
  return ctx.firestore() as unknown as Firestore;
}

export function inDays(days: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + days * 86_400_000);
}

export function groupDoc(createdBy: string) {
  return {
    name: 'CS Club Builds',
    description: 'test group',
    visibility: 'private',
    createdBy,
    memberCount: 1,
    settings: { askTags: [], defaultRole: 'member' },
    createdAt: Timestamp.now(),
    v: 1,
  };
}

export function memberDoc(login: string, role = 'member', joinedVia = 'seed') {
  return {
    role,
    login,
    name: login,
    avatarUrl: `https://avatars.githubusercontent.com/${login}`,
    availability: { status: 'free' },
    helpWith: [],
    learning: [],
    checklist: {},
    joinedAt: Timestamp.now(),
    joinedVia,
    v: 1,
  };
}

export function askDoc(authorUid: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'ask',
    title: 'Need help with Docker networking',
    detail: 'Containers cannot reach each other on the bridge network.',
    tags: ['devops'],
    authorUid,
    authorLogin: authorUid,
    state: 'open',
    claimCount: 0,
    createdAt: Timestamp.now(),
    v: 1,
    ...overrides,
  };
}

/** Seed a group with an admin + a member + a guest, bypassing rules. */
export async function seedGroup(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const { doc, setDoc } = await import('firebase/firestore');
    const d = db(ctx);
    await setDoc(doc(d, `groups/${GID}`), groupDoc('alice'));
    await setDoc(doc(d, `groups/${GID}/members/alice`), memberDoc('alice', 'admin'));
    await setDoc(doc(d, `groups/${GID}/members/bob`), memberDoc('bob', 'member'));
    await setDoc(doc(d, `groups/${GID}/members/gia`), memberDoc('gia', 'guest'));
  });
}
