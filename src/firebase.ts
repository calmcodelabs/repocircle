import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';

/** False until docs/SETUP.md §B has been done and the config pasted. */
export const isConfigured = !Object.values(firebaseConfig).some((v) => v.includes('PASTE'));

let authInst: Auth | null = null;
let dbInst: Firestore | null = null;

if (isConfigured) {
  const app: FirebaseApp = initializeApp(firebaseConfig);
  authInst = getAuth(app);
  // Offline-first: Firestore persists to IndexedDB and syncs across tabs.
  dbInst = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

export function auth(): Auth {
  if (!authInst) throw new Error('Firebase is not configured yet (docs/SETUP.md §B)');
  return authInst;
}

export function db(): Firestore {
  if (!dbInst) throw new Error('Firebase is not configured yet (docs/SETUP.md §B)');
  return dbInst;
}
