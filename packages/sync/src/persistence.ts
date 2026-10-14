import type { Manuscript } from '@folio-loom/book-model';

/** Granularity of sync: the manuscript shell (metadata, order, parts) or one section's blocks. */
export type SyncUnit = { kind: 'manifest'; manuscriptId: string } | { kind: 'section'; manuscriptId: string; sectionId: string };

export interface StoredManuscript {
  manuscript: Manuscript;
  baseRevision: number;
  dirty: boolean;
  /** Local wall-clock time of the last edit, for display only. */
  editedAt: string;
}

export interface OutboxEntry {
  id: string;
  unit: SyncUnit;
  baseRevision: number;
  contentHash: string;
  createdAt: string;
  attempts: number;
}

/** A recoverable snapshot kept before risky operations (import, conflict resolution, restore). */
export interface Snapshot {
  id: string;
  manuscriptId: string;
  reason: 'beforeImport' | 'beforeConflictResolution' | 'beforeRestore' | 'periodic';
  createdAt: string;
  manuscript: Manuscript;
}

/**
 * Implemented by SQLite (native) and IndexedDB (web). Every write must be durable before it
 * resolves; autosave reports failures instead of ignoring them like the legacy hook did.
 */
export interface ManuscriptStore {
  load(manuscriptId: string): Promise<StoredManuscript | null>;
  save(record: StoredManuscript): Promise<void>;
  list(): Promise<{ id: string; title: string; editedAt: string }[]>;
  enqueue(entry: OutboxEntry): Promise<void>;
  pendingOutbox(manuscriptId: string): Promise<OutboxEntry[]>;
  acknowledge(entryId: string, newRevision: number): Promise<void>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  listSnapshots(manuscriptId: string): Promise<Omit<Snapshot, 'manuscript'>[]>;
}
