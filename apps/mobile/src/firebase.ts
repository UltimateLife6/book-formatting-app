import { type AuthService, type EmulatorFirebaseConfig, resolveFirebaseConfig } from '@folio-loom/auth';
import { createFirebaseAuthService } from '@folio-loom/auth/firebase';
// The React Native build of @firebase/auth (selected by Metro's "react-native" export condition)
// provides AsyncStorage-backed persistence; the umbrella `firebase/auth` types omit it.
import { type Auth, connectAuthEmulator, getReactNativePersistence, initializeAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, type Firestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { Platform } from 'react-native';

const APP_NAME = 'folio-loom-mobile';

let auth: Auth | null = null;
let service: AuthService | null = null;
let db: Firestore | null = null;

/** Expo inlines EXPO_PUBLIC_* only for literal property access. */
function firebaseConfig(): EmulatorFirebaseConfig {
  return resolveFirebaseConfig(
    {
      mode: process.env.EXPO_PUBLIC_FIREBASE_MODE,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
      authPort: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
      firestorePort: process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT,
    },
    // The Android emulator reaches the host machine at 10.0.2.2; physical devices need the LAN IP.
    { emulatorHost: Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1' },
  );
}

function firebaseApp(): FirebaseApp {
  return getApps().find((existing) => existing.name === APP_NAME) ?? initializeApp(firebaseConfig().options, APP_NAME);
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = initializeAuth(firebaseApp(), { persistence: getReactNativePersistence(AsyncStorage) });
  connectAuthEmulator(auth, firebaseConfig().emulators.authUrl, { disableWarnings: true });
  return auth;
}

export function getAuthService(): AuthService {
  service ??= createFirebaseAuthService(getFirebaseAuth());
  return service;
}

/** Memory cache only: manuscripts live in the device's SQLite store, not in Firestore's cache. */
export function getFirestoreDb(): Firestore {
  if (db) return db;
  const config = firebaseConfig();
  db = initializeFirestore(firebaseApp(), { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
  connectFirestoreEmulator(db, config.emulators.host, config.emulators.firestorePort);
  return db;
}
