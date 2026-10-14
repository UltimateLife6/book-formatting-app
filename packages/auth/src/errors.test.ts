import { describe, expect, it } from 'vitest';
import { safeAuthError, toSafeAuthError } from './errors';

describe('toSafeAuthError', () => {
  it.each(['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/user-not-found'])(
    'maps %s to one shared message so account existence is not revealed',
    (code) => {
      expect(toSafeAuthError({ code, message: 'Firebase: raw detail' })).toEqual(safeAuthError('invalid_credentials'));
    },
  );

  it('maps known codes', () => {
    expect(toSafeAuthError({ code: 'auth/email-already-in-use' }).code).toBe('email_in_use');
    expect(toSafeAuthError({ code: 'auth/weak-password' }).code).toBe('weak_password');
    expect(toSafeAuthError({ code: 'auth/too-many-requests' }).code).toBe('too_many_requests');
    expect(toSafeAuthError({ code: 'auth/network-request-failed' }).code).toBe('network');
  });

  it('never passes raw SDK messages through', () => {
    const raw = 'Firebase: Error (auth/internal-error). projects/123 key=secret';
    for (const input of [{ code: 'auth/internal-error', message: raw }, new Error(raw), raw, null, undefined, 42]) {
      const safe = toSafeAuthError(input);
      expect(safe.code).toBe('unknown');
      expect(safe.message).not.toContain('Firebase');
      expect(safe.message).not.toContain('secret');
    }
  });
});
