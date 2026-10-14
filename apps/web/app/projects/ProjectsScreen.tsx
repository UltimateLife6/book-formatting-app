'use client';

import type { AuthUser } from '@folio-loom/auth';
import { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { RequireAuth } from '../components/RequireAuth';
import { ManuscriptPreview } from './ManuscriptPreview';

function SignedInHeader({ user }: { user: AuthUser }) {
  const { service } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    if (!service) return;
    setBusy(true);
    const result = await service.signOut();
    setBusy(false);
    if (!result.ok) setError(result.error.message);
  }

  return (
    <header className="account-bar">
      <span className="tag">Signed in as {user.email ?? 'your account'}</span>
      <button type="button" className="secondary" onClick={onSignOut} disabled={busy} aria-busy={busy}>
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
    </header>
  );
}

export function ProjectsScreen() {
  return (
    <RequireAuth>
      {(user) => (
        <main>
          <SignedInHeader user={user} />
          <ManuscriptPreview />
        </main>
      )}
    </RequireAuth>
  );
}
