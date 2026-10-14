import { type Manuscript, manuscriptWordCount, type Section } from '@folio-loom/book-model';
import { type LibraryChange, type LocalManuscriptStore, type OutboxEntry, StorageError, type UserLibrary } from '@folio-loom/local-storage';
import {
  adoptLandedUnits,
  type BookStructure,
  baseAfterCommit,
  type ConflictChoice,
  emptyBase,
  hashStructure,
  isCleanAgainstBase,
  localHashFor,
  planPush,
  reconcile,
  resolveConflict,
  type SyncConflict,
  SyncIntegrityError,
  sectionsToFetch,
  structureOf,
} from '@folio-loom/sync';
import { RemoteError, StaleCommitError, toRemoteError } from './errors';
import type { RemoteBooks, RemoteHead, SnapshotMeta, SnapshotReason } from './remote';
import { type BookSyncState, initialSyncState, parseSyncState, serializeSyncState } from './state';

export type SyncStatusKind = 'savedLocally' | 'waiting' | 'syncing' | 'synced' | 'conflict' | 'failed' | 'offline';

export const SYNC_STATUS_LABEL: Record<SyncStatusKind, string> = {
  savedLocally: 'Saved locally',
  waiting: 'Waiting to sync',
  syncing: 'Syncing…',
  synced: 'Synced',
  conflict: 'Conflict detected',
  failed: 'Sync failed',
  offline: 'Offline',
};

export interface BookSyncStatus {
  bookId: string;
  kind: SyncStatusKind;
  message: string | null;
  conflicts: number;
  lastSyncedAt: string | null;
  /** The last failure needs a manual retry. */
  needsRetry: boolean;
}

export type EnginePause = 'signedOut' | 'wrongAccount' | null;

export interface SyncSnapshot {
  running: boolean;
  paused: EnginePause;
  online: boolean;
  books: ReadonlyMap<string, BookSyncStatus>;
}

export interface NetworkMonitor {
  /** `null` = unknown (treated as online; failures reveal offline). */
  online(): boolean | null;
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface SyncEngineOptions {
  store: LocalManuscriptStore;
  library: UserLibrary;
  remote: RemoteBooks;
  network?: NetworkMonitor;
  now?: () => Date;
  random?: () => number;
  /** Delay after a local save before syncing (default 1500 ms). */
  debounceMs?: number;
  /** Schedule syncs automatically from saves, timers and network changes (default true). */
  autoSchedule?: boolean;
  /** Minimum time between periodic snapshots per book (default 6 h). */
  snapshotIntervalMs?: number;
  retention?: { automatic?: number; safetyKeep?: number; safetyDays?: number };
  backoff?: { baseMs?: number; maxMs?: number };
}

export class ConflictResolutionError extends Error {
  constructor(
    readonly reason: 'not_found' | 'changed' | 'not_applicable' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ConflictResolutionError';
  }
}

export class SnapshotRestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotRestoreError';
  }
}

/** What the conflict screen shows: both versions, clearly attributed. */
export interface ConflictView {
  conflict: SyncConflict;
  mine: Section | BookStructure | Manuscript | null;
  theirs: Section | BookStructure | null;
  expected: { remoteRevision: number; localHash: string | null };
  /** Titles of the sections on this device, for showing section orders. */
  sectionTitles: Readonly<Record<string, string>>;
}

const AUTOMATIC: readonly SnapshotReason[] = ['initialUpload', 'periodic', 'manual'];
const MAX_RESTARTS = 4;

/**
 * Offline-first sync for one signed-in account. Local storage is the source of truth for the
 * author's work; the engine moves committed changes between it and the cloud, one book at a time,
 * never overwriting a newer revision and never reporting "synced" without a server commit.
 */
export class SyncEngine {
  private readonly library: UserLibrary;
  private readonly remote: RemoteBooks;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly debounceMs: number;
  private readonly autoSchedule: boolean;
  private readonly snapshotIntervalMs: number;
  private readonly retention: { automatic: number; safetyKeep: number; safetyDays: number };
  private readonly backoff: { baseMs: number; maxMs: number };

