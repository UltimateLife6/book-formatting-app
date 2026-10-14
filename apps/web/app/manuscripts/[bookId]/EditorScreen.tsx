'use client';

import type { AuthUser } from '@folio-loom/auth';
import type { Manuscript } from '@folio-loom/book-model';
import {
  type AutosaveController,
  createManuscriptAutosave,
  firstParagraphText,
  type LoadResult,
  type LocalManuscriptRecord,
  SAVE_STATUS_LABEL,
  type UserLibrary,
  withFirstParagraph,
  withTitle,
} from '@folio-loom/local-storage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RequireAuth } from '../../components/RequireAuth';
import { storageProblem, useLocalLibrary } from '../../components/useLocalLibrary';
import { SignedInHeader } from '../../components/SignedInHeader';

function Loader({ user, bookId }: { user: AuthUser; bookId: string }) {
  const { library, status } = useLocalLibrary(user.uid);
  const [result, setResult] = useState<LoadResult | null>(null);
  const ready = status.state.status === 'ready';

  useEffect(() => {
    if (!library || !ready) return;
    let cancelled = false;
    setResult(null);
    library.load(bookId).then(
      (loaded) => !cancelled && setResult(loaded),
      (e: unknown) => !cancelled && setResult({ ok: false, reason: 'corrupt', message: e instanceof Error ? e.message : String(e), revisions: [] }),
    );
    return () => {
      cancelled = true;
    };
  }, [library, ready, bookId]);

  const problem = storageProblem(status);
  if (problem || !library) {
    return (
      <main>
        <SignedInHeader user={user} />
        <p className="notice error" role="alert">
          {problem ?? 'Local storage is not available in this browser.'}
        </p>
        <Link href="/projects">Back to manuscripts</Link>
      </main>
    );
  }
  if (!result) {
    return (
      <main>
        <p className="muted" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Opening manuscript…
        </p>
      </main>
    );
  }
  if (!result.ok) {
    return <Recovery user={user} library={library} bookId={bookId} result={result} onRestored={(record) => setResult({ ok: true, record, migratedFrom: null })} />;
  }
  return <Editor key={`${result.record.bookId}:${result.record.localRevision}`} user={user} library={library} initial={result.record} />;
}

function Editor({ user, library, initial }: { user: AuthUser; library: UserLibrary; initial: LocalManuscriptRecord }) {
  const [autosave, setAutosave] = useState<AutosaveController<Manuscript> | null>(null);

  // The effect owns the controller. React may unmount and remount (Strict Mode, fast refresh), and a
  // controller closed by an earlier cleanup must never be reused.
  useEffect(() => {
    const controller = createManuscriptAutosave(library, initial);
    setAutosave(controller);
    // Unmount (navigation, or account change): save what is pending into this book's own account, then stop.
    return () => void controller.close();
  }, [library, initial]);

  if (!autosave) return null;
  return <EditorForm user={user} autosave={autosave} initial={initial} />;
}

function EditorForm({ user, autosave, initial }: { user: AuthUser; autosave: AutosaveController<Manuscript>; initial: LocalManuscriptRecord }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(autosave.subscribe, autosave.getSnapshot, autosave.getSnapshot);
  const doc = useRef(initial.manuscript);
  const [title, setTitle] = useState(initial.manuscript.title);
  const [paragraph, setParagraph] = useState(() => firstParagraphText(initial.manuscript));
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Save as soon as the tab is hidden: mobile browsers may discard background tabs without unload.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void autosave.flush();
    };
    // Best effort: the write starts but the browser may not wait for it to commit.
    const onPageHide = () => void autosave.flush();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosave.hasUnsavedChanges()) return;
      void autosave.flush();
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [autosave]);

  function edit(next: Manuscript) {
    doc.current = next;
    autosave.update(next);
  }

  async function flushOrConfirm(action: string): Promise<boolean> {
    const settled = await autosave.flush();
    if (settled.status === 'saved') return true;
    return window.confirm(`Your latest changes could not be saved. ${action} anyway and lose them?`);
  }

  async function close() {
    setClosing(true);
    const ok = await flushOrConfirm('Close');
    setClosing(false);
    if (ok) router.push('/projects');
  }

  const failed = snapshot.status === 'failed';
  return (
    <main>
      <SignedInHeader user={user} beforeSignOut={() => flushOrConfirm('Sign out')} />
      <div className="editor-bar">
        <button type="button" className="secondary" onClick={close} disabled={closing} aria-busy={closing}>
          {closing ? 'Saving…' : 'Close'}
        </button>
        <output className={failed ? 'save-status failed' : 'save-status'} aria-live="polite" data-status={snapshot.status}>
          {SAVE_STATUS_LABEL[snapshot.status]}
        </output>
      </div>
      {failed ? (
        <div className="notice error" role="alert">
          <p>{snapshot.error?.message ?? 'Saving failed.'} Your changes are still on this page and have not been lost.</p>
          <button type="button" className="secondary" onClick={() => void autosave.retry()}>
            Retry save
          </button>
        </div>
      ) : null}
      <form className="auth-form editor" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="manuscript-title">Title</label>
        <input
          id="manuscript-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            edit(withTitle(doc.current, event.target.value));
          }}
        />
        <label htmlFor="manuscript-paragraph">First paragraph</label>
        <textarea
          id="manuscript-paragraph"
          rows={10}
          value={paragraph}
          onChange={(event) => {
            setParagraph(event.target.value);
            edit(withFirstParagraph(doc.current, event.target.value));
          }}
        />
      </form>
    </main>
  );
}

function Recovery({
  user,
  library,
  bookId,
  result,
  onRestored,
}: {
  user: AuthUser;
  library: UserLibrary;
  bookId: string;
  result: Exclude<LoadResult, { ok: true }>;
  onRestored: (record: LocalManuscriptRecord) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const message = result.reason === 'not_found' ? 'This manuscript is not stored in this browser for this account.' : result.message;
  const revisions = result.reason === 'corrupt' ? result.revisions : [];

  async function restore(revision: number) {
    try {
      onRestored(await library.restoreRevision(bookId, revision));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <SignedInHeader user={user} />
      <h1>{result.reason === 'not_found' ? 'Manuscript not found' : 'Recovery needed'}</h1>
      <p className="notice error" role="alert">
        {message}
      </p>
      {result.reason === 'corrupt' ? <p className="muted">Nothing has been deleted. Restoring keeps a copy of the damaged version.</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
      <div className="actions">
        {revisions.map((revision) => (
          <button key={revision.revision} type="button" className="secondary" onClick={() => restore(revision.revision)}>
            Restore revision {revision.revision} ({revision.wordCount.toLocaleString()} words, {new Date(revision.savedAt).toLocaleString()})
          </button>
        ))}
        <Link className="button secondary" href="/projects">
          Back to manuscripts
        </Link>
      </div>
    </main>
  );
}

export function EditorScreen({ bookId }: { bookId: string }) {
  return <RequireAuth>{(user) => <Loader key={user.uid} user={user} bookId={bookId} />}</RequireAuth>;
}
