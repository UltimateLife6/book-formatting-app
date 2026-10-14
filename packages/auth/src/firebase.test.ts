import type { Auth, User } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/auth', () => sdk);

const { createFirebaseAuthService } = await import('./firebase');

const auth = {} as Auth;
const user = { uid: 'u1', email: 'a@b.co', emailVerified: false } as User;

describe('createFirebaseAuthService', () => {
  let fireAuthState: (user: User | null) => void;
  let fireAuthError: (error: Error) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    sdk.onAuthStateChanged.mockImplementation((_auth, next, error) => {
      fireAuthState = next;
      fireAuthError = error;
      return vi.fn();
    });
  });

  it('starts loading and resolves to the restored session', () => {
    const service = createFirebaseAuthService(auth);
    const listener = vi.fn();
    service.subscribe(listener);
    expect(service.getSnapshot().status).toBe('loading');
    fireAuthState(user);
    expect(service.getSnapshot()).toEqual({ status: 'signedIn', user: { uid: 'u1', email: 'a@b.co', emailVerified: false } });
    expect(listener).toHaveBeenCalledTimes(1);
    fireAuthState(null);
    expect(service.getSnapshot()).toEqual({ status: 'signedOut' });
  });

  it('reports initialization failures without SDK detail', () => {
    const service = createFirebaseAuthService(auth);
    fireAuthError(new Error('Firebase: internal'));
    const state = service.getSnapshot();
    expect(state.status).toBe('error');
    expect(JSON.stringify(state)).not.toContain('Firebase');
  });

  it('validates before calling Firebase', async () => {
    const service = createFirebaseAuthService(auth);
    expect(await service.signUp('bad', 'longenough')).toMatchObject({ ok: false, error: { code: 'invalid_email' } });
    expect(await service.signUp('a@b.co', 'short')).toMatchObject({ ok: false, error: { code: 'weak_password' } });
    expect(await service.signIn('a@b.co', '')).toMatchObject({ ok: false, error: { code: 'invalid_credentials' } });
    expect(sdk.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(sdk.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('trims email and maps SDK failures to safe errors', async () => {
    sdk.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/invalid-credential', message: 'Firebase: raw' });
    const service = createFirebaseAuthService(auth);
    const result = await service.signIn(' a@b.co ', 'password1');
    expect(sdk.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'a@b.co', 'password1');
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_credentials' } });
  });

  it('returns the user on success and signs out', async () => {
    sdk.createUserWithEmailAndPassword.mockResolvedValueOnce({ user });
    sdk.signOut.mockResolvedValueOnce(undefined);
    const service = createFirebaseAuthService(auth);
    expect(await service.signUp('a@b.co', 'password1')).toMatchObject({ ok: true, user: { uid: 'u1' } });
    expect(await service.signOut()).toEqual({ ok: true });
  });

  it('unsubscribes on dispose', () => {
    const unsubscribe = vi.fn();
    sdk.onAuthStateChanged.mockReturnValueOnce(unsubscribe);
    createFirebaseAuthService(auth).dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
