'use client';

import type { AuthUser } from '@folio-loom/auth';
import type { Block, InlineMark, Manuscript, TextRun } from '@folio-loom/book-model';
import type { SyncEngine, SyncSnapshot } from '@folio-loom/cloud-sync';
import {
  addSection,
  deleteSection,
  deleteSelection,
  duplicateSection,
  insertSceneBreakAfter,
  marksAtOffset,
  mergeWithPreviousSection,
  nudgeSection,
  rangeHasMark,
  renameSection,
  setSectionKind,
  splitBlockAt,
  splitSectionAtBlock,
  type TextRange,
  toggleMark,
  updateBlock,
  updateManuscriptMeta,
} from '@folio-loom/editor-core';
import type {
  LoadResult,
  LocalManuscriptRecord,
  UserLibrary,
} from '@folio-loom/local-storage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockEditor, SceneBreakView } from '../../components/manuscript/BlockEditor';
import { EditorToolbar, SAVE_STATUS_LABEL, SectionNav } from '../../components/manuscript/EditorChrome';
import { useManuscriptSession } from '../../components/manuscript/useManuscriptSession';
import { RequireAuth } from '../../components/RequireAuth';
import { SignedInHeader } from '../../components/SignedInHeader';
import { SyncBadge } from '../../components/SyncStatus';
import { useCloudSync } from '../../components/useCloudSync';
import { storageProblem, useLocalLibrary } from '../../components/useLocalLibrary';

function Loader({ user, bookId }: { user: AuthUser; bookId: string }) {
  const { store, library, status } = useLocalLibrary(user.uid);
  const [result, setResult] = useState<LoadResult | null>(null);
  const ready = status.state.status === 'ready';
  const { engine, sync } = useCloudSync(user.uid, ready);

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

  useEffect(() => {
    if (!store || !library || !result || result.ok) return;
    return store.onChange((change) => {
      if (change.ownerUid === user.uid && change.bookId === bookId) void library.load(bookId).then(setResult, () => undefined);
    });
  }, [store, library, result, user.uid, bookId]);

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
  return (
    <Editor
      key={`${result.record.bookId}:${result.record.localRevision}`}
      user={user}
      library={library}
      initial={result.record}
      engine={engine}
      sync={sync}
    />
  );
}

