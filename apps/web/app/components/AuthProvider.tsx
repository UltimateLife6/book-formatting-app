'use client';

import { type AuthService, type AuthState, LOADING_STATE } from '@folio-loom/auth';
import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';
import { getAuthService } from '../../lib/firebase-client';

interface AuthContextValue {
  state: AuthState;
  service: AuthService | null;
}

const AuthContext = createContext<AuthContextValue>({ state: LOADING_STATE, service: null });

const noopSubscribe = () => () => {};
const loading = () => LOADING_STATE;

export function AuthProvider({ children }: { children: ReactNode }) {
  const setup = useMemo((): { service: AuthService | null; error: string | null } => {
    if (typeof window === 'undefined') return { service: null, error: null };
    try {
      return { service: getAuthService(), error: null };
    } catch (error) {
      return { service: null, error: error instanceof Error ? error.message : 'Firebase is not configured.' };
    }
  }, []);

  const service = setup.service;
  const state = useSyncExternalStore(
    service ? service.subscribe : noopSubscribe,
    service ? service.getSnapshot : loading,
    // Server render and hydration always see `loading`, so no private content is prerendered.
    loading,
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state: setup.error ? { status: 'error', message: setup.error } : state, service }),
    [setup.error, state, service],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
