import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';

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
}

export function auth(): Auth {
  if (!authInst) throw new Error('Firebase is not configured yet (docs/SETUP.md §B)');
  return authInst;
}

export function db(): Firestore {
  if (!dbInst) throw new Error('Firebase is not configured yet (docs/SETUP.md §B)');
  return dbInst;
}