  private running = false;
  private paused: EnginePause = null;
  private inferredOffline = false;
  private inFlight: string | null = null;
  private lane: Promise<unknown> = Promise.resolve();
  private readonly editing = new Map<string, number>();
  private readonly due = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();
  private statuses = new Map<string, BookSyncStatus>();
  private snapshot: SyncSnapshot;

  constructor(private readonly options: SyncEngineOptions) {
    this.library = options.library;
    this.remote = options.remote;
    if (this.library.ownerUid !== this.remote.uid) throw new Error('Library and remote belong to different accounts.');
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.debounceMs = options.debounceMs ?? 1500;
    this.autoSchedule = options.autoSchedule ?? true;
    this.snapshotIntervalMs = options.snapshotIntervalMs ?? 6 * 60 * 60_000;
    this.retention = { automatic: 20, safetyKeep: 10, safetyDays: 30, ...options.retention };
    this.backoff = { baseMs: 1000, maxMs: 5 * 60_000, ...options.backoff };
    this.snapshot = this.buildSnapshot();
  }

  get uid(): string {
    return this.library.ownerUid;
  }

  // ---- lifecycle and observation -------------------------------------------------------------

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = null;
    this.unsubscribers.push(this.options.store.onChange((change) => this.onLocalChange(change)));
    if (this.options.network) {
      this.unsubscribers.push(
        this.options.network.subscribe((online) => {
          if (online) {
            this.inferredOffline = false;
            if (this.autoSchedule) void this.syncAll().catch(() => undefined);
          }
          this.emit();
        }),
      );
    }
    this.emit();
    if (this.autoSchedule) void this.syncAll().catch(() => undefined);
    else void this.refreshStatuses().catch(() => undefined);
  }

  /** Stops scheduling; waits for the in-flight step, which can only write to this account. */
  async stop(): Promise<void> {
    this.running = false;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.due.clear();
    await this.lane.catch(() => undefined);
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  private online(): boolean {
    return this.options.network?.online() !== false && !this.inferredOffline;
  }

  private buildSnapshot(): SyncSnapshot {
    return { running: this.running, paused: this.paused, online: this.online(), books: this.statuses };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  /** Marks a book as open in the editor: cloud changes to it are applied after it closes. */
  setEditing(bookId: string, editing: boolean) {
    const count = (this.editing.get(bookId) ?? 0) + (editing ? 1 : -1);
    if (count > 0) this.editing.set(bookId, count);
    else {
      this.editing.delete(bookId);
      if (this.running && this.autoSchedule) this.schedule(bookId, 0);
    }
  }

  private onLocalChange(change: LibraryChange) {
    if (change.ownerUid !== this.uid) return;
    if (change.origin === 'local' && this.running && this.autoSchedule) this.schedule(change.bookId, this.debounceMs);
    void this.refreshStatus(change.bookId).catch(() => undefined);
  }

  // ---- scheduling ----------------------------------------------------------------------------

  private schedule(bookId: string, delayMs: number) {
    if (!this.running) return;
    const at = this.now().getTime() + delayMs;
    const existing = this.due.get(bookId);
    if (existing === undefined || at < existing) this.due.set(bookId, at);
    this.arm();
  }

  private arm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.running || this.paused || this.due.size === 0) return;
    const next = Math.min(...this.due.values());
    this.timer = setTimeout(() => this.fire(), Math.max(0, next - this.now().getTime()));
  }

  private fire() {
    this.timer = null;
    const now = this.now().getTime();
    const ready = [...this.due.entries()].filter(([, at]) => at <= now).map(([bookId]) => bookId);
    for (const bookId of ready) {
      this.due.delete(bookId);
      void this.syncBook(bookId).catch(() => undefined);
    }
    this.arm();
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lane.then(task, task);
    this.lane = run.catch(() => undefined);
    return run;
  }

  // ---- public operations ---------------------------------------------------------------------

  /**
   * One pass over the account: every local book with queued or unconfirmed changes, every book
   * that changed in the cloud, queued cloud deletions, and cloud books not yet on this device.
   */
  async syncAll(options: { force?: boolean } = {}): Promise<void> {
    if (!this.running || this.paused) return;
    let heads: Awaited<ReturnType<RemoteBooks['listHeads']>>;
    try {
      heads = await this.remote.listHeads();
      this.inferredOffline = false;
    } catch (error) {
      await this.handleGlobalError(error);
      await this.refreshStatuses();
      return;
    }
    const [books, states, outbox] = await Promise.all([this.library.list(), this.library.listSyncStates(), this.library.listOutbox()]);
    const headById = new Map(heads.map((entry) => [entry.bookId, entry]));
    const queued = new Set(outbox.map((op) => op.bookId));
    const deleting = new Set(outbox.filter((op) => op.kind === 'deleteBook').map((op) => op.bookId));
    const local = new Set(books.map((book) => book.bookId));
    const targets: string[] = [];
    for (const book of books) {
      if (book.health !== 'ok') continue;
      const { state } = parseSyncState(states.get(book.bookId) ?? null);
      if (state.failure?.permanent && !options.force) continue;
      const head = headById.get(book.bookId)?.head ?? null;
      const needs =
        queued.has(book.bookId) ||
        book.dirty ||
        !state.base ||
        !head ||
        head.view.revision !== state.base.headRevision ||
        state.conflicts.length > 0 ||
        state.pending !== null ||
        state.failure !== null ||
        state.remoteDeferred;
      if (needs) targets.push(book.bookId);
    }
    for (const bookId of deleting) if (!local.has(bookId)) targets.push(bookId);
    for (const { bookId, head } of heads) {
      if (head && !head.view.deleted && !local.has(bookId) && !deleting.has(bookId)) targets.push(bookId);
    }
    for (const bookId of targets) await this.syncBook(bookId);
    await this.refreshStatuses();
  }

  /** Syncs one book now (also the manual "Retry"). */
  syncBook(bookId: string): Promise<void> {
    this.due.delete(bookId);
    return this.exclusive(() => this.runBook(bookId));
  }

  async getConflicts(bookId: string): Promise<ConflictView[]> {
    const loaded = await this.library.load(bookId);
    if (!loaded.ok) return [];
    const { state } = parseSyncState(await this.library.getSyncState(bookId));
    const manuscript = loaded.record.manuscript;
    const sectionTitles = Object.fromEntries(manuscript.sections.map((section) => [section.id, section.title || 'Untitled section']));
    return state.conflicts.map((conflict) => {
      const expected = { remoteRevision: conflict.remoteRevision, localHash: localHashFor(manuscript, conflict) };
      if (conflict.kind === 'structure') return { conflict, mine: structureOf(manuscript), theirs: conflict.remoteStructure, expected, sectionTitles };
      if (conflict.kind === 'bookDeleted') return { conflict, mine: manuscript, theirs: null, expected, sectionTitles };
      const mine = manuscript.sections.find((section) => section.id === conflict.sectionId) ?? null;
      return { conflict, mine, theirs: conflict.remoteSection, expected, sectionTitles };
    });
  }

  /**
   * Applies the author's choice locally (atomically, with preserved copies of whatever is
   * replaced), then syncs through the normal compare-and-set path.
   */
  resolveConflict(bookId: string, conflictId: string, choice: ConflictChoice, expected: ConflictView['expected']): Promise<void> {
    return this.exclusive(async () => {
      const loaded = await this.library.load(bookId);
      if (!loaded.ok) throw new ConflictResolutionError('unavailable', 'This manuscript can’t be opened on this device.');
      const local = loaded.record;
      const { state } = parseSyncState(await this.library.getSyncState(bookId));
      const result = resolveConflict({
        manuscript: local.manuscript,
        base: state.base ?? emptyBase(),
        conflicts: state.conflicts,
        conflictId,
        choice,
        expected,
      });
      if (!result.ok) throw new ConflictResolutionError(result.reason, result.message);
      const conflict = state.conflicts.find((entry) => entry.id === conflictId);
      if (choice === 'mine' && conflict && conflict.kind !== 'remoteDeleted' && conflict.kind !== 'bookDeleted') {
        await this.snapshotCloud(bookId, 'beforeConflictResolution');
      }
      if (result.deleteLocal) {
        await this.library.applySync(bookId, {
          expectedRevision: local.localRevision,
          deleteLocal: true,
          syncState: null,
          removeAllOps: true,
          preserve: result.preserve,
        });
      } else {
        const next: BookSyncState = { ...state, base: result.base, conflicts: result.conflicts, undelete: state.undelete || result.undelete === true, failure: null };
        await this.library.applySync(bookId, {
          expectedRevision: local.localRevision,
          ...(result.manuscript !== local.manuscript ? { content: { manuscript: result.manuscript, reason: 'conflict' as const } } : {}),
          syncState: serializeSyncState(next),
          preserve: result.preserve,
          queue: true,
        });
      }
      this.schedule(bookId, 0);
    });
  }

  listSnapshots(bookId: string): Promise<SnapshotMeta[]> {
    return this.remote.listSnapshots(bookId);
  }

  /** Manual snapshot of the current device copy. */
  createSnapshot(bookId: string): Promise<SnapshotMeta> {
    return this.exclusive(async () => {
      const loaded = await this.library.load(bookId);
      if (!loaded.ok) throw new SnapshotRestoreError('This manuscript can’t be opened on this device.');
      const { state } = parseSyncState(await this.library.getSyncState(bookId));
      const meta = await this.remote.createSnapshot(bookId, 'manual', loaded.record.manuscript, state.base?.headRevision ?? 0);
      await this.prune(bookId);
      return meta;
    });
  }

  /**
   * Restores a snapshot as a new revision. Requires a fully synced book; first snapshots the
   * current state (cloud) and keeps a local preserved copy, then uploads with compare-and-set.
   */
  restoreSnapshot(bookId: string, snapshotId: string): Promise<void> {
    return this.exclusive(async () => {
      if (this.editing.has(bookId)) throw new SnapshotRestoreError('Close the manuscript before restoring a snapshot.');
      const loaded = await this.library.load(bookId);
      if (!loaded.ok) throw new SnapshotRestoreError('This manuscript can’t be opened on this device.');
      const local = loaded.record;
      const { state } = parseSyncState(await this.library.getSyncState(bookId));
      const ops = (await this.library.listOutbox()).filter((op) => op.bookId === bookId);
      if (ops.length > 0 || local.dirty || state.conflicts.length > 0 || state.pending || !state.base) {
        throw new SnapshotRestoreError('Sync this manuscript (and resolve any conflicts) before restoring a snapshot.');
      }
      const { manuscript: restored, meta } = await this.remote.readSnapshot(bookId, snapshotId);
      await this.remote.createSnapshot(bookId, 'beforeRestore', local.manuscript, state.base.headRevision);
      await this.library.applySync(bookId, {
        expectedRevision: local.localRevision,
        content: { manuscript: { ...restored, id: bookId }, reason: 'restore' },
        syncState: serializeSyncState({ ...state, failure: null }),
        preserve: [{ manuscript: local.manuscript, reason: `Before restoring the snapshot from ${meta.createdAt ?? 'earlier'}` }],
        queue: true,
      });
      this.schedule(bookId, 0);
      await this.prune(bookId).catch(() => undefined);
    });
  }

  // ---- status --------------------------------------------------------------------------------

  async refreshStatuses(): Promise<void> {
    const [books, states, outbox] = await Promise.all([this.library.list(), this.library.listSyncStates(), this.library.listOutbox()]);
    const next = new Map<string, BookSyncStatus>();
    for (const book of books) {
      const { state } = parseSyncState(states.get(book.bookId) ?? null);
      next.set(book.bookId, this.computeStatus(book.bookId, state, outbox, book.dirty));
    }
    this.statuses = next;
    this.emit();
  }

  private async refreshStatus(bookId: string): Promise<void> {
    const [books, stateJson, outbox] = await Promise.all([this.library.list(), this.library.getSyncState(bookId), this.library.listOutbox()]);
    const book = books.find((entry) => entry.bookId === bookId);
    const next = new Map(this.statuses);
    if (book) next.set(bookId, this.computeStatus(bookId, parseSyncState(stateJson).state, outbox, book.dirty));
    else next.delete(bookId);
    this.statuses = next;
    this.emit();
  }

  private computeStatus(bookId: string, state: BookSyncState, outbox: OutboxEntry[], dirty: boolean): BookSyncStatus {
    const pendingWork = dirty || outbox.some((op) => op.bookId === bookId) || state.pending !== null || state.remoteDeferred;
    const status = (kind: SyncStatusKind, message: string | null = null): BookSyncStatus => ({
      bookId,
      kind,
      message,
      conflicts: state.conflicts.length,
      lastSyncedAt: state.lastSyncedAt,
      needsRetry: state.failure?.permanent === true,
    });
    if (this.inFlight === bookId) return status('syncing');
    if (state.conflicts.length > 0) return status('conflict', `${state.conflicts.length} conflict${state.conflicts.length === 1 ? '' : 's'} to review`);
    if (state.failure?.permanent) return status('failed', state.failure.message);
    if (!this.running || this.paused) {
      const message = this.paused === 'wrongAccount' ? 'Sync stopped: a different account is signed in.' : this.paused === 'signedOut' ? 'Sign in to sync.' : null;
      return status(pendingWork || !state.lastSyncedAt ? 'savedLocally' : 'synced', message);
    }
    if (!this.online()) return status('offline', pendingWork ? 'Changes will sync when you’re back online.' : null);
    if (state.failure) return status(state.failure.attempts >= 3 ? 'failed' : 'waiting', `${state.failure.message} Retrying automatically.`);
    if (state.remoteDeferred) return status('waiting', 'Changes from another device will appear when you close this manuscript.');
    if (pendingWork || !state.base || !state.lastSyncedAt) return status('waiting');
    return status('synced');
  }

  // ---- the sync cycle ------------------------------------------------------------------------

  private async runBook(bookId: string): Promise<void> {
    if (!this.running || this.paused) return;
    this.inFlight = bookId;
    await this.refreshStatus(bookId).catch(() => undefined);
    try {
      await this.cycle(bookId);
      this.inferredOffline = false;
    } catch (error) {
      await this.recordFailure(bookId, error);
    } finally {
      this.inFlight = null;
      await this.refreshStatus(bookId).catch(() => undefined);
    }
  }

  private async readState(bookId: string): Promise<BookSyncState> {
    return parseSyncState(await this.library.getSyncState(bookId)).state;
  }

  private async cycle(bookId: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_RESTARTS; attempt++) {
      const ops = (await this.library.listOutbox()).filter((op) => op.bookId === bookId);
      let state = await this.readState(bookId);
      const loaded = await this.library.load(bookId);
      if (!loaded.ok) {
        if (loaded.reason !== 'not_found') {
          throw new RemoteError('invalid_data', { message: 'The copy on this device is unreadable, so it was not synced. Restore an earlier version first.' });
        }
        const deletion = ops.find((op) => op.kind === 'deleteBook');
        if (deletion) return this.pushDeletion(bookId, state, deletion);
        return this.download(bookId);
      }
      const local = loaded.record;
      const head = await this.remote.readHead(bookId);

      if (state.pending && head) state = { ...state, base: adoptLandedUnits(state.base, state.pending, head.view), pending: null };
      if (state.pending && !head) state = { ...state, pending: null };

      if (!head && state.base) state = await this.cloudCopyMissing(bookId, local.manuscript, state);

      if (head?.view.deleted && !state.undelete) {
        const clean = isCleanAgainstBase(state.base, local.manuscript, state.conflicts) && ops.length === 0 && !local.dirty;
        if (clean) {
          await this.library.applySync(bookId, { expectedRevision: local.localRevision, deleteLocal: true, syncState: null, removeAllOps: true });
          return;
        }
        if (!state.conflicts.some((conflict) => conflict.kind === 'bookDeleted')) {
          const conflict: SyncConflict = {
            id: 'book',
            kind: 'bookDeleted',
            sectionId: null,
            title: local.manuscript.title,
            remoteRevision: head.view.revision,
            remoteHash: null,
            remoteSection: null,
            remoteStructure: null,
            localHash: null,
            detectedAt: this.now().toISOString(),
          };
          state = { ...state, conflicts: [conflict] };
        }
        await this.library.applySync(bookId, { syncState: serializeSyncState({ ...state, failure: null }) });
        return;
      }

      // Phase 1: bring cloud changes into the device copy (or record conflicts).
      let manuscript = local.manuscript;
      let localRevision = local.localRevision;
      if (head) {
        const remoteSections = await this.remote.readSections(bookId, sectionsToFetch(state.base, head.view, state.conflicts), head.view);
        const result = reconcile({ base: state.base, local: manuscript, remote: head.view, remoteSections, conflicts: state.conflicts, now: this.now().toISOString() });
        if (result.changedLocal && this.editing.has(bookId)) {
          state = { ...state, conflicts: result.conflicts, remoteDeferred: true };
          await this.library.applySync(bookId, { syncState: serializeSyncState(state) });
        } else {
          state = { ...state, base: result.base, conflicts: result.conflicts, remoteDeferred: false };
          try {
            const written = await this.library.applySync(bookId, {
              expectedRevision: localRevision,
              ...(result.changedLocal ? { content: { manuscript: result.manuscript, reason: 'sync' as const } } : {}),
              syncState: serializeSyncState(state),
            });
            if (result.changedLocal && written.localRevision !== null) {
              manuscript = result.manuscript;
              localRevision = written.localRevision;
            }
          } catch (error) {
            if (error instanceof StorageError && error.code === 'stale_revision') continue;
            throw error;
          }
        }
      }

      // Phase 2: upload what changed here, compare-and-set against the server revisions.
      const plan = planPush(state.base, manuscript, head?.view ?? null, state.conflicts, { force: state.undelete });
      const finish = async (extra: Partial<BookSyncState>, syncedRevision: number | null) => {
        const next: BookSyncState = { ...state, ...extra, failure: null, lastSyncedAt: this.now().toISOString() };
        const clean = !next.remoteDeferred && isCleanAgainstBase(next.base, manuscript, next.conflicts);
        await this.library.applySync(bookId, {
          syncState: serializeSyncState(next),
          removeOpIds: ops.filter((op) => op.kind === 'sync' && (op.localRevision === null || op.localRevision <= localRevision)).map((op) => op.opId),
          ...(clean && syncedRevision !== null ? { markSynced: { localRevision, syncedRevision } } : {}),
        });
        return next;
      };

      if (!plan) {
        await finish({}, head?.view.revision ?? null);
        return;
      }
      this.remote.checkCommitSize(plan, head?.view ?? null);
      const opId = ops.filter((op) => op.kind === 'sync').at(-1)?.opId ?? `sync-${this.now().getTime().toString(36)}-${Math.floor(this.random() * 1e9).toString(36)}`;
      state = {
        ...state,
        pending: {
          opId,
          structureHash: plan.structureChanged ? plan.structureHash : null,
          sections: Object.fromEntries(plan.sections.map((write) => [write.id, write.hash])),
        },
      };
      await this.library.applySync(bookId, { syncState: serializeSyncState(state) });

      let commit: Awaited<ReturnType<RemoteBooks['commit']>>;
      try {
        commit = await this.remote.commit(bookId, {
          opId,
          expectedHead: head?.view.revision ?? null,
          plan,
          schemaVersion: manuscript.schemaVersion,
          title: manuscript.title,
          wordCount: manuscriptWordCount(manuscript),
          undelete: state.undelete,
        });
      } catch (error) {
        if (error instanceof StaleCommitError) continue;
        throw error;
      }
      if (commit.duplicate) continue;

      const firstUpload = head === null;
      const next = await finish({ base: baseAfterCommit(head ? state.base : null, plan, commit), pending: null, undelete: false }, commit.revision);
      await this.milestoneSnapshot(bookId, manuscript, next, firstUpload);
      return;
    }
    throw new RemoteError('aborted', { message: 'The cloud copy kept changing while syncing. Sync will retry shortly.' });
  }

  /** The cloud copy disappeared (e.g. emulator reset). Keep every version locally and upload again. */
  private async cloudCopyMissing(bookId: string, manuscript: Manuscript, state: BookSyncState): Promise<BookSyncState> {
    const preserve: { manuscript: Manuscript; reason: string }[] = [];
    for (const conflict of state.conflicts) {
      if (conflict.kind === 'bookDeleted' || conflict.kind === 'remoteDeleted') continue;
      const theirs = resolveConflict({
        manuscript,
        base: state.base ?? emptyBase(),
        conflicts: state.conflicts,
        conflictId: conflict.id,
        choice: 'theirs',
        expected: { remoteRevision: conflict.remoteRevision, localHash: localHashFor(manuscript, conflict) },
      });
      if (theirs.ok) preserve.push({ manuscript: theirs.manuscript, reason: `Cloud version of “${conflict.title}” (the cloud copy was later missing)` });
    }
    const next = { ...state, base: null, conflicts: [] };
    await this.library.applySync(bookId, { syncState: serializeSyncState(next), preserve });
    return next;
  }

  private async pushDeletion(bookId: string, state: BookSyncState, op: OutboxEntry): Promise<void> {
    const head = await this.remote.readHead(bookId).catch((error: unknown) => {
      const remoteError = toRemoteError(error);
      if (remoteError instanceof RemoteError && (remoteError.code === 'invalid_data' || remoteError.code === 'unsupported_version')) return null;
      throw error;
    });
    if (head && !head.view.deleted && state.base && head.view.revision === state.base.headRevision) {
      await this.remote.softDelete(bookId, head.view.revision, op.opId);
    }
    // If the cloud copy changed after this device last synced, it is kept and downloaded again.
    await this.library.applySync(bookId, { syncState: null, removeAllOps: true });
    if (head && !head.view.deleted && state.base && head.view.revision !== state.base.headRevision) {
      this.schedule(bookId, 0);
    }
  }

  private async download(bookId: string): Promise<void> {
    const book = await this.remote.readBook(bookId);
    if (!book) return;
    const { head, manuscript } = book;
    const state: BookSyncState = {
      ...initialSyncState(),
      base: baseFromHead(head),
      lastSyncedAt: this.now().toISOString(),
    };
    try {
      await this.library.applySync(bookId, {
        expectedRevision: null,
        content: { manuscript, reason: 'sync' },
        syncState: serializeSyncState(state),
        markSynced: { localRevision: 1, syncedRevision: head.view.revision },
      });
    } catch (error) {
      if (error instanceof StorageError && error.code === 'stale_revision') return;
      if (error instanceof StorageError && error.code === 'invalid_manuscript') throw new RemoteError('invalid_data', { detail: error.detail });
      throw error;
    }
  }

  // ---- snapshots -----------------------------------------------------------------------------

  private async milestoneSnapshot(bookId: string, manuscript: Manuscript, state: BookSyncState, firstUpload: boolean) {
    const clean = isCleanAgainstBase(state.base, manuscript, state.conflicts);
    const last = state.lastSnapshotAt ? Date.parse(state.lastSnapshotAt) : 0;
    const reason: SnapshotReason | null = firstUpload ? 'initialUpload' : clean && this.now().getTime() - last >= this.snapshotIntervalMs ? 'periodic' : null;
    if (!reason || !state.base) return;
    try {
      await this.remote.createSnapshot(bookId, reason, manuscript, state.base.headRevision);
      const latest = await this.readState(bookId);
      await this.library.applySync(bookId, { syncState: serializeSyncState({ ...latest, lastSnapshotAt: this.now().toISOString() }) });
      await this.prune(bookId);
    } catch {
      // Snapshots are a safety net on top of committed sync; a failed one is retried at the next milestone.
    }
  }

  private async snapshotCloud(bookId: string, reason: SnapshotReason) {
    try {
      const book = await this.remote.readBook(bookId);
      if (book) await this.remote.createSnapshot(bookId, reason, book.manuscript, book.head.view.revision);
    } catch {
      // Offline: the replaced cloud version is still kept as a local preserved copy.
    }
  }

  /** Retention: newest N automatic snapshots; safety snapshots for D days (always the newest K). */
  private async prune(bookId: string) {
    const all = await this.remote.listSnapshots(bookId);
    const cutoff = this.now().getTime() - this.retention.safetyDays * 24 * 60 * 60_000;
    const automatic = all.filter((meta) => AUTOMATIC.includes(meta.reason));
    const safety = all.filter((meta) => !AUTOMATIC.includes(meta.reason));
    const doomed = [
      ...automatic.slice(this.retention.automatic),
      ...safety.slice(this.retention.safetyKeep).filter((meta) => meta.createdAt !== null && Date.parse(meta.createdAt) < cutoff),
    ];
    for (const meta of doomed) await this.remote.deleteSnapshot(bookId, meta.id, meta.chunkCount);
  }

  // ---- failures ------------------------------------------------------------------------------

  private async handleGlobalError(error: unknown): Promise<boolean> {
    const remote = toRemoteError(error);
    if (remote instanceof RemoteError && (remote.code === 'wrong_account' || remote.code === 'unauthenticated')) {
      this.paused = remote.code === 'wrong_account' ? 'wrongAccount' : 'signedOut';
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.emit();
      return true;
    }
    if (remote instanceof RemoteError && remote.code === 'unavailable') {
      this.inferredOffline = true;
      this.emit();
    }
    return false;
  }

  private async recordFailure(bookId: string, error: unknown) {
    if (await this.handleGlobalError(error)) return;
    let code: string;
    let message: string;
    let permanent: boolean;
    if (error instanceof StorageError) {
      code = error.code;
      message = error.message;
      permanent = error.code !== 'stale_revision' && error.code !== 'not_ready';
    } else if (error instanceof SyncIntegrityError) {
      code = 'aborted';
      message = 'The cloud copy changed while syncing. Sync will retry shortly.';
      permanent = false;
    } else {
      const remote = toRemoteError(error);
      code = remote instanceof RemoteError ? remote.code : 'aborted';
      message = remote.message;
      permanent = remote instanceof RemoteError && !remote.retryable;
    }
    const state = await this.readState(bookId).catch(() => initialSyncState());
    const attempts = (state.failure?.attempts ?? 0) + 1;
    const delay = Math.min(this.backoff.baseMs * 2 ** (attempts - 1), this.backoff.maxMs) * (0.5 + this.random() * 0.5);
    const nextAttemptAt = permanent ? null : this.now().getTime() + delay;
    await this.library
      .applySync(bookId, { syncState: serializeSyncState({ ...state, failure: { code, message, permanent, attempts, nextAttemptAt } }) })
      .catch(() => undefined);
    if (!permanent && this.autoSchedule) this.schedule(bookId, delay);
  }
}

export function baseFromHead(head: RemoteHead) {
  const view = head.view;
  return {
    headRevision: view.revision,
    structure: { revision: view.structureRevision, hash: hashStructure(view.structure), value: view.structure },
    sections: Object.fromEntries(Object.entries(view.sections).map(([id, entry]) => [id, { revision: entry.revision, hash: entry.hash }])),
  };
}

