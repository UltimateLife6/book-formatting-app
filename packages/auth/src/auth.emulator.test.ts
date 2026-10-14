import { deleteApp, type FirebaseApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, inMemoryPersistence, initializeAuth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveFirebaseConfig } from './config';
import { createFirebaseAuthService } from './firebase';
import type { AuthService, AuthState } from './types';

const config = resolveFirebaseConfig(
  { emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(':')[0], authPort: process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(':')[1] },
  { emulatorHost: '127.0.0.1' },
);
const PASSWORD = 'correct horse battery';
const email = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

let app: FirebaseApp;
let service: AuthService & { dispose(): void };

function settled(service: AuthService): Promise<AuthState> {
  return new Promise((resolve) => {
    const check = () => {
      const state = service.getSnapshot();
      if (state.status !== 'loading') {
        unsubscribe();
        resolve(state);
      }
    };
    const unsubscribe = service.subscribe(check);
    check();
  });
}

function waitFor(service: AuthService, status: AuthState['status']): Promise<AuthState> {
  return new Promise((resolve) => {
    const check = () => {
      const state = service.getSnapshot();
      if (state.status === status) {
        unsubscribe();
        resolve(state);
      }
    };
    const unsubscribe = service.subscribe(check);
    check();
  });
}

beforeEach(() => {
  app = initializeApp(config.options, `auth-test-${Date.now()}-${Math.random()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, config.emulators.authUrl, { disableWarnings: true });
  service = createFirebaseAuthService(auth);
});

afterEach(async () => {
  service.dispose();
  await deleteApp(app);
});

describe('Firebase auth service against the Auth emulator', () => {
  it('initializes from loading to signed out when there is no session', async () => {
    expect(service.getSnapshot().status).toBe('loading');
    expect(await settled(service)).toEqual({ status: 'signedOut' });
  });

  it('signs up, signs out and signs back in', async () => {
    await settled(service);
    const address = email('flow');

    const signUp = await service.signUp(address, PASSWORD);
    expect(signUp.ok).toBe(true);
    const signedIn = await waitFor(service, 'signedIn');
    expect(signedIn.status === 'signedIn' && signedIn.user.email).toBe(address);

    expect(await service.signOut()).toEqual({ ok: true });
    expect(await waitFor(service, 'signedOut')).toEqual({ status: 'signedOut' });

    const signIn = await service.signIn(address.toUpperCase(), PASSWORD);
    expect(signIn.ok && signIn.user.email).toBe(address);
    await waitFor(service, 'signedIn');
  });

  it('returns the same safe error for a wrong password and an unknown account', async () => {
    await settled(service);
    const address = email('invalid');
    await service.signUp(address, PASSWORD);
    await service.signOut();

    const wrongPassword = await service.signIn(address, 'not the password');
    const unknownAccount = await service.signIn(email('nobody'), PASSWORD);
    expect(wrongPassword).toMatchObject({ ok: false, error: { code: 'invalid_credentials' } });
    expect(unknownAccount).toEqual(wrongPassword);
    expect(service.getSnapshot().status).toBe('signedOut');
  });

  it('reports an email that is already registered', async () => {
    await settled(service);
    const address = email('dupe');
    await service.signUp(address, PASSWORD);
    await service.signOut();
    expect(await service.signUp(address, PASSWORD)).toMatchObject({ ok: false, error: { code: 'email_in_use' } });
  });
});
