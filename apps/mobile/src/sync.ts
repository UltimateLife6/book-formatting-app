import { RemoteBooks, SyncEngine, type SyncSnapshot } from '@folio-loom/cloud-sync';
import { createFirestoreDocStore } from '@folio-loom/cloud-sync/firestore';
import type { LocalManuscriptStore, UserLibrary } from '@folio-loom/local-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { getFirebaseAuth, getFirestoreDb } from './firebase';

const IDLE: SyncSnapshot = { running: false, paused: null, online: true, books: new Map() };
const noopSubscribe = () => () => {};
const idle = () => IDLE;

/**
 * The sync engine for this signed-in account. `SignedInApp` is keyed by UID, so an account change
 * unmounts this hook and stops the engine; the remote layer also refuses any request whose session
 * UID differs. There is no connectivity monitor on mobile yet: failed requests mark the app
 * offline, retries back off, and returning to the foreground syncs again.
 */
export function useMobileSync(uid: string, store: LocalManuscriptStore, library: UserLibrary): { engine: SyncEngine | null; sync: SyncSnapshot } {
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  useEffect(() => {
    let cancelled = false;
    let created: SyncEngine | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void created?.syncAll().catch(() => undefined);
    });
    void store.ready.then((status) => {
      if (cancelled || status.state.status !== 'ready') return;
      const auth = getFirebaseAuth();
      if (auth.currentUser?.uid !== uid) return;
      created = new SyncEngine({ store, library, remote: new RemoteBooks(createFirestoreDocStore(getFirestoreDb(), auth), uid) });
      created.start();
      setEngine(created);
    });
    return () => {
      cancelled = true;
      subscription.remove();
      void created?.stop();
    };
  }, [uid, store, library]);
  const sync = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : idle);
  return { engine, sync };
}
