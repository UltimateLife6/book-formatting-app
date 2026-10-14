'use client';

import { type CredentialErrors, type CredentialMode, gateDecision, hasCredentialErrors, validateCredentials } from '@folio-loom/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { AuthGateView } from './AuthGateView';
import { useAuth } from './AuthProvider';

const COPY = {
  signIn: { title: 'Sign in', submit: 'Sign in', busy: 'Signing in…', switchText: 'New to Folio Loom?', switchLink: '/sign-up', switchLabel: 'Create an account' },
  signUp: { title: 'Create your account', submit: 'Create account', busy: 'Creating account…', switchText: 'Already have an account?', switchLink: '/sign-in', switchLabel: 'Sign in' },
} as const;

/** Only same-site paths are honoured, so `?next=` can't redirect off-site. */
function safeNext(value: string | null): string {
  // Browsers treat `/\host` like `//host`, so backslashes are rejected too.
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/projects';
}

export function AuthForm({ mode }: { mode: CredentialMode }) {
  const { state, service } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const decision = gateDecision(state, 'guestOnly');
  const copy = COPY[mode];
  const ids = { email: useId(), password: useId(), error: useId() };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (decision === 'redirectToApp') router.replace(next);
  }, [decision, next, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const errors = validateCredentials(email, password, mode);
    setFieldErrors(errors);
    if (hasCredentialErrors(errors) || !service) return;
    setBusy(true);
    const result = mode === 'signUp' ? await service.signUp(email, password) : await service.signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error.message);
      setPassword('');
    }
  }

  return (
    <AuthGateView decision={decision} errorMessage={state.status === 'error' ? state.message : undefined}>
      {() => (
        <main>
          <h1>{copy.title}</h1>
          <form className="auth-form" onSubmit={onSubmit} noValidate aria-describedby={formError ? ids.error : undefined}>
            {formError ? (
              <p id={ids.error} className="notice error" role="alert">
                {formError}
              </p>
            ) : null}
            <label htmlFor={ids.email}>Email</label>
            <input
              id={ids.email}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? `${ids.email}-error` : undefined}
              required
            />
            {fieldErrors.email ? (
              <p id={`${ids.email}-error`} className="field-error">
                {fieldErrors.email}
              </p>
            ) : null}
            <label htmlFor={ids.password}>Password</label>
            <input
              id={ids.password}
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? `${ids.password}-error` : undefined}
              required
            />
            {fieldErrors.password ? (
              <p id={`${ids.password}-error`} className="field-error">
                {fieldErrors.password}
              </p>
            ) : null}
            <button type="submit" disabled={busy || !service} aria-busy={busy}>
              {busy ? copy.busy : copy.submit}
            </button>
          </form>
          <p className="muted">
            {copy.switchText} <a href={copy.switchLink}>{copy.switchLabel}</a>
          </p>
          <p className="dev-note">Development build: accounts live in the local Firebase Auth emulator only.</p>
        </main>
      )}
    </AuthGateView>
  );
}
