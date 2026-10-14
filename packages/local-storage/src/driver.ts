import type { RevisionReason, StorageBackend, StorageState } from './types';

/**
 * Low-level persistence implemented by each platform (SQLite, IndexedDB). Drivers store rows and
 * guarantee atomicity; all validation, policy and account checks live in the shared store.
 * Every method is scoped by `ownerUid` and must never return another owner's rows.
 */

export interface BookRow {
  ownerUid: string;
  bookId: string;
  title: string;
  wordCount: number;
  schemaVersion: number;
  localRevision: number;
  checksum: string;
  dirty: boolean;
  syncedRevision: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionRow {
  ownerUid: string;
  bookId: string;
  revision: number;
  schemaVersion: number;
  checksum: string;
  wordCount: number;
  reason: RevisionReason;
  savedAt: string;
}

export interface QuarantineInput {
  ownerUid: string;
  bookId: string;
  revision: number | null;
  reason: string;
  capturedAt: string;
  content: string | null;
}

export interface WriteBookCommand {
  book: BookRow;
  /** `null`: the book must not exist yet (create). Otherwise the stored `localRevision` must equal this. */
  expectedRevision: number | null;
  revision: RevisionRow;
  /** Serialized manuscript for `revision`. */
  content: string;
  /** Revisions `<= book.localRevision - keepRevisions` are deleted in the same transaction. */
  keepRevisions: number;
  /** Preserved in the same transaction (used when restoring over a corrupt version). */
  quarantine?: QuarantineInput;
}

export type CompareAndSetOutcome = { ok: true } | { ok: false; reason: 'stale_revision'; actualRevision: number | null };

export type DriverOpenResult =
  | { ok: true; version: number }
  | { ok: false; version: number | null; state: Exclude<StorageState, { status: 'ready' | 'opening' }> };

/** Raw rows are `unknown` on purpose: the shared store validates them so damage is reported, not trusted. */
export interface StorageDriver {
  readonly backend: StorageBackend;
  /** `report` receives interim or later state changes (e.g. `blocked`, or `closed` by another tab). */
  open(report?: (state: StorageState) => void): Promise<DriverOpenResult>;
  listBooks(ownerUid: string): Promise<unknown[]>;
  getBook(ownerUid: string, bookId: string): Promise<unknown | null>;
  /** Atomic compare-and-set of the book row plus its revision, pruning, and optional quarantine. */
  writeBook(command: WriteBookCommand): Promise<CompareAndSetOutcome>;
  /** Deletes the book, its revisions, contents and quarantine entries, if `localRevision` still matches. */
  deleteBook(ownerUid: string, bookId: string, expectedRevision: number): Promise<CompareAndSetOutcome>;
  /** Clears `dirty` and records `syncedRevision` if `localRevision` still matches. */
  markSynced(ownerUid: string, bookId: string, localRevision: number, syncedRevision: number): Promise<CompareAndSetOutcome>;
  listRevisions(ownerUid: string, bookId: string): Promise<unknown[]>;
  /** Serialized content, or `null` if missing. */
  getRevisionContent(ownerUid: string, bookId: string, revision: number): Promise<string | null>;
  listQuarantine(ownerUid: string, bookId: string): Promise<unknown[]>;
  close(): Promise<void>;
}
