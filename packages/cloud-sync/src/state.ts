import type { SyncBase, SyncConflict } from '@folio-loom/sync';

export interface SyncFailure {
  code: string;
  message: string;
  /** Permanent failures wait for a manual retry; others back off and retry automatically. */
  permanent: boolean;
  attempts: number;
  nextAttemptAt: number | null;
}

/** A commit that was sent but not (yet) acknowledged: what it wrote, by hash. */
export interface PendingCommit {
  opId: string;
  structureHash: string | null;
  sections: Record<string, string | null>;
}

/** Per-book sync state, stored as JSON in the local `sync_state` table. */
export interface BookSyncState {
  v: 1;
  base: SyncBase | null;
  conflicts: SyncConflict[];
  pending: PendingCommit | null;
  /** The author chose to keep a book that was deleted on another device. */
  undelete: boolean;
  /** Cloud changes are waiting for the open editor to close. */
  remoteDeferred: boolean;
  lastSyncedAt: string | null;
  lastSnapshotAt: string | null;
  failure: SyncFailure | null;
}

export function initialSyncState(): BookSyncState {
  return {
    v: 1,
    base: null,
    conflicts: [],
    pending: null,
    undelete: false,
    remoteDeferred: false,
    lastSyncedAt: null,
    lastSnapshotAt: null,
    failure: null,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Damaged state is replaced by a fresh one (`corrupt: true`). That is safe: with no base, every
 * unit that differs from the cloud becomes a conflict rather than being overwritten.
 */
export function parseSyncState(json: string | null): { state: BookSyncState; corrupt: boolean } {
  if (json === null) return { state: initialSyncState(), corrupt: false };
  try {
    const raw: unknown = JSON.parse(json);
    if (!isObject(raw) || raw.v !== 1 || !Array.isArray(raw.conflicts)) throw new Error('shape');
    const base = raw.base;
    if (base !== null && !(isObject(base) && isObject(base.structure) && isObject(base.sections) && typeof base.headRevision === 'number')) {
      throw new Error('base');
    }
    return { state: { ...initialSyncState(), ...(raw as unknown as BookSyncState) }, corrupt: false };
  } catch {
    return { state: initialSyncState(), corrupt: true };
  }
}

export const serializeSyncState = (state: BookSyncState): string => JSON.stringify(state);
