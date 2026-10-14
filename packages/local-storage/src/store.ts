import {
  createManuscript,
  createParagraph,
  createSection,
  deserializeManuscript,
  MANUSCRIPT_SCHEMA_VERSION,
  type Manuscript,
  ManuscriptValidationError,
  manuscriptWordCount,
  serializeManuscript,
} from '@folio-loom/book-model';
import { stableHash } from '@folio-loom/sync';
import type { BookRow, CompareAndSetOutcome, QuarantineInput, StorageDriver } from './driver';
import { StorageError, toStorageError } from './errors';
import { readBookRow, readQuarantine, readRevisionRow, toRevisionSummary, toSummary, unreadableSummary } from './records';
import type {
  DeleteRequest,
  LoadResult,
  LocalManuscriptRecord,
  ManuscriptSummary,
  QuarantinedContent,
  RevisionReason,
  RevisionSummary,
  SaveReceipt,
  StorageState,
  StorageStatus,
} from './types';

export interface LocalStoreOptions {
  /** Recent revisions kept per manuscript for crash recovery (including the current one). Default 10. */
  keepRevisions?: number;
  /** How long a delete confirmation stays valid. Default 5 minutes. */
  deleteConfirmationTtlMs?: number;
  now?: () => Date;
  createToken?: () => string;
}

export interface CreateManuscriptOptions {
  title?: string;
  /** Use an existing manuscript (e.g. an import). Its `id` becomes the stable book ID. */
  manuscript?: Manuscript;
}

export type RevisionContentResult = { ok: true; manuscript: Manuscript } | { ok: false; message: string };

const UID = /^[A-Za-z0-9_.:-]{1,128}$/;

