import { createFirebaseAuthService } from '@folio-loom/auth/firebase';
import { type AuthService, type EmulatorFirebaseConfig, resolveFirebaseConfig } from '@folio-loom/auth';
import { getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';

const APP_NAME = 'folio-loom-web';

let service: AuthService | null = null;

/** Next inlines NEXT_PUBLIC_* only for literal property access. */
export function firebaseConfig(): EmulatorFirebaseConfig {
  return resolveFirebaseConfig(
    {
      mode: process.env.NEXT_PUBLIC_FIREBASE_MODE,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      emulatorHost: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST,
      authPort: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
    },
    { emulatorHost: '127.0.0.1' },
  );
}

/** Browser only. Sessions persist in IndexedDB (localStorage fallback) and survive reloads. */
export function getAuthService(): AuthService {
  if (typeof window === 'undefined') throw new Error('Firebase Auth is only initialized in the browser.');
  if (service) return service;
  const config = firebaseConfig();
  const app = getApps().find((existing) => existing.name === APP_NAME) ?? initializeApp(config.options, APP_NAME);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  connectAuthEmulator(auth, config.emulators.authUrl, { disableWarnings: true });
  service = createFirebaseAuthService(auth);
  return service;
}
