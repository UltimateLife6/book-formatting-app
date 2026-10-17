import type { Manuscript } from '@folio-loom/book-model';
import type { TextRange } from './selection';

export interface HistoryEntry {
  manuscript: Manuscript;
  selection: TextRange | null;
}

/**
 * Undo/redo stack for manuscript edits. Each entry is a full manuscript snapshot.
 * Coalescing: typed characters within `coalesceMs` share one undo step so Undo
 * removes a word-ish burst rather than every key. Structural edits and mark toggles
 * should call `push` with `coalesce: false`.
 *
 * Snapshots are cheap relative to a cloud round-trip; for the 210k-word book the
 * in-memory cost is about 1.4 MB × depth (default 100 ≈ 140 MB worst case). Callers
 * editing one open book on a phone should keep depth modest (40–80).
 */
export class EditHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private lastPushAt = 0;
  private lastKind: string | null = null;

  constructor(
    private readonly options: { depth?: number; coalesceMs?: number } = {},
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Record the state *before* applying an edit. Pass the pre-edit manuscript.
   * `kind` groups coalesced typing (`'type'`) versus discrete edits (`'mark'`, `'structure'`, …).
   */
  push(before: HistoryEntry, kind = 'edit', coalesce = false) {
    const now = Date.now();
    const coalesceMs = this.options.coalesceMs ?? 800;
    if (coalesce && kind === this.lastKind && now - this.lastPushAt < coalesceMs && this.undoStack.length > 0) {
      this.lastPushAt = now;
      this.redoStack = [];
      return;
    }
    this.undoStack.push(before);
    const depth = this.options.depth ?? 80;
    if (this.undoStack.length > depth) this.undoStack.shift();
    this.redoStack = [];
    this.lastPushAt = now;
    this.lastKind = kind;
  }

  undo(current: HistoryEntry): HistoryEntry | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(current);
    this.lastKind = null;
    return previous;
  }

  redo(current: HistoryEntry): HistoryEntry | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    this.lastKind = null;
    return next;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKind = null;
  }
}
