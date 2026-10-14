'use client';

import type { LocalManuscriptStore, StorageStatus, UserLibrary } from '@folio-loom/local-storage';
import { useMemo, useSyncExternalStore } from 'react';
import { getLocalStore } from '../../lib/local-store';

const OPENING: StorageStatus = { backend: 'indexeddb', databaseVersion: null, state: { status: 'opening' }, lastError: null };
const noopSubscribe = () => () => {};
const opening = () => OPENING;

/** The signed-in user's local library. Only call below `RequireAuth` (client-only). */
export function useLocalLibrary(uid: string): { store: LocalManuscriptStore | null; library: UserLibrary | null; status: StorageStatus } {
  const store = useMemo(() => getLocalStore(), []);
  const library = useMemo(() => store?.forUser(uid) ?? null, [store, uid]);
  const status = useSyncExternalStore(store ? store.subscribe : noopSubscribe, store ? store.getStatus : opening, opening);
  return { store, library, status };
}

export function storageProblem(status: StorageStatus): string | null {
  return status.state.status === 'ready' || status.state.status === 'opening' ? null : status.state.message;
}
