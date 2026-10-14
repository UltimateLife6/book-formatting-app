'use client';

import type { AuthUser } from '@folio-loom/auth';
import {
  CONFLICT_EXPLANATION,
  ConflictResolutionError,
  type ConflictView,
  conflictOptions,
  conflictSides,
  type SyncEngine,
} from '@folio-loom/cloud-sync';
import type { ConflictChoice } from '@folio-loom/sync';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '../../../components/RequireAuth';
import { SignedInHeader } from '../../../components/SignedInHeader';
import { SyncBar } from '../../../components/SyncStatus';
import { useCloudSync } from '../../../components/useCloudSync';
import { storageProblem, useLocalLibrary } from '../../../components/useLocalLibrary';

function Conflicts({ user, bookId }: { user: AuthUser; bookId: string }) {
  const { status } = useLocalLibrary(user.uid);
  const ready = status.state.status === 'ready';
  const { engine, sync } = useCloudSync(user.uid, ready);
  const problem = storageProblem(status);
  const back = `/manuscripts/${encodeURIComponent(bookId)}`;

  return (
    <main>
      <SignedInHeader user={user} />
      <p>
        <Link href={back}>← Back to manuscript</Link> · <Link href="/projects">All manuscripts</Link>
      </p>
      <h1>Resolve sync conflicts</h1>
      <p className="muted">
        Both versions are kept until you choose. Whatever you replace is saved under “Recovered copies” in your library, so no text is lost.
      </p>
      <SyncBar engine={engine} sync={sync} />
      {problem ? (
        <p className="notice error" role="alert">
          {problem}
        </p>
      ) : null}
      {engine ? <ConflictList engine={engine} bookId={bookId} /> : null}
    </main>
  );
}

function ConflictList({ engine, bookId }: { engine: SyncEngine; bookId: string }) {
  const [views, setViews] = useState<ConflictView[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setViews(await engine.getConflicts(bookId));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, [engine, bookId]);

  // Re-read whenever this book's sync status changes, so edits that arrive while the screen is open appear.
  useEffect(() => {
    void load();
    let last = engine.getSnapshot().books.get(bookId);
    return engine.subscribe(() => {
      const next = engine.getSnapshot().books.get(bookId);
      if (next === last) return;
      last = next;
      void load();
    });
  }, [engine, bookId, load]);

  async function choose(view: ConflictView, choice: ConflictChoice) {
    setBusy(view.conflict.id);
    setNotice(null);
    try {
      await engine.resolveConflict(bookId, view.conflict.id, choice, view.expected);
    } catch (e) {
      if (e instanceof ConflictResolutionError && (e.reason === 'changed' || e.reason === 'not_found')) {
        setNotice('This conflict changed while you were looking at it (another edit or sync arrived). The latest versions are shown below; please choose again.');
      } else {
        setNotice(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
      await load();
    }
  }

  if (!views) {
    return (
      <p className="muted" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Loading conflicts…
      </p>
    );
  }
  return (
    <>
      {notice ? (
        <p className="notice error" role="alert">
          {notice}
        </p>
      ) : null}
      {views.length === 0 ? <p className="notice">No conflicts. This manuscript is up to date with your other devices.</p> : null}
      {views.map((view) => {
        const sides = conflictSides(view);
        return (
          <article key={view.conflict.id} className="conflict" data-conflict-kind={view.conflict.kind}>
            <h2>{view.conflict.title || 'Untitled section'}</h2>
            <p>{CONFLICT_EXPLANATION[view.conflict.kind]}</p>
            <div className="conflict-sides">
              {[sides.mine, sides.theirs].map((side) => (
                <section key={side.label} aria-label={side.label}>
                  <h3>{side.label}</h3>
                  <pre className="conflict-text">{side.text}</pre>
                </section>
              ))}
            </div>
            <div className="actions">
              {conflictOptions(view.conflict.kind).map((option) => (
                <button
                  key={option.choice}
                  type="button"
                  className={option.choice === 'both' ? '' : 'secondary'}
                  onClick={() => choose(view, option.choice)}
                  disabled={busy !== null}
                  aria-busy={busy === view.conflict.id}
                  title={option.hint}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <ul className="muted conflict-hints">
              {conflictOptions(view.conflict.kind).map((option) => (
                <li key={option.choice}>
                  <strong>{option.label}:</strong> {option.hint}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </>
  );
}

export function ConflictsScreen({ bookId }: { bookId: string }) {
  return <RequireAuth>{(user) => <Conflicts key={user.uid} user={user} bookId={bookId} />}</RequireAuth>;
}
