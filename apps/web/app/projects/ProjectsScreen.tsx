'use client';

import type { AuthUser } from '@folio-loom/auth';
import type { ManuscriptSummary } from '@folio-loom/local-storage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '../components/RequireAuth';
import { SignedInHeader } from '../components/SignedInHeader';
import { storageProblem, useLocalLibrary } from '../components/useLocalLibrary';

function Library({ user }: { user: AuthUser }) {
  const router = useRouter();
  const { library, status } = useLocalLibrary(user.uid);
  const [books, setBooks] = useState<ManuscriptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = status.state.status === 'ready';

  const refresh = useCallback(async () => {
    if (!library) return;
    try {
      setBooks(await library.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [library]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  async function create() {
    if (!library) return;
    setBusy(true);
    try {
      const record = await library.create();
      router.push(`/manuscripts/${encodeURIComponent(record.bookId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function remove(book: ManuscriptSummary) {
    if (!library) return;
    try {
      const request = await library.requestDelete(book.bookId);
      if (!window.confirm(`Delete "${request.title}" and its saved revisions from this browser? This cannot be undone.`)) return;
      await library.confirmDelete(request.token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const problem = storageProblem(status);
  return (
    <main>
      <SignedInHeader user={user} />
      <h1>Your manuscripts</h1>
      <p className="muted">Stored in this browser only. Cloud sync is not available yet.</p>
      {problem ? (
        <p className="notice error" role="alert">
          {problem}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button type="button" onClick={create} disabled={!ready || busy} aria-busy={busy}>
          New blank manuscript
        </button>
      </div>
      {status.state.status === 'opening' || (ready && books === null) ? (
        <p className="muted" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Opening local storage…
        </p>
      ) : null}
      {books?.length === 0 ? <p className="muted">No manuscripts yet.</p> : null}
      {books && books.length > 0 ? (
        <ul className="outline library">
          {books.map((book) => (
            <li key={book.bookId}>
              <Link href={`/manuscripts/${encodeURIComponent(book.bookId)}`}>
                <strong>{book.title}</strong>
                <span className="muted-line">
                  {book.health === 'unreadable' ? 'Needs recovery' : `${book.wordCount.toLocaleString()} words`} · rev {book.localRevision}
                  {book.dirty ? ' · not synced' : ''}
                </span>
              </Link>
              <button type="button" className="secondary danger" onClick={() => remove(book)} aria-label={`Delete ${book.title}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

export function ProjectsScreen() {
  return <RequireAuth>{(user) => <Library key={user.uid} user={user} />}</RequireAuth>;
}
