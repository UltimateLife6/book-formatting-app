import type { GateDecision } from '@folio-loom/auth';
import type { ReactNode } from 'react';

interface AuthGateViewProps {
  decision: GateDecision;
  errorMessage?: string;
  /** Called only when the session is confirmed, so private UI is never created early. */
  children: () => ReactNode;
}

/** Presentational gate: no routing or Firebase imports, so it can be rendered in tests. */
export function AuthGateView({ decision, errorMessage, children }: AuthGateViewProps) {
  switch (decision) {
    case 'render':
      return <>{children()}</>;
    case 'showError':
      return (
        <main>
          <div className="notice error" role="alert">
            <p>{errorMessage ?? "We couldn't check your session."}</p>
            <p>
              <a href="/sign-in">Go to sign in</a>
            </p>
          </div>
        </main>
      );
    case 'redirectToSignIn':
    case 'redirectToApp':
      return (
        <main>
          <p className="notice" role="status" aria-live="polite">
            Redirecting…
          </p>
        </main>
      );
    case 'showLoading':
      return (
        <main aria-busy="true">
          <p className="notice" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" /> Checking your session…
          </p>
        </main>
      );
  }
}
