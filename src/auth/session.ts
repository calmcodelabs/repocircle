import { signal } from '@preact/signals';
import {
  GithubAuthProvider,
  getAdditionalUserInfo,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, isConfigured } from '../firebase';
import { clearToken, setToken } from './vault';
import { log } from '../util/log';

export const BASE_SCOPES = ['read:user', 'user:email'] as const;

/** undefined = auth state still resolving; null = signed out. */
export const sessionUser = signal<User | null | undefined>(undefined);
export const authBusy = signal(false);
export const authError = signal<string | null>(null);

type GhProfile = { id?: number; login?: string; name?: string | null; avatar_url?: string };

export function initAuth(): void {
  if (!isConfigured) {
    sessionUser.value = null;
    return;
  }
  onAuthStateChanged(auth(), (u) => {
    sessionUser.value = u;
    if (u) void touchLastSeen(u);
  });
}

function provider(scopes: readonly string[]): GithubAuthProvider {
  const p = new GithubAuthProvider();
  for (const s of scopes) p.addScope(s);
  return p;
}

export async function signInWithGitHub(): Promise<void> {
  authBusy.value = true;
  authError.value = null;
  try {
    const res = await signInWithPopup(auth(), provider(BASE_SCOPES));
    const cred = GithubAuthProvider.credentialFromResult(res);
    if (cred?.accessToken) setToken(cred.accessToken);
    const info = getAdditionalUserInfo(res);
    await upsertUser(res.user, (info?.profile ?? undefined) as GhProfile | undefined, info?.isNewUser === true);
    log('info', 'signed in');
  } catch (e) {
    authError.value = friendlyAuthError(e);
    log('warn', `sign-in failed: ${codeOf(e) ?? 'unknown'}`);
  } finally {
    authBusy.value = false;
  }
}

/**
 * Contextual scope escalation (PRD F-01): ask for public_repo only when a feature
 * first needs it (registering collab issues, accepting invites). Returns success.
 */
export async function escalateToPublicRepo(): Promise<boolean> {
  const u = sessionUser.value;
  if (!u) return false;
  try {
    const res = await reauthenticateWithPopup(u, provider([...BASE_SCOPES, 'public_repo']));
    const cred = GithubAuthProvider.credentialFromResult(res);
    if (cred?.accessToken) setToken(cred.accessToken);
    await updateDoc(doc(db(), 'users', u.uid), { scopesGranted: arrayUnion('public_repo') });
    log('info', 'scope escalated: public_repo');
    return true;
  } catch (e) {
    authError.value = friendlyAuthError(e);
    log('warn', `scope escalation failed: ${codeOf(e) ?? 'unknown'}`);
    return false;
  }
}

export async function signOutApp(): Promise<void> {
  clearToken();
  await signOut(auth());
  log('info', 'signed out');
}

async function upsertUser(u: User, profile: GhProfile | undefined, isNew: boolean): Promise<void> {
  const login = profile?.login ?? u.displayName ?? 'unknown';
  const base = {
    login,
    name: profile?.name ?? u.displayName ?? login,
    avatarUrl: profile?.avatar_url ?? u.photoURL ?? '',
    lastSeenAt: serverTimestamp(),
  };
  if (isNew) {
    await setDoc(doc(db(), 'users', u.uid), {
      ...base,
      githubId: profile?.id ?? 0,
      scopesGranted: [...BASE_SCOPES],
      groupIds: [],
      checklist: {},
      createdAt: serverTimestamp(),
      v: 1,
    });
  } else {
    await setDoc(doc(db(), 'users', u.uid), base, { merge: true });
  }
}

async function touchLastSeen(u: User): Promise<void> {
  try {
    await updateDoc(doc(db(), 'users', u.uid), { lastSeenAt: serverTimestamp() });
  } catch {
    // Doc may not exist yet (first sign-in creates it) — harmless.
  }
}

function codeOf(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : undefined;
}

function friendlyAuthError(e: unknown): string {
  switch (codeOf(e)) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup — allow popups for this site and retry.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase yet (docs/SETUP.md §B4).';
    case 'auth/network-request-failed':
      return 'Network hiccup talking to Firebase — check your connection and retry.';
    case 'auth/account-exists-with-different-credential':
      return 'This GitHub email is already linked to another sign-in method.';
    default:
      return 'Sign-in failed. Try again, and check #/diag if it persists.';
  }
}
