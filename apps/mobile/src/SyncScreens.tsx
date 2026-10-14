import {
  type BookSyncStatus,
  CONFLICT_EXPLANATION,
  ConflictResolutionError,
  type ConflictView,
  conflictOptions,
  conflictSides,
  type SnapshotMeta,
  SYNC_STATUS_LABEL,
  type SyncEngine,
  type SyncSnapshot,
  type SyncStatusKind,
} from '@folio-loom/cloud-sync';
import type { ConflictChoice } from '@folio-loom/sync';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles } from './LibraryScreen';
import { colors } from './theme';

const PRIORITY: SyncStatusKind[] = ['conflict', 'failed', 'offline', 'syncing', 'waiting', 'savedLocally', 'synced'];

function overall(sync: SyncSnapshot): { kind: SyncStatusKind; message: string | null } {
  if (sync.paused === 'signedOut') return { kind: 'savedLocally', message: 'Sign in to sync.' };
  if (sync.paused === 'wrongAccount') return { kind: 'failed', message: 'Sync stopped: a different account is signed in.' };
  if (!sync.online) return { kind: 'offline', message: 'Changes are saved on this device and will sync when you’re back online.' };
  const kinds = new Set([...sync.books.values()].map((book) => book.kind));
  return { kind: PRIORITY.find((candidate) => kinds.has(candidate)) ?? 'synced', message: null };
}

export function SyncBadge({ status }: { status: BookSyncStatus | undefined }) {
  const kind = status?.kind ?? 'savedLocally';
  const alert = kind === 'conflict' || kind === 'failed';
  return (
    <Text style={[syncStyles.badge, kind === 'synced' && syncStyles.synced, alert && syncStyles.alert]} accessibilityLabel={`Sync status: ${SYNC_STATUS_LABEL[kind]}`}>
      {SYNC_STATUS_LABEL[kind]}
    </Text>
  );
}

export function SyncBar({ engine, sync }: { engine: SyncEngine | null; sync: SyncSnapshot }) {
  const [busy, setBusy] = useState(false);
  const { kind, message } = overall(sync);
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
    <View style={syncStyles.bar} accessibilityLiveRegion="polite">
      <Text style={[styles.muted, { flex: 1 }]}>
        Cloud sync: <Text style={{ fontWeight: '600', color: colors.ink }}>{engine ? SYNC_STATUS_LABEL[kind] : 'Starting…'}</Text>
        {message ? ` · ${message}` : ''}
      </Text>
      <Pressable onPress={syncNow} disabled={!engine || busy || sync.paused !== null} style={[styles.secondaryButton, (!engine || busy) && styles.disabled]} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>{busy ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>
    </View>
  );
}

