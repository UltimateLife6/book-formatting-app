'use client';

import type { Manuscript } from '@folio-loom/book-model';
import { manuscriptWordCount } from '@folio-loom/book-model';
import { EditHistory, type TextRange } from '@folio-loom/editor-core';
import {
  type AutosaveController,
  createManuscriptAutosave,
  type LocalManuscriptRecord,
  type UserLibrary,
} from '@folio-loom/local-storage';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * One open manuscript: autosave + undo/redo. Edits go through `apply` so every change is a
 * valid manuscript revision and undoable. Structural edits disable typing coalesce.
 */
export function useManuscriptSession(library: UserLibrary, initial: LocalManuscriptRecord) {
  const [autosave, setAutosave] = useState<AutosaveController<Manuscript> | null>(null);
  const [manuscript, setManuscript] = useState(initial.manuscript);
  const [selection, setSelection] = useState<TextRange | null>(null);
  const [activeSectionId, setActiveSectionId] = useState(initial.manuscript.sections[0]?.id ?? '');
  const history = useRef(new EditHistory({ depth: 60, coalesceMs: 900 }));
  const [, bump] = useState(0);

  useEffect(() => {
    const controller = createManuscriptAutosave(library, initial);
    setAutosave(controller);
    setManuscript(initial.manuscript);
    setActiveSectionId(initial.manuscript.sections[0]?.id ?? '');
    history.current.clear();
    return () => void controller.close();
  }, [library, initial]);

  const saveSnap = useSyncExternalStore(
    autosave ? autosave.subscribe : () => () => {},
    autosave
      ? autosave.getSnapshot
      : () =>
          ({
            status: 'saved' as const,
            error: null,
            revision: initial.localRevision,
            lastSavedAt: initial.updatedAt,
          }) as ReturnType<AutosaveController<Manuscript>['getSnapshot']>,
  );

  const apply = useCallback(
    /**
     * `nextSelection === undefined` leaves the current selection alone (used while typing in
     * contenteditable so the browser caret is not fought). Pass `null` to clear it.
     */
    (next: Manuscript, nextSelection: TextRange | null | undefined, options: { kind?: string; coalesce?: boolean } = {}) => {
      if (!autosave) return;
      history.current.push({ manuscript, selection }, options.kind ?? 'edit', options.coalesce === true);
      setManuscript(next);
      if (nextSelection !== undefined) setSelection(nextSelection);
      autosave.update(next);
      bump((n) => n + 1);
    },
    [autosave, manuscript, selection],
  );

  const undo = useCallback(() => {
    if (!autosave) return;
    const previous = history.current.undo({ manuscript, selection });
    if (!previous) return;
    setManuscript(previous.manuscript);
    setSelection(previous.selection);
    if (previous.manuscript.sections.every((s) => s.id !== activeSectionId)) {
      setActiveSectionId(previous.manuscript.sections[0]?.id ?? '');
    }
    autosave.update(previous.manuscript);
    bump((n) => n + 1);
  }, [autosave, manuscript, selection, activeSectionId]);

  const redo = useCallback(() => {
    if (!autosave) return;
    const next = history.current.redo({ manuscript, selection });
    if (!next) return;
    setManuscript(next.manuscript);
    setSelection(next.selection);
    autosave.update(next.manuscript);
    bump((n) => n + 1);
  }, [autosave, manuscript, selection]);

  return {
    autosave,
    manuscript,
    selection,
    setSelection,
    activeSectionId,
    setActiveSectionId,
    apply,
    undo,
    redo,
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
    saveSnap,
    wordCount: manuscriptWordCount(manuscript),
  };
}
