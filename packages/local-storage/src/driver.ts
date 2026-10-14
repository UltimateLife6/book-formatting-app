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

export type OutboxKind = 'sync' | 'deleteBook';

/** One durable sync request, written in the same transaction as the local change it describes. */
export interface OutboxInput {
  ownerUid: string;
  bookId: string;
  /** Unique; becomes the idempotency key of the server commit. */
  opId: string;
  kind: OutboxKind;
  /** Local revision the op was queued for (`null` for deletes). */
  localRevision: number | null;
  createdAt: string;
}

/** Whole-book copy kept before sync replaces local content. Not deleted with the book. */
export interface PreservedInput {
  ownerUid: string;
  bookId: string;
  title: string;
  reason: string;
  capturedAt: string;
  content: string;
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
  /** Queued in the same transaction; a `sync` op supersedes this book's earlier `sync` ops. */
  outbox?: OutboxInput;
}

/** Everything one sync step changes locally, applied atomically. */
export interface ApplySyncCommand {
  ownerUid: string;
  bookId: string;
  /** If set, the stored `localRevision` must equal this (`null`: book must not exist) or nothing is applied. */
  expectedRevision?: number | null;
  /** New local revision (merged or resolved content). Requires `expectedRevision`. */
  write?: Omit<WriteBookCommand, 'expectedRevision' | 'outbox' | 'quarantine'>;
  /** Deletes the local book like `deleteBook`. Requires `expectedRevision`. */
  deleteLocal?: boolean;
  /** Serialized per-book sync state; `null` deletes it. `undefined` leaves it unchanged. */
  syncState?: { state: string; updatedAt: string } | null;
  removeOpIds?: string[];
  removeAllOps?: boolean;
  /** Applied only if the stored `localRevision` equals `localRevision` (after `write`). */
  markSynced?: { localRevision: number; syncedRevision: number };
  preserved?: PreservedInput[];
  /** Queues a `sync` op and marks the book dirty (a local decision that must be uploaded). */
  outbox?: OutboxInput;
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
  /**
   * Deletes the book, its revisions, contents and quarantine entries, if `localRevision` still matches.
   * Removes the book's queued ops; `outbox` is queued instead only if the book has sync state
   * (i.e. it may exist on the server).
   */
  deleteBook(ownerUid: string, bookId: string, expectedRevision: number, outbox?: OutboxInput): Promise<CompareAndSetOutcome>;
  applySync(command: ApplySyncCommand): Promise<CompareAndSetOutcome>;
  /** `{ bookId, state, updatedAt }` rows. */
  getSyncState(ownerUid: string, bookId: string): Promise<unknown | null>;
  listSyncStates(ownerUid: string): Promise<unknown[]>;
  /** Queued ops in queue order. */
  listOutbox(ownerUid: string): Promise<unknown[]>;
  listPreserved(ownerUid: string): Promise<unknown[]>;
  /** Clears `dirty` and records `syncedRevision` if `localRevision` still matches. */
  markSynced(ownerUid: string, bookId: string, localRevision: number, syncedRevision: number): Promise<CompareAndSetOutcome>;
  listRevisions(ownerUid: string, bookId: string): Promise<unknown[]>;
  /** Serialized content, or `null` if missing. */
  getRevisionContent(ownerUid: string, bookId: string, revision: number): Promise<string | null>;
  listQuarantine(ownerUid: string, bookId: string): Promise<unknown[]>;
  close(): Promise<void>;
}
