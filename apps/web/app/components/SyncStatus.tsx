'use client';

import { type BookSyncStatus, SYNC_STATUS_LABEL, type SyncEngine, type SyncSnapshot, type SyncStatusKind } from '@folio-loom/cloud-sync';
import { useState } from 'react';

const PRIORITY: SyncStatusKind[] = ['conflict', 'failed', 'offline', 'syncing', 'waiting', 'savedLocally', 'synced'];

/** One status for the whole account: the most urgent book status wins. */
export function overallStatus(sync: SyncSnapshot): { kind: SyncStatusKind; message: string | null } {
  if (sync.paused === 'signedOut') return { kind: 'savedLocally', message: 'Sign in to sync.' };
  if (sync.paused === 'wrongAccount') return { kind: 'failed', message: 'Sync stopped: a different account is signed in.' };
  if (!sync.online) return { kind: 'offline', message: 'Your changes are saved on this device and will sync when you’re back online.' };
  const kinds = new Set([...sync.books.values()].map((book) => book.kind));
  const kind = PRIORITY.find((candidate) => kinds.has(candidate)) ?? 'synced';
  return { kind, message: null };
}

export function SyncBadge({ status }: { status: BookSyncStatus | undefined }) {
  const kind = status?.kind ?? 'savedLocally';
  return (
    <span className={`sync-badge sync-${kind}`} data-sync-status={kind} title={status?.message ?? undefined}>
      {SYNC_STATUS_LABEL[kind]}
    </span>
  );
}

export function SyncBar({ engine, sync }: { engine: SyncEngine | null; sync: SyncSnapshot }) {
  const [busy, setBusy] = useState(false);
  const { kind, message } = overallStatus(sync);

  async function syncNow() {
    if (!engine) return;
    setBusy(true);
    try {
      await engine.syncAll({ force: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sync-bar" role="status" aria-live="polite">
      <span>
        Cloud sync: <strong data-sync-overall={kind}>{engine ? SYNC_STATUS_LABEL[kind] : 'Starting…'}</strong>
        {message ? <span className="muted"> · {message}</span> : null}
      </span>
      <button type="button" className="secondary" onClick={syncNow} disabled={!engine || busy || sync.paused !== null} aria-busy={busy}>
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
    </div>
  );
}
