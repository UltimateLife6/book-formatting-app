import type { ApplySyncCommand, BookRow, CompareAndSetOutcome, DriverOpenResult, OutboxInput, StorageDriver, WriteBookCommand } from './driver';
import { StorageError, toStorageError } from './errors';
import type { StorageState } from './types';

export const DEFAULT_DATABASE_NAME = 'folio-loom-local';

export interface IndexedDbMigration {
  /** Target database version; numbered 1, 2, 3… with no gaps. */
  version: number;
  description: string;
  /** Runs inside the `versionchange` transaction. Throwing aborts the upgrade and keeps the old version. */
  upgrade(db: IDBDatabase, tx: IDBTransaction): void;
}

/** Append-only, like the SQLite migrations. Never delete a store that holds author content. */
export const INDEXEDDB_MIGRATIONS: readonly IndexedDbMigration[] = [
  {
    version: 1,
    description: 'books, revisions (metadata), contents, quarantine',
    upgrade(db) {
      const books = db.createObjectStore('books', { keyPath: ['ownerUid', 'bookId'] });
      books.createIndex('by_owner', 'ownerUid');
      db.createObjectStore('revisions', { keyPath: ['ownerUid', 'bookId', 'revision'] });
      // Content lives apart from revision metadata so listing revisions never reads manuscript text.
      db.createObjectStore('contents', { keyPath: ['ownerUid', 'bookId', 'revision'] });
      const quarantine = db.createObjectStore('quarantine', { keyPath: 'id', autoIncrement: true });
      quarantine.createIndex('by_owner_book', ['ownerUid', 'bookId']);
    },
  },
  {
    version: 2,
    description: 'cloud sync: per-book sync state, durable outbox, preserved copies',
    upgrade(db, tx) {
      db.createObjectStore('sync_state', { keyPath: ['ownerUid', 'bookId'] }).createIndex('by_owner', 'ownerUid');
      const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      outbox.createIndex('by_owner', 'ownerUid');
      outbox.createIndex('by_owner_book', ['ownerUid', 'bookId']);
      outbox.createIndex('by_op', 'opId', { unique: true });
      db.createObjectStore('preserved', { keyPath: 'id', autoIncrement: true }).createIndex('by_owner', 'ownerUid');
      // Manuscripts saved before sync existed are queued for their first upload.
      const cursor = tx.objectStore('books').openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        const book = current.value as BookRow;
        outbox.add({
          opId: `v2-${book.ownerUid}-${book.bookId}`,
          ownerUid: book.ownerUid,
          bookId: book.bookId,
          kind: 'sync',
          localRevision: book.localRevision,
          createdAt: book.updatedAt,
        });
        current.continue();
      };
    },
  },
];

export interface IndexedDbDriverOptions {
  /** Defaults to `globalThis.indexedDB`, which is undefined during server rendering. */
  indexedDB?: IDBFactory;
  keyRange?: typeof IDBKeyRange;
  databaseName?: string;
  migrations?: readonly IndexedDbMigration[];
}

const STORES = ['books', 'revisions', 'contents', 'quarantine', 'sync_state', 'outbox', 'preserved'];

function requestError(request: IDBRequest | IDBOpenDBRequest): unknown {
  try {
    return request.error;
  } catch {
    return null;
  }
}

