'use client';

import type { AuthUser } from '@folio-loom/auth';
import type { ManuscriptSummary, PreservedCopy } from '@folio-loom/local-storage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '../components/RequireAuth';
import { SignedInHeader } from '../components/SignedInHeader';
import { SyncBadge, SyncBar } from '../components/SyncStatus';
import { useCloudSync } from '../components/useCloudSync';
import { storageProblem, useLocalLibrary } from '../components/useLocalLibrary';

function Library({ user }: { user: AuthUser }) {
  const router = useRouter();
  const { store, library, status } = useLocalLibrary(user.uid);
  const [books, setBooks] = useState<ManuscriptSummary[] | null>(null);
  const [recovered, setRecovered] = useState<PreservedCopy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = status.state.status === 'ready';
  const { engine, sync } = useCloudSync(user.uid, ready);

  const refresh = useCallback(async () => {
    if (!library) return;
    try {
      const [list, preserved] = await Promise.all([library.list(), library.listPreserved()]);
      setBooks(list);
      setRecovered(preserved);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [library]);

  useEffect(() => {
    if (!ready || !store) return;
    void refresh();
    // Books downloaded, merged or deleted by sync appear without a reload.
    return store.onChange((change) => {
      if (change.ownerUid === user.uid) void refresh();
    });
  }, [ready, store, refresh, user.uid]);

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
      if (!window.confirm(`Delete "${request.title}"? It is removed from this browser now, and from the cloud and your other devices when it syncs.`)) return;
      await library.confirmDelete(request.token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function recover(copy: PreservedCopy) {
    if (!library) return;
    try {
      const record = await library.restorePreserved(copy.id);
      router.push(`/manuscripts/${encodeURIComponent(record.bookId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const problem = storageProblem(status);
  return (
    <main>
      <SignedInHeader user={user} />
      <h1>Your manuscripts</h1>
      <p className="muted">Saved in this browser first, then synced to your account.</p>
      <SyncBar engine={engine} sync={sync} />
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
          {books.map((book) => {
            const bookSync = sync.books.get(book.bookId);
            const href = `/manuscripts/${encodeURIComponent(book.bookId)}`;
            return (
              <li key={book.bookId}>
                <Link href={href}>
                  <strong>{book.title}</strong>
                  <span className="muted-line">
                    {book.health === 'unreadable' ? 'Needs recovery' : `${book.wordCount.toLocaleString()} words`} · rev {book.localRevision}
                  </span>
                </Link>
                <span className="book-sync">
                  <SyncBadge status={bookSync} />
                  {bookSync?.conflicts ? (
                    <Link className="button" href={`${href}/conflicts`}>
                      Review {bookSync.conflicts} conflict{bookSync.conflicts === 1 ? '' : 's'}
                    </Link>
                  ) : null}
                  <Link className="button secondary" href={`${href}/snapshots`} aria-label={`Snapshots of ${book.title}`}>
                    Snapshots
                  </Link>
                </span>
                <button type="button" className="secondary danger" onClick={() => remove(book)} aria-label={`Delete ${book.title}`}>
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {recovered.length > 0 ? (
        <section aria-labelledby="recovered-heading">
          <h2 id="recovered-heading">Recovered copies</h2>
          <p className="muted">Versions kept when sync replaced or removed your text. Restoring one opens it as a new manuscript.</p>
          <ul className="outline library">
            {recovered.map((copy) => (
              <li key={copy.id}>
                <span>
                  <strong>{copy.title}</strong>
                  <span className="muted-line">
                    {copy.reason} · {new Date(copy.capturedAt).toLocaleString()}
                  </span>
                </span>
                <button type="button" className="secondary" onClick={() => recover(copy)}>
                  Restore as new manuscript
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

export function ProjectsScreen() {
  return <RequireAuth>{(user) => <Library key={user.uid} user={user} />}</RequireAuth>;
}
