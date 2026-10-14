import {
  type Auth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { safeAuthError, toSafeAuthError } from './errors';
import { type AuthResult, type AuthService, type AuthState, type AuthUser, LOADING_STATE } from './types';
import { validateCredentials } from './validation';

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, email: user.email, emailVerified: user.emailVerified };
}

/**
 * Adapter over an already-initialized Firebase `Auth`. Platform setup (persistence, emulator
 * connection) happens in each app; this file only uses the API shared by the web and React
 * Native builds of `firebase/auth`.
 */
export function createFirebaseAuthService(auth: Auth): AuthService & { dispose(): void } {
  let state: AuthState = LOADING_STATE;
  const listeners = new Set<() => void>();
  const emit = (next: AuthState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  // Fires once the persisted session has been restored (or found absent).
  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => emit(user ? { status: 'signedIn', user: toAuthUser(user) } : { status: 'signedOut' }),
    () => emit({ status: 'error', message: "We couldn't check your session. Please try again." }),
  );

  const run = async (mode: 'signIn' | 'signUp', email: string, password: string): Promise<AuthResult> => {
    const errors = validateCredentials(email, password, mode);
    if (errors.email) return { ok: false, error: safeAuthError('invalid_email') };
    if (errors.password) return { ok: false, error: safeAuthError(mode === 'signUp' ? 'weak_password' : 'invalid_credentials') };
    try {
      const action = mode === 'signUp' ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
      const credential = await action(auth, email.trim(), password);
      return { ok: true, user: toAuthUser(credential.user) };
    } catch (error) {
      return { ok: false, error: toSafeAuthError(error) };
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signUp: (email, password) => run('signUp', email, password),
    signIn: (email, password) => run('signIn', email, password),
    async signOut() {
      try {
        await signOut(auth);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: toSafeAuthError(error) };
      }
    },
    dispose() {
      unsubscribe();
      listeners.clear();
    },
  };
}