function defaultToken(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function blankManuscript(title = 'Untitled manuscript'): Manuscript {
  return createManuscript({
    title,
    sections: [createSection({ kind: 'chapter', title: 'Chapter 1', blocks: [createParagraph('')] })],
  });
}

interface Serialized {
  manuscript: Manuscript;
  content: string;
  checksum: string;
  wordCount: number;
}

function serialize(manuscript: Manuscript): Serialized {
  try {
    const content = serializeManuscript(manuscript);
    return { manuscript, content, checksum: stableHash(content), wordCount: manuscriptWordCount(manuscript) };
  } catch (error) {
    if (error instanceof ManuscriptValidationError) {
      throw new StorageError('invalid_manuscript', {
        detail: error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join('; '),
        cause: error,
      });
    }
    throw toStorageError(error, 'invalid_manuscript');
  }
}

/**
 * App-wide handle on the local database. One per device/browser profile; per-account access goes
 * through `forUser(uid)`. All writes from every account run through one queue, so writes never
 * interleave and an older queued save always lands before a newer one.
 */
export class LocalManuscriptStore {
  readonly ready: Promise<StorageStatus>;
  private state: StorageState = { status: 'opening' };
  private version: number | null = null;
  private lastError: StorageError | null = null;
  private snapshot: StorageStatus;
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly options: Required<LocalStoreOptions>;

  constructor(
    private readonly driver: StorageDriver,
    options: LocalStoreOptions = {},
  ) {
    this.options = {
      keepRevisions: Math.max(2, options.keepRevisions ?? 10),
      deleteConfirmationTtlMs: options.deleteConfirmationTtlMs ?? 5 * 60_000,
      now: options.now ?? (() => new Date()),
      createToken: options.createToken ?? defaultToken,
    };
    this.snapshot = this.buildSnapshot();
    this.ready = this.open();
  }

  private async open(): Promise<StorageStatus> {
    try {
      const result = await this.driver.open((state) => this.setState(state));
      this.version = result.version;
      this.setState(result.ok ? { status: 'ready' } : result.state);
    } catch (error) {
      this.setState({ status: 'unavailable', message: toStorageError(error, 'unavailable').message });
    }
    return this.snapshot;
  }

  private buildSnapshot(): StorageStatus {
    return { backend: this.driver.backend, databaseVersion: this.version, state: this.state, lastError: this.lastError };
  }

  private notify() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private setState(state: StorageState) {
    this.state = state;
    this.notify();
  }

  getStatus = (): StorageStatus => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** @internal */
  assertReady() {
    if (this.state.status === 'ready') return;
    if (this.state.status === 'opening') throw new StorageError('not_ready');
    if (this.state.status === 'unsupported_version') throw new StorageError('unsupported_version', { message: this.state.message });
    if (this.state.status === 'closed') throw new StorageError('closed', { message: this.state.message });
    throw new StorageError('unavailable', { message: this.state.message });
  }

  /** @internal Serializes writes; a failed task does not block later ones. */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** @internal */
  recordResult(error: StorageError | null) {
    if (error === this.lastError) return;
    this.lastError = error;
    this.notify();
  }

  /** @internal */
  get db(): StorageDriver {
    return this.driver;
  }

  forUser(ownerUid: string): UserLibrary {
    if (!UID.test(ownerUid)) throw new StorageError('invalid_owner');
    return new UserLibrary(this, ownerUid);
  }

  async close(): Promise<void> {
    await this.queue;
    await this.driver.close();
    this.setState({ status: 'closed', message: 'Local storage was closed.' });
  }
}

/**
 * Everything one signed-in account can do. The owner UID is fixed at construction and passed to
 * every driver call, so this object can only ever read or write that account's rows.
 */
export class UserLibrary {
  private closed = false;
  private readonly deleteRequests = new Map<string, { bookId: string; localRevision: number; expiresAt: number }>();

  constructor(
    private readonly store: LocalManuscriptStore,
    readonly ownerUid: string,
  ) {}

  private get driver(): StorageDriver {
    return this.store.db;
  }

  private now(): Date {
    return this.store.options.now();
  }

  private assertOpen() {
    if (this.closed) throw new StorageError('closed');
    this.store.assertReady();
  }

  /** Runs a write through the store queue and records success/failure in the store status. */
  private async write<T>(task: () => Promise<T>): Promise<T> {
    this.assertOpen();
    try {
      const result = await this.store.enqueue(task);
      this.store.recordResult(null);
      return result;
    } catch (error) {
      const storageError = toStorageError(error);
      this.store.recordResult(storageError);
      throw storageError;
    }
  }

  private async read<T>(task: () => Promise<T>): Promise<T> {
    this.assertOpen();
    try {
      return await task();
    } catch (error) {
      throw toStorageError(error, 'read_failed');
    }
  }

  private checkOwner(raw: unknown) {
    if (typeof raw === 'object' && raw !== null && 'ownerUid' in raw && raw.ownerUid !== this.ownerUid) {
      throw new StorageError('read_failed', { detail: 'Driver returned a row for a different owner.' });
    }
  }

  private stale(outcome: CompareAndSetOutcome): never {
    throw new StorageError('stale_revision', {
      detail: outcome.ok ? undefined : `stored revision ${outcome.actualRevision ?? 'missing'}`,
    });
  }

  async list(): Promise<ManuscriptSummary[]> {
    return this.read(async () => {
      const rows = await this.driver.listBooks(this.ownerUid);
      const summaries = rows.map((raw) => {
        this.checkOwner(raw);
        const row = readBookRow(raw);
        return row ? toSummary(row) : unreadableSummary(raw, this.ownerUid);
      });
      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }

  async create(options: CreateManuscriptOptions = {}): Promise<LocalManuscriptRecord> {
    this.assertOpen();
    const timestamp = this.now().toISOString();
    const base = options.manuscript ?? blankManuscript(options.title);
    const data = serialize({ ...base, updatedAt: timestamp });
    const bookId = data.manuscript.id;
    const book: BookRow = {
      ownerUid: this.ownerUid,
      bookId,
      title: data.manuscript.title,
      wordCount: data.wordCount,
      schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
      localRevision: 1,
      checksum: data.checksum,
      dirty: true,
      syncedRevision: null,
      createdAt: data.manuscript.createdAt,
      updatedAt: timestamp,
    };
    const outcome = await this.write(() =>
      this.driver.writeBook({
        book,
        expectedRevision: null,
        revision: this.revisionRow(book, 'create', timestamp),
        content: data.content,
        keepRevisions: this.store.options.keepRevisions,
      }),
    );
    if (!outcome.ok) throw new StorageError('write_failed', { message: 'A manuscript with this ID already exists on this device.' });
    return { ...book, manuscript: data.manuscript };
  }

  private revisionRow(book: BookRow, reason: RevisionReason, savedAt: string) {
    return {
      ownerUid: this.ownerUid,
      bookId: book.bookId,
      revision: book.localRevision,
      schemaVersion: book.schemaVersion,
      checksum: book.checksum,
      wordCount: book.wordCount,
      reason,
      savedAt,
    };
  }

  async load(bookId: string): Promise<LoadResult> {
    return this.read(async () => {
      const raw = await this.driver.getBook(this.ownerUid, bookId);
      if (raw === null || raw === undefined) return { ok: false, reason: 'not_found' };
      this.checkOwner(raw);
      const failure = async (reason: 'corrupt' | 'unsupported_version', message: string): Promise<LoadResult> => ({
        ok: false,
        reason,
        message,
        revisions: await this.listRevisionsUnchecked(bookId),
      });

      const book = readBookRow(raw);
      if (!book) return failure('corrupt', 'The manuscript index entry is damaged.');
      if (book.schemaVersion > MANUSCRIPT_SCHEMA_VERSION) {
        return failure('unsupported_version', new StorageError('unsupported_version').message);
      }
      const content = await this.driver.getRevisionContent(this.ownerUid, bookId, book.localRevision);
      if (content === null) return failure('corrupt', `Saved content for revision ${book.localRevision} is missing.`);
      if (stableHash(content) !== book.checksum) {
        return failure('corrupt', `Saved content for revision ${book.localRevision} does not match its checksum (it may be truncated).`);
      }
      const parsed = deserializeManuscript(content);
      if (!parsed.ok) {
        return failure(parsed.error === 'unsupported_version' ? 'unsupported_version' : 'corrupt', parsed.message);
      }
      if (parsed.manuscript.id !== bookId) return failure('corrupt', 'Saved content belongs to a different manuscript ID.');
      const { ownerUid, localRevision, checksum, dirty, syncedRevision, createdAt, updatedAt } = book;
      return {
        ok: true,
        migratedFrom: parsed.migratedFrom,
        record: { bookId, ownerUid, manuscript: parsed.manuscript, localRevision, checksum, dirty, syncedRevision, createdAt, updatedAt },
      };
    });
  }

  /**
   * Saves a new local revision. Refused with `stale_revision` unless the stored revision equals
   * `expectedRevision`, so a delayed or duplicated save can never replace newer content.
   */
  async save(bookId: string, manuscript: Manuscript, expectedRevision: number): Promise<SaveReceipt> {
    this.assertOpen();
    if (manuscript.id !== bookId) throw new StorageError('invalid_manuscript', { detail: 'manuscript.id does not match bookId' });
    const timestamp = this.now().toISOString();
    const data = serialize({ ...manuscript, updatedAt: timestamp });
    return this.write(async () => {
      const raw = await this.driver.getBook(this.ownerUid, bookId);
      if (raw === null || raw === undefined) throw new StorageError('not_found');
      this.checkOwner(raw);
      const current = readBookRow(raw);
      if (!current) throw new StorageError('corrupt_record');
      if (current.schemaVersion > MANUSCRIPT_SCHEMA_VERSION) throw new StorageError('unsupported_version');
      if (current.localRevision !== expectedRevision) {
        this.stale({ ok: false, reason: 'stale_revision', actualRevision: current.localRevision });
      }
      const book: BookRow = {
        ...current,
        title: data.manuscript.title,
        wordCount: data.wordCount,
        schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
        localRevision: expectedRevision + 1,
        checksum: data.checksum,
        dirty: true,
        updatedAt: timestamp,
      };
      const outcome = await this.driver.writeBook({
        book,
        expectedRevision,
        revision: this.revisionRow(book, 'edit', timestamp),
        content: data.content,
        keepRevisions: this.store.options.keepRevisions,
      });
      if (!outcome.ok) this.stale(outcome);
      return { bookId, localRevision: book.localRevision, checksum: book.checksum, updatedAt: timestamp };
    });
  }

  private async listRevisionsUnchecked(bookId: string): Promise<RevisionSummary[]> {
    const rows = await this.driver.listRevisions(this.ownerUid, bookId);
    return rows
      .map((raw) => {
        this.checkOwner(raw);
        return readRevisionRow(raw);
      })
      .filter((row): row is NonNullable<typeof row> => row !== null && row.bookId === bookId)
      .map(toRevisionSummary)
      .sort((a, b) => b.revision - a.revision);
  }

  async listRevisions(bookId: string): Promise<RevisionSummary[]> {
    return this.read(() => this.listRevisionsUnchecked(bookId));
  }

  async loadRevision(bookId: string, revision: number): Promise<RevisionContentResult> {
    return this.read(async () => {
      const content = await this.driver.getRevisionContent(this.ownerUid, bookId, revision);
      if (content === null) return { ok: false, message: `Revision ${revision} is not stored on this device.` };
      const parsed = deserializeManuscript(content);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      if (parsed.manuscript.id !== bookId) return { ok: false, message: 'Revision belongs to a different manuscript ID.' };
      return { ok: true, manuscript: parsed.manuscript };
    });
  }

  /**
   * Makes an older revision current again (as a new revision). If the current content is
   * unreadable it is first copied to quarantine in the same transaction, so nothing is lost.
   */
  async restoreRevision(bookId: string, revision: number): Promise<LocalManuscriptRecord> {
    this.assertOpen();
    const source = await this.loadRevision(bookId, revision);
    if (!source.ok) throw new StorageError('corrupt_record', { message: `Revision ${revision} can't be restored: ${source.message}` });
    const timestamp = this.now().toISOString();
    const data = serialize({ ...source.manuscript, updatedAt: timestamp });

    return this.write(async () => {
      const raw = await this.driver.getBook(this.ownerUid, bookId);
      if (raw === null || raw === undefined) throw new StorageError('not_found');
      this.checkOwner(raw);
      const current = readBookRow(raw);
      const rawRevision = (raw as { localRevision?: unknown }).localRevision;
      const expected = current?.localRevision ?? (typeof rawRevision === 'number' && Number.isInteger(rawRevision) ? rawRevision : null);
      if (expected === null) throw new StorageError('corrupt_record', { message: 'The manuscript index entry is too damaged to restore automatically.' });

      if (current && current.schemaVersion > MANUSCRIPT_SCHEMA_VERSION) throw new StorageError('unsupported_version');
      let quarantine: QuarantineInput | undefined;
      const currentContent = await this.driver.getRevisionContent(this.ownerUid, bookId, expected);
      const intact = current !== null && currentContent !== null && stableHash(currentContent) === current.checksum;
      const parsed = intact && currentContent !== null ? deserializeManuscript(currentContent) : null;
      // Intact content written by a newer app version is not damage; leave it for that version.
      if (parsed && !parsed.ok && parsed.error === 'unsupported_version') throw new StorageError('unsupported_version');
      const currentReadable = parsed?.ok === true;
      if (!currentReadable) {
        quarantine = {
          ownerUid: this.ownerUid,
          bookId,
          revision: expected,
          reason: 'replaced by restore',
          capturedAt: timestamp,
          content: currentContent,
        };
      }
      const revisions = await this.listRevisionsUnchecked(bookId);
      const nextRevision = Math.max(expected, ...revisions.map((r) => r.revision)) + 1;
      const book: BookRow = {
        ownerUid: this.ownerUid,
        bookId,
        title: data.manuscript.title,
        wordCount: data.wordCount,
        schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
        localRevision: nextRevision,
        checksum: data.checksum,
        dirty: true,
        syncedRevision: current?.syncedRevision ?? null,
        createdAt: current?.createdAt ?? data.manuscript.createdAt,
        updatedAt: timestamp,
      };
      const outcome = await this.driver.writeBook({
        book,
        expectedRevision: expected,
        revision: this.revisionRow(book, 'restore', timestamp),
        content: data.content,
        keepRevisions: this.store.options.keepRevisions,
        ...(quarantine ? { quarantine } : {}),
      });
      if (!outcome.ok) this.stale(outcome);
      return {
        bookId,
        ownerUid: this.ownerUid,
        manuscript: data.manuscript,
        localRevision: nextRevision,
        checksum: data.checksum,
        dirty: true,
        syncedRevision: book.syncedRevision,
        createdAt: book.createdAt,
        updatedAt: timestamp,
      };
    });
  }

  async listQuarantine(bookId: string): Promise<QuarantinedContent[]> {
    return this.read(async () => {
      const rows = await this.driver.listQuarantine(this.ownerUid, bookId);
      return rows.map((raw) => readQuarantine(raw)).filter((row): row is QuarantinedContent => row !== null);
    });
  }

  /** Step one of deletion: returns a token the UI must pass to `confirmDelete` after the author confirms. */
  async requestDelete(bookId: string): Promise<DeleteRequest> {
    const summary = (await this.list()).find((entry) => entry.bookId === bookId);
    if (!summary) throw new StorageError('not_found');
    if (summary.localRevision < 1) {
      throw new StorageError('corrupt_record', { message: 'This entry is too damaged to delete from the app.' });
    }
    const token = this.store.options.createToken();
    const expiresAt = this.now().getTime() + this.store.options.deleteConfirmationTtlMs;
    this.deleteRequests.set(token, { bookId, localRevision: summary.localRevision, expiresAt });
    return { token, bookId, title: summary.title, localRevision: summary.localRevision, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** Step two: permanently deletes the manuscript and its local revisions. */
  async confirmDelete(token: string): Promise<void> {
    this.assertOpen();
    const request = this.deleteRequests.get(token);
    this.deleteRequests.delete(token);
    if (!request || request.expiresAt < this.now().getTime()) throw new StorageError('confirmation_required');
    const outcome = await this.write(() => this.driver.deleteBook(this.ownerUid, request.bookId, request.localRevision));
    if (!outcome.ok) throw new StorageError('confirmation_required');
  }

  /** For M1-C: manuscripts with local changes not yet acknowledged by the server. */
  async listUnsynced(): Promise<ManuscriptSummary[]> {
    return (await this.list()).filter((summary) => summary.dirty);
  }

  /** For M1-C: refused (`stale_revision`) if the manuscript was edited after `localRevision`. */
  async markSynced(bookId: string, localRevision: number, syncedRevision: number): Promise<void> {
    const outcome = await this.write(() => this.driver.markSynced(this.ownerUid, bookId, localRevision, syncedRevision));
    if (!outcome.ok) this.stale(outcome);
  }

  /** Rejects all further calls. Writes already queued still complete, into this account only. */
  close() {
    this.closed = true;
    this.deleteRequests.clear();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
