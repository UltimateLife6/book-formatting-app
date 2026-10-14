import { describe, expect, it } from 'vitest';
import { gateDecision, routeAccess } from './gate';
import { type AuthState, LOADING_STATE } from './types';

const signedIn: AuthState = { status: 'signedIn', user: { uid: 'u1', email: 'a@b.co', emailVerified: false } };
const signedOut: AuthState = { status: 'signedOut' };
const failed: AuthState = { status: 'error', message: 'nope' };

describe('routeAccess', () => {
  it.each(['/projects', '/projects/abc', '/manuscripts', '/manuscripts/abc/sections/1'])('%s is private', (path) => {
    expect(routeAccess(path)).toBe('private');
  });

  it.each(['/sign-in', '/sign-up'])('%s is guest-only', (path) => {
    expect(routeAccess(path)).toBe('guestOnly');
  });

  it.each(['/', '/about', '/projectsfoo', '/manuscript'])('%s is public', (path) => {
    expect(routeAccess(path)).toBe('public');
  });
});

describe('gateDecision', () => {
  it('never renders private content before auth resolves, when signed out, or on error', () => {
    expect(gateDecision(LOADING_STATE, 'private')).toBe('showLoading');
    expect(gateDecision(signedOut, 'private')).toBe('redirectToSignIn');
    expect(gateDecision(failed, 'private')).toBe('showError');
  });

  it('renders private content only for a signed-in user', () => {
    expect(gateDecision(signedIn, 'private')).toBe('render');
  });

  it('sends signed-in users away from guest-only pages', () => {
    expect(gateDecision(signedIn, 'guestOnly')).toBe('redirectToApp');
    expect(gateDecision(signedOut, 'guestOnly')).toBe('render');
    expect(gateDecision(LOADING_STATE, 'guestOnly')).toBe('showLoading');
  });

  it('always renders public pages', () => {
    for (const state of [LOADING_STATE, signedOut, signedIn, failed]) expect(gateDecision(state, 'public')).toBe('render');
  });
});
