import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';

/**
 * Local emulators instead of the real project. Opt-in per run
 * (`npm run dev:emulator`), never in a production build: the guard is
 * `import.meta.env.DEV`, which vite replaces with a literal `false` and then
 * tree-shakes, so none of this reaches the bundle users get.
 *
 * This exists because a day of ordinary development exhausted the production
 * free tier and took the app down (SCALING.md). Developing against the thing
 * real people use was always the actual bug.
 */
const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_EMULATORS === '1';

/** False until docs/SETUP.md §B has been done and the config pasted. */
export const isConfigured = !Object.values(firebaseConfig).some((v) => v.includes('PASTE'));

let authInst: Auth | null = null;
let dbInst: Firestore | null = null;

if (isConfigured) {
  const app: FirebaseApp = initializeApp(firebaseConfig);
  authInst = getAuth(app);
  // Memory cache, not IndexedDB (ADR-016). A persistent cache renders writes the
  // server hasn't accepted and keeps serving documents the server no longer has —
  // which produced hours of phantom bugs: circles that "saved" then vanished, joins
  // that looked successful, members appearing and disappearing. What the screen
  // shows should be what the server confirmed.
  dbInst = initializeFirestore(app, { localCache: memoryLocalCache() });
  if (USE_EMULATORS) {
    connectAuthEmulator(authInst, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(dbInst, '127.0.0.1', 8080);
    // Loud on purpose: mistaking emulator data for real data wastes an hour.
    console.info('[RepoCircle] using local emulators — no production data is involved');
  }
}

/** True when this tab is talking to the local emulators (shown on #/diag). */
export const usingEmulators = USE_EMULATORS;

export function auth(): Auth {
  if (!authInst) throw new Error('Firebase is not configured yet (docs/SETUP.md §B)');
  return authInst;
}

export function db(): Firestore {
  if (!dbInst) throw new Error('Firebase is not configured yet (docs/SETUP.md §B)');
  return dbInst;
}
