import type { AuthErrorCode, SafeAuthError } from './types';

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'The email or password is incorrect.',
  email_in_use: 'An account with this email already exists. Try signing in instead.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  invalid_email: 'Enter a valid email address.',
  too_many_requests: 'Too many attempts. Wait a few minutes and try again.',
  network: "Can't reach the sign-in service. Check your connection and try again.",
  user_disabled: 'This account has been disabled.',
  requires_recent_login: 'Please sign in again to continue.',
  unknown: 'Something went wrong. Please try again.',
};

/** Sign-in failures share one message so the form never reveals whether an email is registered. */
const FIREBASE_CODES: Record<string, AuthErrorCode> = {
  'auth/invalid-credential': 'invalid_credentials',
  'auth/invalid-login-credentials': 'invalid_credentials',
  'auth/wrong-password': 'invalid_credentials',
  'auth/user-not-found': 'invalid_credentials',
  'auth/missing-password': 'invalid_credentials',
  'auth/email-already-in-use': 'email_in_use',
  'auth/weak-password': 'weak_password',
  'auth/invalid-email': 'invalid_email',
  'auth/missing-email': 'invalid_email',
  'auth/too-many-requests': 'too_many_requests',
  'auth/network-request-failed': 'network',
  'auth/user-disabled': 'user_disabled',
  'auth/requires-recent-login': 'requires_recent_login',
};

export function safeAuthError(code: AuthErrorCode): SafeAuthError {
  return { code, message: MESSAGES[code] };
}

export function toSafeAuthError(error: unknown): SafeAuthError {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  return safeAuthError(FIREBASE_CODES[code] ?? 'unknown');
}
