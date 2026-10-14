import { type AuthService, resolveFirebaseConfig } from '@folio-loom/auth';
import { createFirebaseAuthService } from '@folio-loom/auth/firebase';
// The React Native build of @firebase/auth (selected by Metro's "react-native" export condition)
// provides AsyncStorage-backed persistence; the umbrella `firebase/auth` types omit it.
import { connectAuthEmulator, getReactNativePersistence, initializeAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { Platform } from 'react-native';

const APP_NAME = 'folio-loom-mobile';

let service: AuthService | null = null;

/** Expo inlines EXPO_PUBLIC_* only for literal property access. */
export function getAuthService(): AuthService {
  if (service) return service;
  const config = resolveFirebaseConfig(
    {
      mode: process.env.EXPO_PUBLIC_FIREBASE_MODE,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
      authPort: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
    },
    // The Android emulator reaches the host machine at 10.0.2.2; physical devices need the LAN IP.
    { emulatorHost: Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1' },
  );
  const app = getApps().find((existing) => existing.name === APP_NAME) ?? initializeApp(config.options, APP_NAME);
  const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  connectAuthEmulator(auth, config.emulators.authUrl, { disableWarnings: true });
  service = createFirebaseAuthService(auth);
  return service;
}