export function ConflictsScreen({ engine, sync, bookId, onClose }: { engine: SyncEngine | null; sync: SyncSnapshot; bookId: string; onClose: () => void }) {
  const [views, setViews] = useState<ConflictView[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!engine) return;
    try {
      setViews(await engine.getConflicts(bookId));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, [engine, bookId]);

  // Re-read whenever this book's sync status changes, so edits that arrive while the screen is open appear.
  useEffect(() => {
    void load();
    if (!engine) return;
    let last = engine.getSnapshot().books.get(bookId);
    return engine.subscribe(() => {
      const next = engine.getSnapshot().books.get(bookId);
      if (next === last) return;
      last = next;
      void load();
    });
  }, [engine, bookId, load]);

  async function choose(view: ConflictView, choice: ConflictChoice) {
    if (!engine) return;
    setBusy(true);
    setNotice(null);
    try {
      await engine.resolveConflict(bookId, view.conflict.id, choice, view.expected);
    } catch (e) {
      setNotice(
        e instanceof ConflictResolutionError && (e.reason === 'changed' || e.reason === 'not_found')
          ? 'This conflict changed while you were looking at it. The latest versions are shown; please choose again.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
      await load();
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { gap: 12 }]}>
      <Pressable onPress={onClose} style={styles.secondaryButton} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Resolve sync conflicts</Text>
      <Text style={styles.muted}>Both versions are kept until you choose. Whatever you replace is saved under “Recovered copies”.</Text>
      <SyncBar engine={engine} sync={sync} />
      {notice ? (
        <Text style={styles.error} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      {!views ? <ActivityIndicator color={colors.ink} /> : null}
      {views?.length === 0 ? <Text style={styles.muted}>No conflicts. This manuscript is up to date with your other devices.</Text> : null}
      {views?.map((view) => {
        const sides = conflictSides(view);
        return (
          <View key={view.conflict.id} style={syncStyles.card}>
            <Text style={styles.rowTitle}>{view.conflict.title || 'Untitled section'}</Text>
            <Text style={styles.muted}>{CONFLICT_EXPLANATION[view.conflict.kind]}</Text>
            {[sides.mine, sides.theirs].map((side) => (
              <View key={side.label} style={{ gap: 4 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{side.label}</Text>
                <ScrollView style={syncStyles.text} nestedScrollEnabled>
                  <Text selectable style={{ color: colors.ink }}>
                    {side.text}
                  </Text>
                </ScrollView>
              </View>
            ))}
            {conflictOptions(view.conflict.kind).map((option) => (
              <View key={option.choice} style={{ gap: 2 }}>
                <Pressable
                  onPress={() => choose(view, option.choice)}
                  disabled={busy}
                  style={[option.choice === 'both' ? styles.primaryButton : styles.secondaryButton, busy && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityHint={option.hint}
                >
                  <Text style={option.choice === 'both' ? styles.primaryButtonText : styles.secondaryButtonText}>{option.label}</Text>
                </Pressable>
                <Text style={styles.muted}>{option.hint}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const REASON_LABEL: Record<SnapshotMeta['reason'], string> = {
  initialUpload: 'First upload',
  periodic: 'Automatic',
  manual: 'Taken by you',
  beforeRestore: 'Before a restore',
  beforeConflictResolution: 'Before resolving a conflict',
  beforeImport: 'Before an import',
};

export function SnapshotsScreen({ engine, sync, bookId, onClose }: { engine: SyncEngine | null; sync: SyncSnapshot; bookId: string; onClose: () => void }) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!engine) return;
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
    if (!engine) return;
    const when = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'this snapshot';
    Alert.alert('Restore snapshot?', `Restore “${snapshot.title}” from ${when}? Your current version is kept as a snapshot and a recovered copy.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: () => void run(() => engine.restoreSnapshot(bookId, snapshot.id), 'Snapshot restored. It will sync to your other devices.') },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { gap: 12 }]}>
      <Pressable onPress={onClose} style={styles.secondaryButton} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Snapshots</Text>
      <Text style={styles.muted}>Cloud copies of the whole manuscript. Restoring one first saves the current version.</Text>
      <SyncBar engine={engine} sync={sync} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
      <Pressable
        onPress={() => engine && run(() => engine.createSnapshot(bookId), 'Snapshot saved.')}
        disabled={!engine || busy}
        style={[styles.primaryButton, (!engine || busy) && styles.disabled]}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Take snapshot now</Text>
      </Pressable>
      {snapshots === null && !error ? <ActivityIndicator color={colors.ink} /> : null}
      {snapshots?.length === 0 ? <Text style={styles.muted}>No snapshots yet. One is taken when the manuscript first syncs.</Text> : null}
      {snapshots?.map((snapshot) => (
        <View key={snapshot.id} style={styles.bookRow}>
          <View style={styles.bookMain}>
            <Text style={styles.rowTitle}>{snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Saving…'}</Text>
            <Text style={styles.muted}>
              {REASON_LABEL[snapshot.reason]} · {snapshot.wordCount.toLocaleString()} words · {snapshot.sectionCount} sections
            </Text>
          </View>
          <Pressable onPress={() => restore(snapshot)} disabled={busy} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Restore this snapshot">
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Restore</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const syncStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: '#fff' },
  badge: { fontSize: 12, color: colors.muted, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  synced: { color: '#1d6b3a', borderColor: '#1d6b3a' },
  alert: { color: colors.error, borderColor: colors.error, fontWeight: '600' },
  card: { gap: 10, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: '#fff' },
  text: { maxHeight: 220, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, backgroundColor: colors.paper },
});