export function createIndexedDbDriver(options: IndexedDbDriverOptions = {}): StorageDriver {
  const migrations = options.migrations ?? INDEXEDDB_MIGRATIONS;
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error(`IndexedDB migrations must be numbered 1..n; found ${migration.version} at ${index}.`);
  });
  const latest = migrations.length;
  const name = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const globals = globalThis as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  let database: IDBDatabase | null = null;
  let report: (state: StorageState) => void = () => {};

  const factory = () => options.indexedDB ?? globals.indexedDB;
  const keyRange = () => {
    const range = options.keyRange ?? globals.IDBKeyRange;
    if (!range) throw new StorageError('unavailable');
    return range;
  };
  const bookRange = (ownerUid: string, bookId: string) => keyRange().bound([ownerUid, bookId, 0], [ownerUid, bookId, Number.MAX_SAFE_INTEGER]);

  const db = (): IDBDatabase => {
    if (!database) throw new StorageError('closed');
    return database;
  };

  /**
   * Runs `body` in one transaction and resolves after `complete` (with `durability: 'strict'`,
   * after the browser has flushed to disk where supported). Any request error aborts everything.
   * `body` must only issue IndexedDB requests: awaiting other work would auto-commit the transaction.
   */
  function transact<T>(
    stores: string[],
    mode: IDBTransactionMode,
    body: (tx: IDBTransaction, setResult: (value: T) => void, fail: (error: unknown) => void) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let result: T | undefined;
      let failure: unknown = null;
      let tx: IDBTransaction;
      try {
        tx = db().transaction(stores, mode, { durability: 'strict' });
      } catch (error) {
        reject(toStorageError(error));
        return;
      }
      const fail = (error: unknown) => {
        failure ??= error;
        try {
          tx.abort();
        } catch {
          reject(toStorageError(failure));
        }
      };
      tx.oncomplete = () => resolve(result as T);
      tx.onerror = (event) => {
        failure ??= requestError(event.target as IDBRequest);
      };
      tx.onabort = () => reject(toStorageError(failure ?? tx.error ?? new DOMException('Transaction aborted', 'AbortError')));
      try {
        body(
          tx,
          (value) => {
            result = value;
          },
          fail,
        );
      } catch (error) {
        fail(error);
      }
    });
  }

  function readRequest<T>(store: string, run: (objectStore: IDBObjectStore) => IDBRequest): Promise<T> {
    return transact<T>([store], 'readonly', (tx, setResult) => {
      const request = run(tx.objectStore(store));
      request.onsuccess = () => setResult(request.result as T);
    });
  }

  /** Reads the stored revision, then either writes (via `apply`) or reports a stale revision, atomically. */
  function compareAndSet(
    stores: string[],
    ownerUid: string,
    bookId: string,
    matches: (current: unknown) => boolean,
    apply: (tx: IDBTransaction, current: BookRow | undefined) => void,
  ): Promise<CompareAndSetOutcome> {
    return transact<CompareAndSetOutcome>(stores, 'readwrite', (tx, setResult, fail) => {
      const get = tx.objectStore('books').get([ownerUid, bookId]);
      get.onsuccess = () => {
        const current = get.result as BookRow | undefined;
        const actual = current?.localRevision;
        if (!matches(actual)) {
          setResult({ ok: false, reason: 'stale_revision', actualRevision: typeof actual === 'number' ? actual : null });
          return;
        }
        try {
          apply(tx, current);
          setResult({ ok: true });
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  function deleteKeys(store: IDBObjectStore, request: IDBRequest<IDBValidKey[]>, keep: (key: IDBValidKey) => boolean = () => false) {
    request.onsuccess = () => {
      for (const key of request.result) if (!keep(key)) store.delete(key);
    };
  }

  /** Removes the book's ops (only `sync` ones when `syncOnly`) and then runs `after`. */
  function clearOps(tx: IDBTransaction, ownerUid: string, bookId: string, syncOnly: boolean, after: () => void = () => {}) {
    const outbox = tx.objectStore('outbox');
    const request = outbox.index('by_owner_book').getAll([ownerUid, bookId]);
    request.onsuccess = () => {
      for (const op of request.result as { seq: number; kind: string }[]) {
        if (!syncOnly || op.kind === 'sync') outbox.delete(op.seq);
      }
      after();
    };
  }

  function queueOp(tx: IDBTransaction, op: OutboxInput) {
    const add = () => tx.objectStore('outbox').add({ ...op });
    if (op.kind === 'sync') clearOps(tx, op.ownerUid, op.bookId, true, add);
    else add();
  }

  function writeRows(tx: IDBTransaction, command: Omit<WriteBookCommand, 'expectedRevision' | 'outbox'>) {
    const { book, revision } = command;
    tx.objectStore('books').put(book);
    // `add`, not `put`: an existing revision key is a ConstraintError that aborts the whole write.
    tx.objectStore('revisions').add(revision);
    tx.objectStore('contents').add({ ownerUid: book.ownerUid, bookId: book.bookId, revision: revision.revision, content: command.content });
    const cutoff = book.localRevision - command.keepRevisions;
    if (cutoff >= 1) {
      const range = keyRange().bound([book.ownerUid, book.bookId, 0], [book.ownerUid, book.bookId, cutoff]);
      tx.objectStore('revisions').delete(range);
      tx.objectStore('contents').delete(range);
    }
    if (command.quarantine) tx.objectStore('quarantine').add({ ...command.quarantine });
  }

  function deleteRows(tx: IDBTransaction, ownerUid: string, bookId: string) {
    tx.objectStore('books').delete([ownerUid, bookId]);
    tx.objectStore('revisions').delete(bookRange(ownerUid, bookId));
    tx.objectStore('contents').delete(bookRange(ownerUid, bookId));
    const quarantine = tx.objectStore('quarantine');
    deleteKeys(quarantine, quarantine.index('by_owner_book').getAllKeys([ownerUid, bookId]));
  }

  function currentVersion(idb: IDBFactory): Promise<number | null> {
    return new Promise((resolve) => {
      try {
        const request = idb.open(name);
        request.onsuccess = () => {
          const version = request.result.version;
          request.result.close();
          resolve(version);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  return {
    backend: 'indexeddb',

    open(onState) {
      report = onState ?? (() => {});
      const idb = factory();
      if (!idb) {
        return Promise.resolve<DriverOpenResult>({
          ok: false,
          version: null,
          state: { status: 'unavailable', message: 'This browser does not provide IndexedDB, so manuscripts cannot be stored offline.' },
        });
      }
      return new Promise<DriverOpenResult>((resolve) => {
        let upgradeError: unknown = null;
        let request: IDBOpenDBRequest;
        const unavailable = (error: unknown) =>
          resolve({
            ok: false,
            version: null,
            state: {
              status: 'unavailable',
              message: `Offline storage is unavailable (private browsing or storage disabled?). ${toStorageError(error, 'unavailable').detail ?? ''}`.trim(),
            },
          });
        try {
          request = idb.open(name, latest);
        } catch (error) {
          unavailable(error);
          return;
        }
        request.onupgradeneeded = (event) => {
          const upgradeDb = request.result;
          const tx = request.transaction as IDBTransaction;
          try {
            for (const migration of migrations) {
              if (migration.version > event.oldVersion) migration.upgrade(upgradeDb, tx);
            }
          } catch (error) {
            upgradeError = error;
            tx.abort();
          }
        };
        request.onblocked = () => {
          report({ status: 'blocked', message: 'Close other Folio Loom tabs so local storage can be upgraded.' });
        };
        request.onsuccess = () => {
          database = request.result;
          database.onversionchange = () => {
            database?.close();
            database = null;
            report({ status: 'closed', message: 'Folio Loom was updated in another tab. Reload this page to keep editing.' });
          };
          resolve({ ok: true, version: database.version });
        };
        request.onerror = (event) => {
          event.preventDefault();
          const error = requestError(request);
          if (upgradeError !== null) {
            void currentVersion(idb).then((version) =>
              resolve({
                ok: false,
                version,
                state: {
                  status: 'migration_failed',
                  message: `Upgrading offline storage failed and was rolled back; your manuscripts are unchanged. (${toStorageError(upgradeError).detail ?? 'unknown error'})`,
                },
              }),
            );
            return;
          }
          if ((error as { name?: string } | null)?.name === 'VersionError') {
            void currentVersion(idb).then((found) =>
              resolve({
                ok: false,
                version: found,
                state: {
                  status: 'unsupported_version',
                  found: found ?? latest + 1,
                  supported: latest,
                  message: `Offline storage in this browser was created by a newer version of Folio Loom (v${found ?? '?'}; this version supports v${latest}). Reload to get the latest version; nothing was changed.`,
                },
              }),
            );
            return;
          }
          unavailable(error);
        };
      });
    },

    listBooks(ownerUid) {
      return readRequest<unknown[]>('books', (store) => store.index('by_owner').getAll(ownerUid));
    },

    async getBook(ownerUid, bookId) {
      const row = await readRequest<unknown>('books', (store) => store.get([ownerUid, bookId]));
      return row ?? null;
    },

    writeBook(command: WriteBookCommand) {
      const { book } = command;
      return compareAndSet(
        STORES,
        book.ownerUid,
        book.bookId,
        (actual) => (command.expectedRevision === null ? actual === undefined : actual === command.expectedRevision),
        (tx) => {
          writeRows(tx, command);
          if (command.outbox) queueOp(tx, command.outbox);
        },
      );
    },

    deleteBook(ownerUid, bookId, expectedRevision, outbox) {
      return compareAndSet(
        STORES,
        ownerUid,
        bookId,
        (actual) => actual === expectedRevision,
        (tx) => {
          deleteRows(tx, ownerUid, bookId);
          clearOps(tx, ownerUid, bookId, false, () => {
            if (!outbox) return;
            const tracked = tx.objectStore('sync_state').count([ownerUid, bookId]);
            tracked.onsuccess = () => {
              if (tracked.result > 0) queueOp(tx, outbox);
            };
          });
        },
      );
    },

    applySync(command: ApplySyncCommand) {
      const { ownerUid, bookId } = command;
      if ((command.write || command.deleteLocal) && command.expectedRevision === undefined) {
        return Promise.reject(new StorageError('write_failed', { detail: 'sync writes require an expected revision' }));
      }
      return compareAndSet(
        STORES,
        ownerUid,
        bookId,
        (actual) =>
          command.expectedRevision === undefined || (command.expectedRevision === null ? actual === undefined : actual === command.expectedRevision),
        (tx, current) => {
          for (const copy of command.preserved ?? []) tx.objectStore('preserved').add({ ...copy });
          if (command.write) writeRows(tx, command.write);
          if (command.deleteLocal) deleteRows(tx, ownerUid, bookId);
          const outbox = tx.objectStore('outbox');
          if (command.removeAllOps) clearOps(tx, ownerUid, bookId, false);
          for (const opId of command.removeOpIds ?? []) {
            const key = outbox.index('by_op').getKey(opId);
            key.onsuccess = () => {
              if (key.result !== undefined) {
                const op = outbox.get(key.result);
                op.onsuccess = () => {
                  if (op.result?.ownerUid === ownerUid && op.result?.bookId === bookId) outbox.delete(key.result as IDBValidKey);
                };
              }
            };
          }
          if (command.syncState === null) tx.objectStore('sync_state').delete([ownerUid, bookId]);
          else if (command.syncState) tx.objectStore('sync_state').put({ ownerUid, bookId, ...command.syncState });
          const synced = command.markSynced;
          let row = command.write ? command.write.book : command.deleteLocal ? undefined : current;
          if (command.outbox && !command.deleteLocal) {
            queueOp(tx, command.outbox);
            if (row) {
              row = { ...row, dirty: true };
              tx.objectStore('books').put(row);
            }
          }
          if (synced && row && row.localRevision === synced.localRevision) {
            tx.objectStore('books').put({ ...row, dirty: false, syncedRevision: synced.syncedRevision });
          }
        },
      );
    },

    async getSyncState(ownerUid, bookId) {
      const row = await readRequest<{ bookId: string; state: string; updatedAt: string } | undefined>('sync_state', (store) =>
        store.get([ownerUid, bookId]),
      );
      return row ? { bookId: row.bookId, state: row.state, updatedAt: row.updatedAt } : null;
    },

    async listSyncStates(ownerUid) {
      const rows = await readRequest<{ bookId: string; state: string; updatedAt: string }[]>('sync_state', (store) =>
        store.index('by_owner').getAll(ownerUid),
      );
      return rows.map((row) => ({ bookId: row.bookId, state: row.state, updatedAt: row.updatedAt }));
    },

    async listOutbox(ownerUid) {
      const rows = await readRequest<{ seq: number }[]>('outbox', (store) => store.index('by_owner').getAll(ownerUid));
      return rows.sort((a, b) => a.seq - b.seq);
    },

    async listPreserved(ownerUid) {
      const rows = await readRequest<{ id: number }[]>('preserved', (store) => store.index('by_owner').getAll(ownerUid));
      return rows.sort((a, b) => b.id - a.id);
    },

    markSynced(ownerUid, bookId, localRevision, syncedRevision) {
      return compareAndSet(
        ['books'],
        ownerUid,
        bookId,
        (actual) => actual === localRevision,
        (tx, current) => {
          tx.objectStore('books').put({ ...current, dirty: false, syncedRevision });
        },
      );
    },

    listRevisions(ownerUid, bookId) {
      return readRequest<unknown[]>('revisions', (store) => store.getAll(bookRange(ownerUid, bookId)));
    },

    async getRevisionContent(ownerUid, bookId, revision) {
      const row = await readRequest<{ content?: unknown } | undefined>('contents', (store) => store.get([ownerUid, bookId, revision]));
      return row && typeof row.content === 'string' ? row.content : null;
    },

    listQuarantine(ownerUid, bookId) {
      return readRequest<unknown[]>('quarantine', (store) => store.index('by_owner_book').getAll([ownerUid, bookId]));
    },

    async close() {
      database?.close();
      database = null;
    },
  };
}
