import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { authEmulatorUrl, demoAppOptions, uniqueEmail } from './env';

/**
 * Exercises the exact module Metro bundles for the Expo app: the React Native build of
 * @firebase/auth (its "react-native" export), with getReactNativePersistence over an
 * AsyncStorage-compatible store. The build only depends on @firebase/{app,component,logger,util},
 * so it runs in Node when loaded by file path. An app restart is simulated by deleting the
 * Firebase app and re-initializing it with the same name over the same storage.
 */
const require = createRequire(import.meta.url);
const authPackage = resolve(require.resolve('@firebase/auth/package.json'), '..');

interface RnUser {
  uid: string;
  email: string | null;
}
interface RnAuthModule {
  initializeAuth(app: unknown, deps: { persistence: unknown }): unknown;
  getReactNativePersistence(storage: AsyncStorageLike): unknown;
  connectAuthEmulator(auth: unknown, url: string, options: { disableWarnings: boolean }): void;
  createUserWithEmailAndPassword(auth: unknown, email: string, password: string): Promise<{ user: RnUser }>;
  signOut(auth: unknown): Promise<void>;
  onAuthStateChanged(auth: unknown, next: (user: RnUser | null) => void): () => void;
}
interface AppModule {
  initializeApp(options: object, name: string): unknown;
  deleteApp(app: unknown): Promise<void>;
}
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const rnEntry = resolve(authPackage, 'dist/rn/index.js');
const rnAuth: RnAuthModule = require(rnEntry);
// Resolved from the RN build's location so both share one @firebase/app instance.
const firebaseApp: AppModule = createRequire(rnEntry)('@firebase/app');

/** Same contract as @react-native-async-storage/async-storage v2's default export. */
function memoryAsyncStorage(): AsyncStorageLike & { keys(): string[] } {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
    keys: () => [...data.keys()],
  };
}

const APP_NAME = `rn-restore-${Date.now()}`;
const live: unknown[] = [];

/** Starts the "app" and resolves with the first auth state, i.e. the restored session. */
async function launch(storage: AsyncStorageLike): Promise<{ app: unknown; auth: unknown; restored: RnUser | null }> {
  const app = firebaseApp.initializeApp(demoAppOptions, APP_NAME);
  live.push(app);
  const auth = rnAuth.initializeAuth(app, { persistence: rnAuth.getReactNativePersistence(storage) });
  rnAuth.connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  const restored = await new Promise<RnUser | null>((done) => {
    const unsubscribe = rnAuth.onAuthStateChanged(auth, (user) => {
      unsubscribe();
      done(user);
    });
  });
  return { app, auth, restored };
}

async function quit(app: unknown) {
  await firebaseApp.deleteApp(app);
  live.splice(live.indexOf(app), 1);
}

afterAll(async () => {
  for (const app of [...live]) await firebaseApp.deleteApp(app);
});

describe('React Native auth persistence (AsyncStorage)', () => {
  it('starts signed out on a fresh install', async () => {
    const { app, restored } = await launch(memoryAsyncStorage());
    expect(restored).toBeNull();
    await quit(app);
  });

  it('restores the session after an app restart and forgets it after sign-out', async () => {
    const storage = memoryAsyncStorage();
    const email = uniqueEmail('rn');

    const first = await launch(storage);
    const { user } = await rnAuth.createUserWithEmailAndPassword(first.auth, email, 'correct horse battery');
    expect(storage.keys().some((key) => key.startsWith('firebase:authUser:'))).toBe(true);
    await quit(first.app);

    const second = await launch(storage);
    expect(second.restored?.uid).toBe(user.uid);
    expect(second.restored?.email).toBe(email);

    await rnAuth.signOut(second.auth);
    expect(storage.keys().some((key) => key.startsWith('firebase:authUser:'))).toBe(false);
    await quit(second.app);

    const third = await launch(storage);
    expect(third.restored).toBeNull();
    await quit(third.app);
  });
});
