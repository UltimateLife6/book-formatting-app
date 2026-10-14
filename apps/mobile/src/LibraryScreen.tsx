import type { AuthService, AuthUser } from '@folio-loom/auth';
import type { LocalManuscriptStore, ManuscriptSummary, UserLibrary } from '@folio-loom/local-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
  onOpen,
}: {
  user: AuthUser;
  service: AuthService;
  store: LocalManuscriptStore;
  library: UserLibrary;
  onOpen: (bookId: string) => void;
}) {
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  const [books, setBooks] = useState<ManuscriptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setBooks(await library.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [library]);

  useEffect(() => {
    if (status.state.status === 'ready') void refresh();
  }, [status.state.status, refresh]);

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

  async function remove(book: ManuscriptSummary) {
    try {
      const request = await library.requestDelete(book.bookId);
      Alert.alert('Delete manuscript?', `"${request.title}" and its saved revisions will be removed from this device.`, [
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
      data={books ?? []}
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
          <Text style={styles.muted}>Stored on this device only. Cloud sync is not available yet.</Text>
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
          {status.state.status === 'opening' || (status.state.status === 'ready' && books === null) ? (
            <ActivityIndicator color={colors.ink} />
          ) : null}
          {books?.length === 0 ? <Text style={styles.muted}>No manuscripts yet.</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.bookRow}>
          <Pressable style={styles.bookMain} onPress={() => onOpen(item.bookId)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.muted}>
              {item.health === 'unreadable' ? 'Needs recovery' : `${item.wordCount.toLocaleString()} words`} · rev {item.localRevision}
              {item.dirty ? ' · not synced' : ''}
            </Text>
          </Pressable>
          <Pressable onPress={() => remove(item)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      )}
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
