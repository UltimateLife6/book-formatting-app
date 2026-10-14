import { describe, expect, it } from 'vitest';
import { hasCredentialErrors, PASSWORD_MAX_LENGTH, validateCredentials } from './validation';

describe('validateCredentials', () => {
  it('accepts valid credentials', () => {
    expect(hasCredentialErrors(validateCredentials('writer@example.com', 'correct horse', 'signUp'))).toBe(false);
    expect(hasCredentialErrors(validateCredentials(' writer@example.com ', 'x', 'signIn'))).toBe(false);
  });

  it('rejects malformed email and empty password', () => {
    const errors = validateCredentials('not-an-email', '', 'signIn');
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('requires a minimum length only when creating an account', () => {
    expect(validateCredentials('a@b.co', 'short', 'signUp').password).toMatch(/at least 8/);
    expect(validateCredentials('a@b.co', 'short', 'signIn').password).toBeUndefined();
  });

  it('caps password length', () => {
    expect(validateCredentials('a@b.co', 'x'.repeat(PASSWORD_MAX_LENGTH + 1), 'signIn').password).toMatch(/at most/);
  });
});