function Editor({
  user,
  library,
  initial,
  engine,
  sync,
}: {
  user: AuthUser;
  library: UserLibrary;
  initial: LocalManuscriptRecord;
  engine: SyncEngine | null;
  sync: SyncSnapshot;
}) {
  const router = useRouter();
  const session = useManuscriptSession(library, initial);
  const [navOpen, setNavOpen] = useState(true);
  const [pendingMarks, setPendingMarks] = useState<InlineMark[]>([]);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!engine) return;
    engine.setEditing(initial.bookId, true);
    return () => engine.setEditing(initial.bookId, false);
  }, [engine, initial.bookId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void session.autosave?.flush();
    };
    const onPageHide = () => void session.autosave?.flush();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!session.autosave?.hasUnsavedChanges()) return;
      void session.autosave.flush();
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
  }, [session.autosave]);

  const section = useMemo(
    () => session.manuscript.sections.find((s) => s.id === session.activeSectionId) ?? session.manuscript.sections[0],
    [session.manuscript, session.activeSectionId],
  );

  const activeMarks = useMemo(() => {
    if (!section || !session.selection) return pendingMarks;
    const { anchor, focus } = session.selection;
    if (anchor.blockId !== focus.blockId) return pendingMarks;
    const block = section.blocks.find((b) => b.id === anchor.blockId);
    if (!block || (block.type !== 'paragraph' && block.type !== 'heading')) return pendingMarks;
    const start = Math.min(anchor.offset, focus.offset);
    const end = Math.max(anchor.offset, focus.offset);
    if (start === end) return pendingMarks.length > 0 ? pendingMarks : marksAtOffset(block.runs, start);
    const marks: InlineMark[] = [];
    if (rangeHasMark(block.runs, start, end, 'bold')) marks.push('bold');
    if (rangeHasMark(block.runs, start, end, 'italic')) marks.push('italic');
    return marks;
  }, [section, session.selection, pendingMarks]);

  const commit = useCallback(
    (next: Manuscript, selection = session.selection, options?: { kind?: string; coalesce?: boolean }) => {
      session.apply(next, selection, options);
      setPendingMarks([]);
    },
    [session],
  );

  const onToggleMark = useCallback(
    (mark: InlineMark) => {
      if (!section || !session.selection) {
        setPendingMarks((prev) => (prev.includes(mark) ? prev.filter((m) => m !== mark) : [...prev, mark]));
        return;
      }
      const { anchor, focus } = session.selection;
      if (anchor.offset === focus.offset && anchor.blockId === focus.blockId) {
        setPendingMarks((prev) => (prev.includes(mark) ? prev.filter((m) => m !== mark) : [...prev, mark]));
        return;
      }
      const result = toggleMark(session.manuscript, session.selection, mark);
      commit(result.manuscript, result.selection, { kind: 'mark' });
    },
    [section, session.selection, session.manuscript, commit],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        session.undo();
      } else if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
        event.preventDefault();
        session.redo();
      } else if (event.key === 'b') {
        event.preventDefault();
        onToggleMark('bold');
      } else if (event.key === 'i') {
        event.preventDefault();
        onToggleMark('italic');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, onToggleMark]);

  async function flushOrConfirm(action: string): Promise<boolean> {
    if (!session.autosave) return true;
    const settled = await session.autosave.flush();
    if (settled.status === 'saved') return true;
    return window.confirm(`Your latest changes could not be saved. ${action} anyway and lose them?`);
  }

  async function close() {
    setClosing(true);
    const ok = await flushOrConfirm('Close');
    setClosing(false);
    if (ok) router.push('/projects');
  }

  if (!session.autosave || !section) return null;

  const bookSync = sync.books.get(initial.bookId);
  const href = `/manuscripts/${encodeURIComponent(initial.bookId)}`;
  const failed = session.saveSnap.status === 'failed';

  return (
    <div className="editor-shell" data-theme="auto">
      <SignedInHeader user={user} beforeSignOut={() => flushOrConfirm('Sign out')} />
      <div className="editor-bar">
        <button type="button" className="secondary" onClick={close} disabled={closing} aria-busy={closing}>
          {closing ? 'Saving…' : 'Close'}
        </button>
        <Link className="button secondary" href={`${href}/snapshots`}>
          Snapshots
        </Link>
        <SyncBadge status={bookSync} />
      </div>
      {failed ? (
        <div className="notice error" role="alert">
          <p>{session.saveSnap.error?.message ?? 'Saving failed.'} Your changes are still on this page and have not been lost.</p>
          <button type="button" className="secondary" onClick={() => void session.autosave?.retry()}>
            Retry save
          </button>
        </div>
      ) : null}
      {bookSync?.conflicts ? (
        <p className="notice" role="alert">
          This manuscript has sync conflicts. Nothing has been lost. <Link href={`${href}/conflicts`}>Review conflicts</Link>
        </p>
      ) : null}

      <div className="editor-layout">
        <SectionNav
          manuscript={session.manuscript}
          activeSectionId={section.id}
          open={navOpen}
          onToggle={() => setNavOpen((v) => !v)}
          onSelect={(id) => session.setActiveSectionId(id)}
          onAdd={(kind) => {
            const at = session.manuscript.sections.findIndex((s) => s.id === section.id) + 1;
            const result = addSection(session.manuscript, { kind, title: kind === 'chapter' ? 'Chapter' : kind === 'frontMatter' ? 'Front matter' : 'Back matter', atIndex: at });
            commit(result.manuscript, result.selection, { kind: 'structure' });
            session.setActiveSectionId(result.manuscript.sections[at]?.id ?? section.id);
          }}
          onDelete={(id) => {
            commit(deleteSection(session.manuscript, id), null, { kind: 'structure' });
            session.setActiveSectionId(session.manuscript.sections.find((s) => s.id !== id)?.id ?? '');
          }}
          onMove={(id, direction) => commit(nudgeSection(session.manuscript, id, direction), session.selection, { kind: 'structure' })}
          onDuplicate={(id) => {
            const result = duplicateSection(session.manuscript, id);
            commit(result.manuscript, result.selection, { kind: 'structure' });
            const copy = result.manuscript.sections.find((s) => s.title.endsWith('(copy)'));
            if (copy) session.setActiveSectionId(copy.id);
          }}
          onRename={(id, title) => commit(renameSection(session.manuscript, id, title), session.selection, { kind: 'structure' })}
          onSetKind={(id, kind) => commit(setSectionKind(session.manuscript, id, kind), session.selection, { kind: 'structure' })}
        />

        <div className="editor-main">
          <EditorToolbar
            canUndo={session.canUndo}
            canRedo={session.canRedo}
            onUndo={session.undo}
            onRedo={session.redo}
            onToggleMark={onToggleMark}
            activeMarks={activeMarks}
            onSceneBreak={() => {
              const blockId = session.selection?.anchor.blockId ?? section.blocks.at(-1)?.id ?? null;
              const result = insertSceneBreakAfter(session.manuscript, section.id, blockId);
              commit(result.manuscript, result.selection, { kind: 'structure' });
            }}
            onSplitSection={() => {
              const blockId = session.selection?.anchor.blockId ?? section.blocks[1]?.id;
              if (!blockId) return;
              try {
                const result = splitSectionAtBlock(session.manuscript, section.id, blockId);
                commit(result.manuscript, result.selection, { kind: 'structure' });
                session.setActiveSectionId(result.selection.anchor.sectionId);
              } catch (e) {
                window.alert(e instanceof Error ? e.message : String(e));
              }
            }}
            onMergeSection={() => {
              try {
                commit(mergeWithPreviousSection(session.manuscript, section.id), null, { kind: 'structure' });
                const index = session.manuscript.sections.findIndex((s) => s.id === section.id);
                session.setActiveSectionId(session.manuscript.sections[Math.max(0, index - 1)]?.id ?? '');
              } catch (e) {
                window.alert(e instanceof Error ? e.message : String(e));
              }
            }}
            saveLabel={SAVE_STATUS_LABEL[session.saveSnap.status]}
            syncKind={bookSync?.kind}
            wordCount={session.wordCount}
          />

          <form className="meta-form" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="book-title">Book title</label>
            <input
              id="book-title"
              value={session.manuscript.title}
              onChange={(e) => commit(updateManuscriptMeta(session.manuscript, { title: e.target.value }), session.selection, { kind: 'meta', coalesce: true })}
            />
            <label htmlFor="book-authors">Authors (comma-separated)</label>
            <input
              id="book-authors"
              value={session.manuscript.authors.join(', ')}
              onChange={(e) =>
                commit(
                  updateManuscriptMeta(session.manuscript, {
                    authors: e.target.value
                      .split(',')
                      .map((a) => a.trim())
                      .filter(Boolean),
                  }),
                  session.selection,
                  { kind: 'meta', coalesce: true },
                )
              }
            />
          </form>

          <h1 className="section-heading">{section.title || 'Untitled section'}</h1>

          <div className="block-list">
            {section.blocks.map((block) => (
              <BlockRow
                key={block.id}
                block={block}
                sectionId={section.id}
                manuscript={session.manuscript}
                pendingMarks={pendingMarks}
                onApply={commit}
                onSelect={(start, end) =>
                  session.setSelection({
                    anchor: { sectionId: section.id, blockId: block.id, offset: start },
                    focus: { sectionId: section.id, blockId: block.id, offset: end },
                  })
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockRow({
  block,
  sectionId,
  manuscript,
  pendingMarks,
  onApply,
  onSelect,
}: {
  block: Block;
  sectionId: string;
  manuscript: Manuscript;
  pendingMarks: readonly InlineMark[];
  onApply: (m: Manuscript, sel: TextRange | null | undefined, opts?: { kind?: string; coalesce?: boolean }) => void;
  onSelect: (start: number, end: number) => void;
}) {
  if (block.type === 'sceneBreak') return <SceneBreakView marker={block.marker} />;
  if (block.type !== 'paragraph' && block.type !== 'heading') return null;

  return (
    <BlockEditor
      block={block}
      sectionId={sectionId}
      pendingMarks={pendingMarks}
      onSelect={onSelect}
      onCommit={(runs, options) => {
        const next = updateBlock(manuscript, sectionId, { ...block, runs: runs as TextRun[] });
        // Keep selection ownership in the contenteditable; only update the manuscript.
        onApply(next, undefined, { kind: 'type', coalesce: options?.coalesce });
      }}
      onEnter={(offset) => {
        const result = splitBlockAt(manuscript, { sectionId, blockId: block.id, offset });
        onApply(result.manuscript, result.selection, { kind: 'structure' });
      }}
      onBackspaceAtStart={() => {
        const result = deleteSelection(manuscript, {
          anchor: { sectionId, blockId: block.id, offset: 0 },
          focus: { sectionId, blockId: block.id, offset: 0 },
        });
        onApply(result.manuscript, result.selection, { kind: 'structure' });
      }}
    />
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
  const message =
    result.reason === 'not_found'
      ? 'This manuscript is not stored in this browser for this account. If you created it on another device, it opens here once it has synced.'
      : result.message;
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
