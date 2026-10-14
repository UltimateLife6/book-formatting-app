import { createBrowserNetworkMonitor, RemoteBooks, SyncEngine } from '@folio-loom/cloud-sync';
import { createFirestoreDocStore } from '@folio-loom/cloud-sync/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from './firebase-client';
import { getLocalStore } from './local-store';

let current: { engine: SyncEngine; unsubscribe: () => void } | null = null;

/**
 * The sync engine for the signed-in account, shared across pages. It stops as soon as that
 * account signs out or another account signs in, and the remote layer independently refuses any
 * request whose session UID differs, so nothing is ever uploaded under the wrong account.
 * Call only once local storage is ready.
 */
export function getSyncEngine(uid: string): SyncEngine | null {
  if (typeof window === 'undefined') return null;
  if (current?.engine.uid === uid) return current.engine;
  stopSync();
  const store = getLocalStore();
  const auth = getFirebaseAuth();
  if (!store || auth.currentUser?.uid !== uid) return null;
  const remote = new RemoteBooks(createFirestoreDocStore(getFirestoreDb(), auth), uid);
  const engine = new SyncEngine({ store, library: store.forUser(uid), remote, network: createBrowserNetworkMonitor() });
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user?.uid !== uid && current?.engine === engine) stopSync();
  });
  current = { engine, unsubscribe };
  engine.start();
  return engine;
}

export function stopSync() {
  if (!current) return;
  current.unsubscribe();
  void current.engine.stop();
  current = null;
}
