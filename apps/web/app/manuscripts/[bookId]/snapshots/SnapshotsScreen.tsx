'use client';

import type { AuthUser } from '@folio-loom/auth';
import type { SnapshotMeta, SyncEngine } from '@folio-loom/cloud-sync';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '../../../components/RequireAuth';
import { SignedInHeader } from '../../../components/SignedInHeader';
import { SyncBar } from '../../../components/SyncStatus';
import { useCloudSync } from '../../../components/useCloudSync';
import { storageProblem, useLocalLibrary } from '../../../components/useLocalLibrary';

const REASON_LABEL: Record<SnapshotMeta['reason'], string> = {
  initialUpload: 'First upload',
  periodic: 'Automatic',
  manual: 'Taken by you',
  beforeRestore: 'Before a restore',
  beforeConflictResolution: 'Before resolving a conflict',
  beforeImport: 'Before an import',
};

function Snapshots({ user, bookId }: { user: AuthUser; bookId: string }) {
  const { status } = useLocalLibrary(user.uid);
  const ready = status.state.status === 'ready';
  const { engine, sync } = useCloudSync(user.uid, ready);
  const problem = storageProblem(status);
  const back = `/manuscripts/${encodeURIComponent(bookId)}`;
  return (
    <main>
      <SignedInHeader user={user} />
      <p>
        <Link href={back}>← Back to manuscript</Link> · <Link href="/projects">All manuscripts</Link>
      </p>
      <h1>Snapshots</h1>
      <p className="muted">
        Cloud copies of the whole manuscript. Restoring one first saves the current version as a new snapshot and as a recovered copy on this device.
      </p>
      <SyncBar engine={engine} sync={sync} />
      {problem ? (
        <p className="notice error" role="alert">
          {problem}
        </p>
      ) : null}
      {engine ? <SnapshotList engine={engine} bookId={bookId} /> : null}
    </main>
  );
}

function SnapshotList({ engine, bookId }: { engine: SyncEngine; bookId: string }) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSnapshots(await engine.listSnapshots(bookId));
      setError(null);
    } catch (e) {
      setError(`Snapshots are stored in the cloud and couldn’t be loaded: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [engine, bookId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await load();
    }
  }

  function restore(snapshot: SnapshotMeta) {
    const when = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'this snapshot';
    if (!window.confirm(`Restore “${snapshot.title}” from ${when}? Your current version is kept as a snapshot and a recovered copy.`)) return;
    void run(() => engine.restoreSnapshot(bookId, snapshot.id), 'Snapshot restored. It will sync to your other devices.');
  }

  return (
    <>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="actions">
        <button type="button" onClick={() => run(() => engine.createSnapshot(bookId), 'Snapshot saved.')} disabled={busy} aria-busy={busy}>
          Take snapshot now
        </button>
      </div>
      {snapshots === null && !error ? (
        <p className="muted" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Loading snapshots…
        </p>
      ) : null}
      {snapshots?.length === 0 ? <p className="muted">No snapshots yet. One is taken when the manuscript first syncs.</p> : null}
      {snapshots && snapshots.length > 0 ? (
        <ul className="outline library">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id}>
              <span>
                <strong>{snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Saving…'}</strong>
                <span className="muted-line">
                  {REASON_LABEL[snapshot.reason]} · “{snapshot.title}” · {snapshot.wordCount.toLocaleString()} words · {snapshot.sectionCount} sections
                </span>
              </span>
              <button type="button" className="secondary" onClick={() => restore(snapshot)} disabled={busy}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function SnapshotsScreen({ bookId }: { bookId: string }) {
  return <RequireAuth>{(user) => <Snapshots key={user.uid} user={user} bookId={bookId} />}</RequireAuth>;
}
