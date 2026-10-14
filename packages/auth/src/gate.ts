import type { AuthState } from './types';

export type GateDecision = 'showLoading' | 'showError' | 'redirectToSignIn' | 'redirectToApp' | 'render';

export type RouteAccess = 'public' | 'guestOnly' | 'private';

const PRIVATE_PREFIXES = ['/projects', '/manuscripts'];
const GUEST_ONLY = ['/sign-in', '/sign-up'];

export function routeAccess(pathname: string): RouteAccess {
  const path = pathname.split(/[?#]/)[0] ?? '/';
  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return 'private';
  if (GUEST_ONLY.includes(path)) return 'guestOnly';
  return 'public';
}

/**
 * What a screen may show for the current auth state. Private content renders only when the
 * session is confirmed; `loading` and `error` never fall through to private content.
 */
export function gateDecision(state: AuthState, access: RouteAccess): GateDecision {
  if (access === 'public') return 'render';
  switch (state.status) {
    case 'loading':
      return 'showLoading';
    case 'error':
      return access === 'private' ? 'showError' : 'render';
    case 'signedOut':
      return access === 'private' ? 'redirectToSignIn' : 'render';
    case 'signedIn':
      return access === 'private' ? 'render' : 'redirectToApp';
  }
}
