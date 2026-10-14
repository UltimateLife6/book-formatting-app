'use client';

import { type AuthUser, gateDecision } from '@folio-loom/auth';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { AuthGateView } from './AuthGateView';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: (user: AuthUser) => ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const decision = gateDecision(state, 'private');

  useEffect(() => {
    if (decision === 'redirectToSignIn') router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [decision, pathname, router]);

  return (
    <AuthGateView decision={decision} errorMessage={state.status === 'error' ? state.message : undefined}>
      {() => (state.status === 'signedIn' ? children(state.user) : null)}
    </AuthGateView>
  );
}
