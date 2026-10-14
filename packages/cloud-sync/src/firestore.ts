import {
  collection,
  type DocumentData,
  doc,
  type Firestore,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { type BatchWrite, type DocData, type DocStore, SERVER_TIME } from './docstore';
import { RemoteError, toRemoteError } from './errors';

const isServerTime = (value: unknown) => value === SERVER_TIME || (typeof value === 'object' && value !== null && (value as { __serverTime?: unknown }).__serverTime === true);

function toWire(data: DocData): DocumentData {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data)) out[key] = isServerTime(value) ? serverTimestamp() : value;
  return out;
}

function fromWire(data: DocumentData): DocData {
  const out: DocData = {};
  for (const [key, value] of Object.entries(data)) out[key] = value instanceof Timestamp ? value.toDate().toISOString() : value;
  return out;
}

export interface FirestoreDocStoreOptions {
  /**
   * Upper bound for one transaction or batch. On timeout the call fails as retryable; if the
   * commit lands later anyway, the engine recognises it by content and does not repeat it.
   */
  timeoutMs?: number;
}

/**
 * `DocStore` over the Firestore web SDK (also used by React Native). Use it with an in-memory
 * cache (`memoryLocalCache()`): reads always go to the server and writes are only reported once
 * the server has committed them, so "synced" never means "written to a local cache".
 */
export function createFirestoreDocStore(db: Firestore, auth: { currentUser: { uid: string } | null }, options: FirestoreDocStoreOptions = {}): DocStore {
  const timeoutMs = options.timeoutMs ?? 60_000;

  async function guarded<T>(task: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RemoteError('deadline-exceeded', { detail: `no server response within ${timeoutMs} ms` })), timeoutMs);
    });
    try {
      return await Promise.race([task(), timeout]);
    } catch (error) {
      throw toRemoteError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    currentUid: () => auth.currentUser?.uid ?? null,

    get(path) {
      return guarded(async () => {
        const snapshot = await getDocFromServer(doc(db, path));
        return snapshot.exists() ? fromWire(snapshot.data()) : null;
      });
    },

    list(collectionPath) {
      return guarded(async () => {
        const snapshot = await getDocsFromServer(collection(db, collectionPath));
        return snapshot.docs.map((entry) => ({ id: entry.id, data: fromWire(entry.data()) }));
      });
    },

    transaction(body) {
      return guarded(() =>
        runTransaction(
          db,
          (tx) =>
            body({
              async get(path) {
                const snapshot = await tx.get(doc(db, path));
                return snapshot.exists() ? fromWire(snapshot.data()) : null;
              },
              set(path, data) {
                tx.set(doc(db, path), toWire(data));
              },
              delete(path) {
                tx.delete(doc(db, path));
              },
            }),
          { maxAttempts: 5 },
        ),
      );
    },

    batch(writes: BatchWrite[]) {
      return guarded(async () => {
        const batch = writeBatch(db);
        for (const write of writes) {
          if (write.type === 'set') batch.set(doc(db, write.path), toWire(write.data));
          else batch.delete(doc(db, write.path));
        }
        await batch.commit();
      });
    },
  };
}
