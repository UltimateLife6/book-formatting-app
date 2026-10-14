import type { Manuscript } from '@folio-loom/book-model';
import {
  type AutosaveController,
  createManuscriptAutosave,
  firstParagraphText,
  type LoadResult,
  type LocalManuscriptRecord,
  SAVE_STATUS_LABEL,
  type UserLibrary,
  withFirstParagraph,
  withTitle,
} from '@folio-loom/local-storage';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { styles } from './LibraryScreen';
import { colors } from './theme';

export function EditorScreen({ library, bookId, onClose }: { library: UserLibrary; bookId: string; onClose: () => void }) {
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
  return <Editor key={`${result.record.bookId}:${result.record.localRevision}`} library={library} initial={result.record} onClose={onClose} />;
}

function Editor({ library, initial, onClose }: { library: UserLibrary; initial: LocalManuscriptRecord; onClose: () => void }) {
  const [autosave, setAutosave] = useState<AutosaveController<Manuscript> | null>(null);

  // The effect owns the controller. React may unmount and remount (Strict Mode, fast refresh), and a
  // controller closed by an earlier cleanup must never be reused.
  useEffect(() => {
    const controller = createManuscriptAutosave(library, initial);
    setAutosave(controller);
    // Unmount (close, or account change): save what is pending into this book's own account, then stop.
    return () => void controller.close();
  }, [library, initial]);

  if (!autosave) return null;
  return <EditorForm autosave={autosave} initial={initial} onClose={onClose} />;
}

function EditorForm({ autosave, initial, onClose }: { autosave: AutosaveController<Manuscript>; initial: LocalManuscriptRecord; onClose: () => void }) {
  const snapshot = useSyncExternalStore(autosave.subscribe, autosave.getSnapshot);
  const doc = useRef(initial.manuscript);
  const [title, setTitle] = useState(initial.manuscript.title);
  const [paragraph, setParagraph] = useState(firstParagraphText(initial.manuscript));
  const [closing, setClosing] = useState(false);

  // Flush when the app leaves the foreground (iOS may suspend or kill it soon after).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void autosave.flush();
    });
    return () => subscription.remove();
  }, [autosave]);

  const edit = useCallback(
    (next: Manuscript) => {
      doc.current = next;
      autosave.update(next);
    },
    [autosave],
  );

  async function close() {
    setClosing(true);
    const settled = await autosave.flush();
    setClosing(false);
    if (settled.status === 'saved') onClose();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { gap: 12 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Pressable onPress={close} disabled={closing} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>{closing ? 'Saving…' : 'Close'}</Text>
          </Pressable>
          <Text
            style={[styles.muted, snapshot.status === 'failed' && styles.error]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Save status: ${SAVE_STATUS_LABEL[snapshot.status]}`}
          >
            {SAVE_STATUS_LABEL[snapshot.status]}
          </Text>
        </View>
        {snapshot.status === 'failed' ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.error} accessibilityRole="alert">
              {snapshot.error?.message ?? 'Saving failed.'} Your changes are still here and have not been lost.
            </Text>
            <Pressable onPress={() => void autosave.retry()} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Retry save</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.muted}>Title</Text>
        <TextInput
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            edit(withTitle(doc.current, text));
          }}
          style={editorStyles.title}
          accessibilityLabel="Manuscript title"
        />
        <Text style={styles.muted}>First paragraph</Text>
        <TextInput
          value={paragraph}
          onChangeText={(text) => {
            setParagraph(text);
            edit(withFirstParagraph(doc.current, text));
          }}
          multiline
          style={editorStyles.body}
          accessibilityLabel="First paragraph"
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  const message = result.reason === 'not_found' ? 'This manuscript is not on this device for this account.' : result.message;
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
      {result.reason === 'corrupt' ? (
        <Text style={styles.muted}>Nothing has been deleted. Restoring keeps a copy of the damaged version.</Text>
      ) : null}
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

const editorStyles = {
  title: {
    color: colors.ink,
    fontSize: 22,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 26,
    minHeight: 220,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    textAlignVertical: 'top' as const,
  },
};
