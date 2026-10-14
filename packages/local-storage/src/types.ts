import type { Manuscript } from '@folio-loom/book-model';
import type { StorageError } from './errors';

export type StorageBackend = 'sqlite' | 'indexeddb';

/** Database-level state. Anything other than `ready` blocks reads and writes and is shown to the author. */
export type StorageState =
  | { status: 'opening' }
  | { status: 'ready' }
  /** No usable database: IndexedDB missing or refused (some private modes), file can't be opened. */
  | { status: 'unavailable'; message: string }
  /** The on-disk database was created by a newer app version. Nothing was modified. */
  | { status: 'unsupported_version'; message: string; found: number; supported: number }
  /** An upgrade failed and was rolled back; the database is still at its previous version. */
  | { status: 'migration_failed'; message: string }
  /** Web only: another tab must close before the database can be upgraded or used. */
  | { status: 'blocked'; message: string }
  | { status: 'closed'; message: string };

export interface StorageStatus {
  backend: StorageBackend;
  databaseVersion: number | null;
  state: StorageState;
  /** Most recent failed operation, cleared by the next successful write. */
  lastError: StorageError | null;
}

export type RevisionReason = 'create' | 'edit' | 'restore';

/** Cheap listing data; never includes manuscript content. */
export interface ManuscriptSummary {
  bookId: string;
  ownerUid: string;
  title: string;
  wordCount: number;
  /** Increments on every local save. */
  localRevision: number;
  /** True until a future sync acknowledges `localRevision`. */
  dirty: boolean;
  /** Server revision the local copy was last synced with; `null` = never synced (M1-C). */
  syncedRevision: number | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  /** `unreadable` rows are listed (never hidden) so the author can see and recover them. */
  health: 'ok' | 'unreadable';
}

export interface LocalManuscriptRecord {
  bookId: string;
  ownerUid: string;
  manuscript: Manuscript;
  localRevision: number;
  /** Checksum of the stored JSON, used to detect truncated or altered content. */
  checksum: string;
  dirty: boolean;
  syncedRevision: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionSummary {
  bookId: string;
  revision: number;
  reason: RevisionReason;
  schemaVersion: number;
  wordCount: number;
  checksum: string;
  savedAt: string;
}

export type LoadResult =
  | { ok: true; record: LocalManuscriptRecord; migratedFrom: number | null }
  | { ok: false; reason: 'not_found' }
  | {
      ok: false;
      reason: 'corrupt' | 'unsupported_version';
      message: string;
      /** Older revisions that may still be readable; offer them for restore. */
      revisions: RevisionSummary[];
    };

export interface SaveReceipt {
  bookId: string;
  localRevision: number;
  checksum: string;
  updatedAt: string;
}

export interface DeleteRequest {
  /** Single-use; expires, and is invalidated if the manuscript is saved again before confirming. */
  token: string;
  bookId: string;
  title: string;
  localRevision: number;
  expiresAt: string;
}

/** Content preserved when a corrupt current version is replaced by a restore. Never pruned automatically. */
export interface QuarantinedContent {
  id: number;
  bookId: string;
  revision: number | null;
  reason: string;
  capturedAt: string;
  content: string | null;
}
