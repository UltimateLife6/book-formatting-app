import type { CompareAndSetOutcome, DriverOpenResult, StorageDriver, WriteBookCommand } from './driver';
import { StorageError, toStorageError } from './errors';
import type { StorageState } from './types';

export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

/**
 * Minimal connection the driver needs. The Expo app adapts `expo-sqlite`'s `SQLiteDatabase`
 * (`withExclusiveTransactionAsync` for `transaction`); tests adapt Node's built-in `node:sqlite`.
 */
export interface SqlConnection extends SqlExecutor {
  /** One exclusive transaction: commit when `task` resolves, roll back when it throws. */
  transaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface SqliteMigration {
  /** Target `PRAGMA user_version`; migrations must be numbered 1, 2, 3… with no gaps. */
  version: number;
  description: string;
  up(tx: SqlExecutor): Promise<void>;
}

/**
 * Append-only. Never edit a released migration and never drop data in one: add a new version
 * that copies data forward. There is deliberately no "recreate the database" fallback.
 */
export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = [
  {
    version: 1,
    description: 'books, revisions (with content), quarantine',
    async up(tx) {
      await tx.exec(`
        CREATE TABLE books (
          owner_uid TEXT NOT NULL,
          book_id TEXT NOT NULL,
          title TEXT NOT NULL,
          word_count INTEGER NOT NULL,
          schema_version INTEGER NOT NULL,
          local_revision INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          dirty INTEGER NOT NULL,
          synced_revision INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_uid, book_id)
        );
        CREATE INDEX books_by_owner_updated ON books (owner_uid, updated_at DESC);
        CREATE TABLE revisions (
          owner_uid TEXT NOT NULL,
          book_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          schema_version INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          word_count INTEGER NOT NULL,
          reason TEXT NOT NULL,
          saved_at TEXT NOT NULL,
          content TEXT NOT NULL,
          PRIMARY KEY (owner_uid, book_id, revision)
        );
        CREATE TABLE quarantine (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_uid TEXT NOT NULL,
          book_id TEXT NOT NULL,
          revision INTEGER,
          reason TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          content TEXT
        );
        CREATE INDEX quarantine_by_owner_book ON quarantine (owner_uid, book_id);
      `);
    },
  },
];

export interface SqliteDriverOptions {
  migrations?: readonly SqliteMigration[];
}

interface BookSqlRow {
  owner_uid: unknown;
  book_id: unknown;
  title: unknown;
  word_count: unknown;
  schema_version: unknown;
  local_revision: unknown;
  checksum: unknown;
  dirty: unknown;
  synced_revision: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const BOOK_COLUMNS =
  'owner_uid, book_id, title, word_count, schema_version, local_revision, checksum, dirty, synced_revision, created_at, updated_at';

function toBool(value: unknown): unknown {
  if (value === 1) return true;
  if (value === 0) return false;
  return value;
}

function bookFromSql(row: BookSqlRow) {
  return {
    ownerUid: row.owner_uid,
    bookId: row.book_id,
    title: row.title,
    wordCount: row.word_count,
    schemaVersion: row.schema_version,
    localRevision: row.local_revision,
    checksum: row.checksum,
    dirty: toBool(row.dirty),
    syncedRevision: row.synced_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function checkMigrations(migrations: readonly SqliteMigration[]) {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error(`SQLite migrations must be numbered 1..n; found ${migration.version} at ${index}.`);
  });
}

export function createSqliteDriver(connect: () => Promise<SqlConnection>, options: SqliteDriverOptions = {}): StorageDriver {
  const migrations = options.migrations ?? SQLITE_MIGRATIONS;
  checkMigrations(migrations);
  const latest = migrations.length;
  let connection: SqlConnection | null = null;

  const db = (): SqlConnection => {
    if (!connection) throw new StorageError('closed');
    return connection;
  };

  async function revisionOf(tx: SqlExecutor, ownerUid: string, bookId: string): Promise<unknown> {
    const row = await tx.get<{ local_revision: unknown }>('SELECT local_revision FROM books WHERE owner_uid = ? AND book_id = ?', [
      ownerUid,
      bookId,
    ]);
    return row ? row.local_revision : undefined;
  }

  const stale = (actual: unknown): CompareAndSetOutcome => ({
    ok: false,
    reason: 'stale_revision',
    actualRevision: typeof actual === 'number' ? actual : null,
  });

  return {
    backend: 'sqlite',

    async open(_report?: (state: StorageState) => void): Promise<DriverOpenResult> {
      try {
        connection = await connect();
      } catch (error) {
        return { ok: false, version: null, state: { status: 'unavailable', message: toStorageError(error, 'unavailable').message } };
      }
      const conn = connection;
      let current: number;
      try {
        // WAL keeps readers working during writes; FULL fsyncs each commit, favouring durability over speed.
        await conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
        const row = await conn.get<{ user_version: number }>('PRAGMA user_version');
        current = row?.user_version ?? 0;
      } catch (error) {
        return { ok: false, version: null, state: { status: 'unavailable', message: toStorageError(error, 'unavailable').message } };
      }
      if (current > latest) {
        return {
          ok: false,
          version: current,
          state: {
            status: 'unsupported_version',
            found: current,
            supported: latest,
            message: `This device's manuscript database (v${current}) was created by a newer version of Folio Loom (this version supports v${latest}). Update the app; nothing was changed.`,
          },
        };
      }
      for (const migration of migrations.slice(current)) {
        try {
          await conn.transaction(async (tx) => {
            await migration.up(tx);
            await tx.exec(`PRAGMA user_version = ${migration.version}`);
          });
          current = migration.version;
        } catch (error) {
          return {
            ok: false,
            version: current,
            state: {
              status: 'migration_failed',
              message: `Upgrading the manuscript database to v${migration.version} failed and was rolled back; your manuscripts are unchanged. (${toStorageError(error).detail ?? 'unknown error'})`,
            },
          };
        }
      }
      return { ok: true, version: current };
    },

    async listBooks(ownerUid) {
      const rows = await db().all<BookSqlRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE owner_uid = ? ORDER BY updated_at DESC`, [ownerUid]);
      return rows.map(bookFromSql);
    },

    async getBook(ownerUid, bookId) {
      const row = await db().get<BookSqlRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE owner_uid = ? AND book_id = ?`, [ownerUid, bookId]);
      return row ? bookFromSql(row) : null;
    },

    async writeBook(command: WriteBookCommand) {
      const { book, revision } = command;
      return db().transaction(async (tx) => {
        const actual = await revisionOf(tx, book.ownerUid, book.bookId);
        if (command.expectedRevision === null ? actual !== undefined : actual !== command.expectedRevision) return stale(actual);

        const values: SqlValue[] = [
          book.title,
          book.wordCount,
          book.schemaVersion,
          book.localRevision,
          book.checksum,
          book.dirty ? 1 : 0,
          book.syncedRevision,
          book.updatedAt,
        ];
        if (command.expectedRevision === null) {
          await tx.run(
            'INSERT INTO books (title, word_count, schema_version, local_revision, checksum, dirty, synced_revision, updated_at, created_at, owner_uid, book_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [...values, book.createdAt, book.ownerUid, book.bookId],
          );
        } else {
          const { changes } = await tx.run(
            'UPDATE books SET title = ?, word_count = ?, schema_version = ?, local_revision = ?, checksum = ?, dirty = ?, synced_revision = ?, updated_at = ?, created_at = ? WHERE owner_uid = ? AND book_id = ? AND local_revision = ?',
            [...values, book.createdAt, book.ownerUid, book.bookId, command.expectedRevision],
          );
          if (changes !== 1) throw new StorageError('write_failed', { detail: 'compare-and-set update matched no row' });
        }
        // Plain INSERT: an existing row for this revision is an error that rolls everything back.
        await tx.run(
          'INSERT INTO revisions (owner_uid, book_id, revision, schema_version, checksum, word_count, reason, saved_at, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            revision.ownerUid,
            revision.bookId,
            revision.revision,
            revision.schemaVersion,
            revision.checksum,
            revision.wordCount,
            revision.reason,
            revision.savedAt,
            command.content,
          ],
        );
        await tx.run('DELETE FROM revisions WHERE owner_uid = ? AND book_id = ? AND revision <= ?', [
          book.ownerUid,
          book.bookId,
          book.localRevision - command.keepRevisions,
        ]);
        if (command.quarantine) {
          const q = command.quarantine;
          await tx.run('INSERT INTO quarantine (owner_uid, book_id, revision, reason, captured_at, content) VALUES (?, ?, ?, ?, ?, ?)', [
            q.ownerUid,
            q.bookId,
            q.revision,
            q.reason,
            q.capturedAt,
            q.content,
          ]);
        }
        return { ok: true } as const;
      });
    },

