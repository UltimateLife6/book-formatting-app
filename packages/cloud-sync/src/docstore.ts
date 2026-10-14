export type DocData = Record<string, unknown>;

/** Write-side placeholder for the server's commit time (Firestore `serverTimestamp()`). */
export const SERVER_TIME = Object.freeze({ __serverTime: true });

export interface DocTx {
  get(path: string): Promise<DocData | null>;
  set(path: string, data: DocData): void;
  delete(path: string): void;
}

export type BatchWrite = { type: 'set'; path: string; data: DocData } | { type: 'delete'; path: string };

/**
 * The few document operations sync needs. Implementations must:
 * - read from the server, never a local cache (`get`, `list`, transaction reads);
 * - resolve `transaction`/`batch` only after the server committed, and commit atomically;
 * - return timestamps as ISO strings;
 * - reject with `RemoteError` (or let `StaleCommitError` from the body through).
 */
export interface DocStore {
  get(path: string): Promise<DocData | null>;
  list(collectionPath: string): Promise<{ id: string; data: DocData }[]>;
  transaction<T>(body: (tx: DocTx) => Promise<T>): Promise<T>;
  batch(writes: BatchWrite[]): Promise<void>;
  /** UID of the account the SDK is currently authenticated as. */
  currentUid(): string | null;
}
