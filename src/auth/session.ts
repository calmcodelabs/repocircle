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
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, isConfigured } from '../firebase';
import { startMyUserWatch, stopMyUserWatch } from '../data/users';
import { clearToken, getToken, setToken } from './vault';
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
    if (u) {
      startMyUserWatch(u.uid);
      void touchLastSeen(u);
    } else {
      stopMyUserWatch();
    }
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
    await upsertUser(res.user, (info?.profile ?? undefined) as GhProfile | undefined);
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

/**
 * Get a GitHub token for API calls, re-authenticating via popup if the vault is
 * empty (fresh tab). Returns null when the user declines / popup blocked.
 */
export async function ensureGitHubToken(): Promise<string | null> {
  const existing = getToken();
  if (existing) return existing;
  const u = sessionUser.value;
  if (!u) return null;
  try {
    const res = await reauthenticateWithPopup(u, provider(BASE_SCOPES));
    const cred = GithubAuthProvider.credentialFromResult(res);
    if (cred?.accessToken) {
      setToken(cred.accessToken);
      authError.value = null;
      return cred.accessToken;
    }
    return null;
  } catch (e) {
    // Keep the specific reason (popup blocked, cancelled, unauthorized domain…)
    // so callers can show it instead of a generic "reconnect" line.
    authError.value = friendlyAuthError(e);
    log('warn', `token refresh failed: ${codeOf(e) ?? 'unknown'}`);
    return null;
  }
}

export async function signOutApp(): Promise<void> {
  clearToken();
  await signOut(auth());
  log('info', 'signed out');
}

async function upsertUser(u: User, profile: GhProfile | undefined): Promise<void> {
  const login = profile?.login ?? u.displayName ?? 'unknown';
  const base = {
    login,
    name: profile?.name ?? u.displayName ?? login,
    avatarUrl: profile?.avatar_url ?? u.photoURL ?? '',
    lastSeenAt: serverTimestamp(),
  };
  // Key off the *document*, not GitHub's isNewUser: a returning Firebase account
  // whose profile doc is missing (deleted, or a create that failed) must still get
  // a complete record, otherwise it silently lacks groupIds/scopes/checklist.
  const ref = doc(db(), 'users', u.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, base, { merge: true });
    return;
  }
  await setDoc(ref, {
    ...base,
    githubId: profile?.id ?? 0,
    scopesGranted: [...BASE_SCOPES],
    groupIds: [],
    checklist: {},
    createdAt: serverTimestamp(),
    v: 1,
  });
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
    case 'auth/operation-not-allowed':
      return 'GitHub sign-in is not enabled in Firebase — console → Authentication → Sign-in method → GitHub → Enable + Save (docs/SETUP.md §B3).';
    case 'auth/invalid-credential':
    case 'auth/invalid-oauth-client-id':
      return 'The GitHub OAuth client ID/secret in Firebase looks wrong — re-paste both and Save (docs/SETUP.md §B3).';
    default:
      return `Sign-in failed (${codeOf(e) ?? 'unknown error'}). Try again, and check #/diag if it persists.`;
  }
}