    async deleteBook(ownerUid, bookId, expectedRevision) {
      return db().transaction(async (tx) => {
        const actual = await revisionOf(tx, ownerUid, bookId);
        if (actual !== expectedRevision) return stale(actual);
        const params = [ownerUid, bookId];
        await tx.run('DELETE FROM revisions WHERE owner_uid = ? AND book_id = ?', params);
        await tx.run('DELETE FROM quarantine WHERE owner_uid = ? AND book_id = ?', params);
        await tx.run('DELETE FROM books WHERE owner_uid = ? AND book_id = ?', params);
        return { ok: true } as const;
      });
    },

    async markSynced(ownerUid, bookId, localRevision, syncedRevision) {
      return db().transaction(async (tx) => {
        const actual = await revisionOf(tx, ownerUid, bookId);
        if (actual !== localRevision) return stale(actual);
        await tx.run('UPDATE books SET dirty = 0, synced_revision = ? WHERE owner_uid = ? AND book_id = ?', [syncedRevision, ownerUid, bookId]);
        return { ok: true } as const;
      });
    },

    async listRevisions(ownerUid, bookId) {
      const rows = await db().all<Record<string, unknown>>(
        'SELECT owner_uid, book_id, revision, schema_version, checksum, word_count, reason, saved_at FROM revisions WHERE owner_uid = ? AND book_id = ? ORDER BY revision DESC',
        [ownerUid, bookId],
      );
      return rows.map((row) => ({
        ownerUid: row.owner_uid,
        bookId: row.book_id,
        revision: row.revision,
        schemaVersion: row.schema_version,
        checksum: row.checksum,
        wordCount: row.word_count,
        reason: row.reason,
        savedAt: row.saved_at,
      }));
    },

    async getRevisionContent(ownerUid, bookId, revision) {
      const row = await db().get<{ content: unknown }>('SELECT content FROM revisions WHERE owner_uid = ? AND book_id = ? AND revision = ?', [
        ownerUid,
        bookId,
        revision,
      ]);
      return row && typeof row.content === 'string' ? row.content : null;
    },

    async listQuarantine(ownerUid, bookId) {
      const rows = await db().all<Record<string, unknown>>(
        'SELECT id, book_id, revision, reason, captured_at, content FROM quarantine WHERE owner_uid = ? AND book_id = ? ORDER BY id',
        [ownerUid, bookId],
      );
      return rows.map((row) => ({
        id: row.id,
        bookId: row.book_id,
        revision: row.revision,
        reason: row.reason,
        capturedAt: row.captured_at,
        content: row.content,
      }));
    },

    async close() {
      const conn = connection;
      connection = null;
      if (conn) await conn.close();
    },
  };
}
