export type CredentialMode = 'signIn' | 'signUp';

export interface CredentialErrors {
  email?: string;
  password?: string;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side checks only; the Auth service is still the authority. */
export function validateCredentials(email: string, password: string, mode: CredentialMode): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (password.length === 0) {
    errors.password = 'Enter your password.';
  } else if (mode === 'signUp' && password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return errors;
}

export function hasCredentialErrors(errors: CredentialErrors): boolean {
  return errors.email !== undefined || errors.password !== undefined;
}
