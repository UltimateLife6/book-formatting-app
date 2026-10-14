import { type AuthState, gateDecision, LOADING_STATE } from '@folio-loom/auth';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthGateView } from './AuthGateView';

const PRIVATE = 'PRIVATE MANUSCRIPT TEXT';

function render(state: AuthState) {
  const children = vi.fn(() => <p>{PRIVATE}</p>);
  const html = renderToStaticMarkup(
    <AuthGateView decision={gateDecision(state, 'private')} errorMessage={state.status === 'error' ? state.message : undefined}>
      {children}
    </AuthGateView>,
  );
  return { html, children };
}

describe('AuthGateView on a private route', () => {
  it('shows an accessible loading state and never builds private UI while auth resolves', () => {
    const { html, children } = render(LOADING_STATE);
    expect(html).not.toContain(PRIVATE);
    expect(children).not.toHaveBeenCalled();
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Checking your session');
  });

  it('does not render private content when signed out', () => {
    const { html, children } = render({ status: 'signedOut' });
    expect(html).not.toContain(PRIVATE);
    expect(children).not.toHaveBeenCalled();
    expect(html).toContain('Redirecting');
  });

  it('shows an alert with a sign-in link on failure', () => {
    const { html, children } = render({ status: 'error', message: 'Session check failed.' });
    expect(html).not.toContain(PRIVATE);
    expect(children).not.toHaveBeenCalled();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Session check failed.');
    expect(html).toContain('href="/sign-in"');
  });

  it('renders private content once signed in', () => {
    const { html } = render({ status: 'signedIn', user: { uid: 'u1', email: 'a@b.co', emailVerified: false } });
    expect(html).toContain(PRIVATE);
  });
});
