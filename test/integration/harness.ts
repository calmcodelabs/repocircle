/**
 * Integration harness (TESTING.md §2, L3).
 *
 * These tests import `src/data` modules and run them exactly as the app does —
 * through the app's own `firebase.ts`, against the Firestore and Auth
 * emulators, with the real security rules applied. That is the difference from
 * the rules layer: L2 proves the rules; L3 proves the code the app actually
 * calls, including everything that happens between two awaits.
 *
 * Authentication uses the emulator's acceptance of unsigned custom tokens, so a
 * test can be a specific uid ('n-rahman') and the seeded scenario's logins line
 * up with the signed-in user. Seeding bypasses rules through the same
 * rules-testing harness the dev seed uses, which cannot reach a real project.
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { auth, db, usingEmulators } from '../../src/firebase';
import { buildScenario, type Scenario, type Size } from '../fixtures/scenarios.ts';
import { writeScenario } from '../fixtures/write.ts';

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'repocircle-3e9a6';

let env: RulesTestEnvironment | null = null;

/** Fails loudly rather than quietly writing to a real project. */
export function assertEmulators(): void {
  if (!usingEmulators) {
    throw new Error(
      'Integration tests are not pointed at the emulators. The integration vitest project must set VITE_EMULATORS=1.',
    );
  }
}

async function testEnv(): Promise<RulesTestEnvironment> {
  if (!env) {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      },
    });
  }
  return env;
}

export async function clearData(): Promise<void> {
  const e = await testEnv();
  await e.clearFirestore();
}

export async function closeHarness(): Promise<void> {
  if (env) await env.cleanup();
  env = null;
}

/** Write a scenario with rules disabled — the arrangement half of a test. */
export async function seed(scenario: Scenario): Promise<Scenario> {
  const e = await testEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await writeScenario(ctx.firestore() as unknown as Firestore, scenario);
  });
  return scenario;
}

export async function seedSize(size: Size, gid?: string): Promise<Scenario> {
  return seed(buildScenario(size, gid ? { gid } : {}));
}

/** Arbitrary rules-bypassing writes, for arranging states the app cannot reach. */
export async function asAdmin(fn: (fs: Firestore) => Promise<void>): Promise<void> {
  const e = await testEnv();
  await e.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

/**
 * Read with rules disabled, for arrangement and for assertions.
 *
 * The distinction matters: the *action* under test always runs through the
 * app's authenticated path, so rules apply to it. Checking what the action left
 * behind must not, because the flows being tested frequently end with the actor
 * losing the access they had — `leaveGroup` deletes the very membership that
 * authorized reading the circle. Asserting through that user's permissions
 * would test the read rules (which L2 already covers) instead of the flow.
 */
export async function inspect<T>(fn: (fs: Firestore) => Promise<T>): Promise<T> {
  const e = await testEnv();
  let out!: T;
  await e.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore() as unknown as Firestore);
  });
  return out;
}

/** One document, read privileged. Returns null when absent. */
export async function inspectDoc(path: string): Promise<Record<string, unknown> | null> {
  const { doc, getDoc } = await import('firebase/firestore');
  return inspect(async (fs) => {
    const snap = await getDoc(doc(fs, path));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  });
}

/** One collection, read privileged, as [id, data] pairs. */
export async function inspectAll(
  path: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const { collection, getDocs } = await import('firebase/firestore');
  return inspect(async (fs) => {
    const snap = await getDocs(collection(fs, path));
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  });
}

/**
 * The Auth emulator accepts custom tokens with no signature, which is how a
 * test becomes a *specific* uid rather than whatever a sign-up handed out.
 */
function unsignedCustomToken(uid: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'none', typ: 'JWT' }),
    b64({
      iss: 'firebase-auth-emulator@example.com',
      sub: 'firebase-auth-emulator@example.com',
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid,
      claims: {},
    }),
    '',
  ].join('.');
}

export async function signInAs(uid: string): Promise<string> {
  const cred = await signInWithCustomToken(auth(), unsignedCustomToken(uid));
  if (cred.user.uid !== uid) throw new Error(`signed in as ${cred.user.uid}, expected ${uid}`);
  return cred.user.uid;
}

export async function signOutNow(): Promise<void> {
  await signOut(auth());
}

/** The app's Firestore handle, so tests exercise the same instance the app does. */
export const appDb = db;

/** Assert a promise rejects, returning the error for further checks. */
export async function rejects(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected the operation to fail, but it succeeded');
}
