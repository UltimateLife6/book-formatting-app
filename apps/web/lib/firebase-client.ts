import { createFirebaseAuthService } from '@folio-loom/auth/firebase';
import { type AuthService, type EmulatorFirebaseConfig, resolveFirebaseConfig } from '@folio-loom/auth';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const APP_NAME = 'folio-loom-web';

let auth: Auth | null = null;
let service: AuthService | null = null;
let db: Firestore | null = null;

/** Next inlines NEXT_PUBLIC_* only for literal property access. */
export function firebaseConfig(): EmulatorFirebaseConfig {
  return resolveFirebaseConfig(
    {
      mode: process.env.NEXT_PUBLIC_FIREBASE_MODE,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      emulatorHost: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST,
      authPort: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
      firestorePort: process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT,
    },
    { emulatorHost: '127.0.0.1' },
  );
}

function firebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') throw new Error('Firebase is only initialized in the browser.');
  return getApps().find((existing) => existing.name === APP_NAME) ?? initializeApp(firebaseConfig().options, APP_NAME);
}

/** Browser only. Sessions persist in IndexedDB (localStorage fallback) and survive reloads. */
export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = initializeAuth(firebaseApp(), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  connectAuthEmulator(auth, firebaseConfig().emulators.authUrl, { disableWarnings: true });
  return auth;
}

export function getAuthService(): AuthService {
  service ??= createFirebaseAuthService(getFirebaseAuth());
  return service;
}

/**
 * Memory cache only: this browser's manuscripts live in the local store, so Firestore must not
 * keep a second, account-shared copy in IndexedDB.
 */
export function getFirestoreDb(): Firestore {
  if (db) return db;
  const config = firebaseConfig();
  db = initializeFirestore(firebaseApp(), { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, config.emulators.host, config.emulators.firestorePort);
  return db;
}
