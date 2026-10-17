import type { AuthService, AuthUser } from '@folio-loom/auth';
import type { SyncEngine, SyncSnapshot } from '@folio-loom/cloud-sync';
import type { LocalManuscriptStore, ManuscriptSummary, PreservedCopy, UserLibrary } from '@folio-loom/local-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { pickAndImportManuscript } from './importManuscript';
import { SyncBadge, SyncBar } from './SyncScreens';
import { colors } from './theme';

export function storageProblem(store: LocalManuscriptStore): string | null {
  const { state } = store.getStatus();
  return state.status === 'ready' || state.status === 'opening' ? null : state.message;
}

export function LibraryScreen({
  user,
  service,
  store,
  library,
  engine,
  sync,
  onOpen,
  onNavigate,
}: {
  user: AuthUser;
  service: AuthService;
  store: LocalManuscriptStore;
  library: UserLibrary;
  engine: SyncEngine | null;
  sync: SyncSnapshot;
  onOpen: (bookId: string) => void;
  onNavigate: (screen: 'conflicts' | 'snapshots', bookId: string) => void;
}) {
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  const [books, setBooks] = useState<ManuscriptSummary[] | null>(null);
  const [recovered, setRecovered] = useState<PreservedCopy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [list, preserved] = await Promise.all([library.list(), library.listPreserved()]);
      setBooks(list);
      setRecovered(preserved);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [library]);

  useEffect(() => {
    if (status.state.status !== 'ready') return;
    void refresh();
    // Books downloaded, merged or deleted by sync appear without leaving the screen.
    return store.onChange((change) => {
      if (change.ownerUid === user.uid) void refresh();
    });
  }, [status.state.status, refresh, store, user.uid]);

  async function create() {
    setBusy(true);
    try {
      const record = await library.create();
      onOpen(record.bookId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    setBusy(true);
    setError(null);
    try {
      const { bookId, report } = await pickAndImportManuscript(library);
      if (!report.preservation.ok) {
        Alert.alert(
          'Import needs review',
          `Text preservation check failed (source ${report.preservation.sourceWordCount} vs ${report.preservation.resultWordCount} words). The manuscript was saved so you can review it.`,
        );
      } else if (report.needsReview || report.warnings.length > 0) {
        Alert.alert('Imported', `${report.chapterCount} chapters. ${report.warnings.map((w) => w.message).join(' ') || 'Open to review chapters.'}`);
      }
      onOpen(bookId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== 'Import cancelled.') setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(book: ManuscriptSummary) {
    try {
      const request = await library.requestDelete(book.bookId);
      Alert.alert('Delete manuscript?', `"${request.title}" is removed from this device now, and from the cloud and your other devices when it syncs.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            library
              .confirmDelete(request.token)
              .then(refresh)
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
          },
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function recover(copy: PreservedCopy) {
    try {
      const record = await library.restorePreserved(copy.id);
      onOpen(record.bookId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function signOut() {
    setBusy(true);
    const result = await service.signOut();
    setBusy(false);
    if (!result.ok) setError(result.error.message);
  }

  const problem = storageProblem(store);
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={(books ?? []).filter((book) => !query.trim() || book.title.toLowerCase().includes(query.trim().toLowerCase()))}
      keyExtractor={(book) => book.bookId}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.row}>
            <Text style={styles.tag} numberOfLines={1}>
              Signed in as {user.email ?? 'your account'}
            </Text>
            <Pressable onPress={signOut} disabled={busy} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>Your manuscripts</Text>
          <Text style={styles.muted}>Saved on this device first, then synced to your account.</Text>
          <SyncBar engine={engine} sync={sync} />
          {problem ? (
            <Text style={styles.error} accessibilityRole="alert">
              {problem}
            </Text>
          ) : null}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={create}
            disabled={busy || status.state.status !== 'ready'}
            style={[styles.primaryButton, (busy || status.state.status !== 'ready') && styles.disabled]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>New blank manuscript</Text>
          </Pressable>
          <Pressable
            onPress={importFile}
            disabled={busy || status.state.status !== 'ready'}
            style={[styles.secondaryButton, (busy || status.state.status !== 'ready') && styles.disabled]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{busy ? 'Working…' : 'Import DOCX or TXT'}</Text>
          </Pressable>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by title"
            placeholderTextColor={colors.muted}
            style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, color: colors.ink, backgroundColor: '#fff' }}
            accessibilityLabel="Search manuscripts"
          />
          {status.state.status === 'opening' || (status.state.status === 'ready' && books === null) ? (
            <ActivityIndicator color={colors.ink} />
          ) : null}
          {books?.length === 0 ? <Text style={styles.muted}>No manuscripts yet.</Text> : null}
        </View>
      }
      renderItem={({ item }) => {
        const bookSync = sync.books.get(item.bookId);
        return (
          <View style={styles.bookRow}>
            <Pressable style={styles.bookMain} onPress={() => onOpen(item.bookId)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.muted}>
                {item.health === 'unreadable' ? 'Needs recovery' : `${item.wordCount.toLocaleString()} words`} · edited{' '}
                {new Date(item.updatedAt).toLocaleString()} · rev {item.localRevision}
              </Text>
              <SyncBadge status={bookSync} />
            </Pressable>
            {bookSync?.conflicts ? (
              <Pressable onPress={() => onNavigate('conflicts', item.bookId)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Review conflicts in ${item.title}`}>
                <Text style={styles.deleteText}>Review</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => onNavigate('snapshots', item.bookId)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Snapshots of ${item.title}`}>
              <Text style={{ color: colors.ink }}>Snapshots</Text>
            </Pressable>
            <Pressable onPress={() => remove(item)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        );
      }}
      ListFooterComponent={
        recovered.length > 0 ? (
          <View style={[styles.header, { marginTop: 24 }]}>
            <Text style={[styles.title, { fontSize: 20 }]}>Recovered copies</Text>
            <Text style={styles.muted}>Versions kept when sync replaced or removed your text. Restoring one opens it as a new manuscript.</Text>
            {recovered.map((copy) => (
              <View key={copy.id} style={styles.bookRow}>
                <View style={styles.bookMain}>
                  <Text style={styles.rowTitle}>{copy.title}</Text>
                  <Text style={styles.muted}>
                    {copy.reason} · {new Date(copy.capturedAt).toLocaleString()}
                  </Text>
                </View>
                <Pressable onPress={() => recover(copy)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Restore ${copy.title} as a new manuscript`}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Restore</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null
      }
    />
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingTop: 56, gap: 4 },
  header: { gap: 10, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tag: { color: colors.accent, fontSize: 13, flexShrink: 1 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.error, fontSize: 15 },
  primaryButton: { minHeight: 48, borderRadius: 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.5 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.ink, justifyContent: 'center' },
  secondaryButtonText: { color: colors.ink, fontWeight: '600' },
  bookRow: { flexDirection: 'row', alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, minHeight: 56 },
  bookMain: { flex: 1, paddingVertical: 10, gap: 2 },
  rowTitle: { color: colors.ink, fontSize: 17 },
  deleteButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  deleteText: { color: colors.error },
});
