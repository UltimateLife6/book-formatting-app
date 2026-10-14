'use client';

import type { SyncEngine, SyncSnapshot } from '@folio-loom/cloud-sync';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSyncEngine } from '../../lib/cloud-sync';

const IDLE: SyncSnapshot = { running: false, paused: null, online: true, books: new Map() };
const noopSubscribe = () => () => {};
const idle = () => IDLE;

/** The account's sync engine (once local storage is ready) and its live status. */
export function useCloudSync(uid: string, storageReady: boolean): { engine: SyncEngine | null; sync: SyncSnapshot } {
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  useEffect(() => {
    if (storageReady) setEngine(getSyncEngine(uid));
  }, [uid, storageReady]);
  const sync = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : idle, idle);
  return { engine, sync };
}
