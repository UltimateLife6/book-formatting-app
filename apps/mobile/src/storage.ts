import { LocalManuscriptStore } from '@folio-loom/local-storage';
import { createSqliteDriver, type SqlConnection, type SqlExecutor, type SqlValue } from '@folio-loom/local-storage/sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

/** One SQLite file per device install; rows are scoped by Firebase UID inside it. */
export const DATABASE_FILE = 'folio-loom-local.db';

type Queryable = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

function executor(db: Queryable): SqlExecutor {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    get: (sql, params: SqlValue[] = []) => db.getFirstAsync(sql, params),
    all: (sql, params: SqlValue[] = []) => db.getAllAsync(sql, params),
  };
}

async function connect(): Promise<SqlConnection> {
  const db = await openDatabaseAsync(DATABASE_FILE);
  return {
    ...executor(db),
    async transaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      // Runs on a dedicated connection: commits when the task resolves, rolls back when it throws.
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await task(executor(txn));
      });
      return result as T;
    },
    close: () => db.closeAsync(),
  };
}

let store: LocalManuscriptStore | null = null;

/** The app-wide store, opened lazily on first use. Status/errors are exposed via `getStatus()`. */
export function getLocalStore(): LocalManuscriptStore {
  store ??= new LocalManuscriptStore(createSqliteDriver(connect));
  return store;
}
