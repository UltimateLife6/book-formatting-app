import { DatabaseSync } from 'node:sqlite';
import type { SqlConnection, SqlExecutor, SqlValue } from '../sqlite';

export interface NodeSqliteHooks {
  /** Called before every statement; throw to simulate a failure at that point. */
  beforeStatement?: (sql: string) => void;
}

/**
 * Test-only `SqlConnection` over Node's built-in SQLite. Mirrors expo-sqlite's exclusive
 * transactions: one transaction at a time, statements outside a transaction wait for it.
 */
export function nodeSqliteConnection(path: string, hooks: NodeSqliteHooks = {}): SqlConnection & { raw: DatabaseSync } {
  const raw = new DatabaseSync(path);
  let lock: Promise<void> = Promise.resolve();

  const executor: SqlExecutor = {
    async exec(sql) {
      hooks.beforeStatement?.(sql);
      raw.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      hooks.beforeStatement?.(sql);
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      hooks.beforeStatement?.(sql);
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      hooks.beforeStatement?.(sql);
      return raw.prepare(sql).all(...params) as T[];
    },
  };

  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = lock.then(task, task);
    lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    raw,
    exec: (sql) => exclusive(() => executor.exec(sql)),
    run: (sql, params) => exclusive(() => executor.run(sql, params)),
    get: (sql, params) => exclusive(() => executor.get(sql, params)),
    all: (sql, params) => exclusive(() => executor.all(sql, params)),
    transaction: (task) =>
      exclusive(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await task(executor);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          // Some errors (e.g. SQLITE_FULL) already rolled back; never mask the original error.
          if (raw.isTransaction) raw.exec('ROLLBACK');
          throw error;
        }
      }),
    close: async () => {
      if (raw.isOpen) raw.close();
    },
  };
}
