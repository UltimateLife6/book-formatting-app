export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * `loading` until the SDK has restored (or failed to restore) the persisted session. UI must
 * treat `loading` exactly like signed out for private content: render nothing private.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: AuthUser }
  | { status: 'error'; message: string };

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_in_use'
  | 'weak_password'
  | 'invalid_email'
  | 'too_many_requests'
  | 'network'
  | 'user_disabled'
  | 'requires_recent_login'
  | 'unknown';

export interface SafeAuthError {
  code: AuthErrorCode;
  /** Shown to the user. Never contains raw SDK messages, tokens, or whether an email exists on sign-in. */
  message: string;
}

export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: SafeAuthError };

/** Platform-neutral auth contract. Compatible with React's `useSyncExternalStore`. */
export interface AuthService {
  getSnapshot(): AuthState;
  subscribe(listener: () => void): () => void;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<{ ok: true } | { ok: false; error: SafeAuthError }>;
}

export const LOADING_STATE: AuthState = Object.freeze({ status: 'loading' });
