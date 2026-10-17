import type { SyncEngine, SyncSnapshot } from '@folio-loom/cloud-sync';
import type {
  LoadResult,
  LocalManuscriptRecord,
  LocalManuscriptStore,
  UserLibrary,
} from '@folio-loom/local-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from './LibraryScreen';
import { ManuscriptEditor } from './ManuscriptEditor';
import { colors } from './theme';

interface SyncProps {
  engine: SyncEngine | null;
  sync: SyncSnapshot;
  onNavigate: (screen: 'conflicts' | 'snapshots') => void;
}

export function EditorScreen({
  library,
  store,
  bookId,
  onClose,
  ...syncProps
}: { library: UserLibrary; store: LocalManuscriptStore; bookId: string; onClose: () => void } & SyncProps) {
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    library.load(bookId).then(
      (loaded) => !cancelled && setResult(loaded),
      (e: unknown) => !cancelled && setResult({ ok: false, reason: 'corrupt', message: e instanceof Error ? e.message : String(e), revisions: [] }),
    );
    return () => {
      cancelled = true;
    };
  }, [library, bookId]);

  useEffect(() => {
    if (!result || result.ok) return;
    return store.onChange((change) => {
      if (change.ownerUid === library.ownerUid && change.bookId === bookId) void library.load(bookId).then(setResult, () => undefined);
    });
  }, [store, result, library, bookId]);

  if (!result) {
    return (
      <View style={[styles.screen, styles.content]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (!result.ok) {
    return <RecoveryView library={library} bookId={bookId} result={result} onRestored={(record) => setResult({ ok: true, record, migratedFrom: null })} onClose={onClose} />;
  }
  return (
    <ManuscriptEditor
      key={`${result.record.bookId}:${result.record.localRevision}`}
      library={library}
      initial={result.record}
      onClose={onClose}
      {...syncProps}
    />
  );
}

function RecoveryView({
  library,
  bookId,
  result,
  onRestored,
  onClose,
}: {
  library: UserLibrary;
  bookId: string;
  result: Exclude<LoadResult, { ok: true }>;
  onRestored: (record: LocalManuscriptRecord) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const message =
    result.reason === 'not_found'
      ? 'This manuscript is not on this device for this account. If you created it on another device, it opens here once it has synced.'
      : result.message;
  const revisions = result.reason === 'corrupt' ? result.revisions : [];

  async function restore(revision: number) {
    try {
      onRestored(await library.restoreRevision(bookId, revision));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { gap: 12 }]}>
      <Pressable onPress={onClose} style={styles.secondaryButton} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Recovery needed</Text>
      <Text style={styles.error} accessibilityRole="alert">
        {message}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {revisions.map((revision) => (
        <Pressable key={revision.revision} onPress={() => restore(revision.revision)} style={styles.secondaryButton} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>
            Restore revision {revision.revision} ({revision.wordCount.toLocaleString()} words, {new Date(revision.savedAt).toLocaleString()})
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
