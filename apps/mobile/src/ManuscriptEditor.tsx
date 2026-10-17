import type { Block, InlineMark, Manuscript, TextRun } from '@folio-loom/book-model';
import { chapterNumbers, manuscriptWordCount, runsToPlainText } from '@folio-loom/book-model';
import type { SyncEngine, SyncSnapshot } from '@folio-loom/cloud-sync';
import { SYNC_STATUS_LABEL } from '@folio-loom/cloud-sync';
import {
  addSection,
  deleteSection,
  deleteSelection,
  duplicateSection,
  EditHistory,
  deleteRangeFromRuns,
  insertSceneBreakAfter,
  insertTextIntoRuns,
  marksAtOffset,
  mergeWithPreviousSection,
  nudgeSection,
  rangeHasMark,
  renameSection,
  setSectionKind,
  splitSectionAtBlock,
  toggleMarkInRuns,
  updateBlock,
  updateManuscriptMeta,
  type TextRange,
} from '@folio-loom/editor-core';
import {
  type AutosaveController,
  createManuscriptAutosave,
  type LocalManuscriptRecord,
  SAVE_STATUS_LABEL,
  type UserLibrary,
} from '@folio-loom/local-storage';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { styles as libraryStyles } from './LibraryScreen';
import { colors } from './theme';

/**
 * Mobile editor: one TextInput per paragraph/heading. Marks are applied to the
 * native selection range via editor-core run ops (no WebView). Only the active
 * section's blocks are mounted, so a 210k-word book stays responsive while typing.
 */
export function ManuscriptEditor({
  library,
  initial,
  engine,
  sync,
  onClose,
  onNavigate,
}: {
  library: UserLibrary;
  initial: LocalManuscriptRecord;
  engine: SyncEngine | null;
  sync: SyncSnapshot;
  onClose: () => void;
  onNavigate: (screen: 'conflicts' | 'snapshots') => void;
}) {
  const [autosave, setAutosave] = useState<AutosaveController<Manuscript> | null>(null);
  const [manuscript, setManuscript] = useState(initial.manuscript);
  const [activeSectionId, setActiveSectionId] = useState(initial.manuscript.sections[0]?.id ?? '');
  const [navOpen, setNavOpen] = useState(false);
  const [selection, setSelection] = useState<TextRange | null>(null);
  const [pendingMarks, setPendingMarks] = useState<InlineMark[]>([]);
  const history = useRef(new EditHistory({ depth: 50 }));
  const [, bump] = useState(0);

  useEffect(() => {
    const controller = createManuscriptAutosave(library, initial);
    setAutosave(controller);
    return () => void controller.close();
  }, [library, initial]);

  useEffect(() => {
    if (!engine) return;
    engine.setEditing(initial.bookId, true);
    return () => engine.setEditing(initial.bookId, false);
  }, [engine, initial.bookId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void autosave?.flush();
    });
    return () => sub.remove();
  }, [autosave]);

  const saveSnap = useSyncExternalStore(
    autosave ? autosave.subscribe : () => () => {},
    autosave
      ? autosave.getSnapshot
      : () => ({ status: 'saved' as const, error: null, revision: initial.localRevision, lastSavedAt: initial.updatedAt }),
  );

  const apply = useCallback(
    (next: Manuscript, nextSelection?: TextRange | null, options: { kind?: string; coalesce?: boolean } = {}) => {
      if (!autosave) return;
      history.current.push({ manuscript, selection }, options.kind ?? 'edit', options.coalesce === true);
      setManuscript(next);
      if (nextSelection !== undefined) setSelection(nextSelection);
      autosave.update(next);
      bump((n) => n + 1);
    },
    [autosave, manuscript, selection],
  );

  const section = manuscript.sections.find((s) => s.id === activeSectionId) ?? manuscript.sections[0];
  const bookSync = sync.books.get(initial.bookId);
  const numbers = chapterNumbers(manuscript);

  const activeMarks = useMemo(() => {
    if (!section || !selection) return pendingMarks;
    const block = section.blocks.find((b) => b.id === selection.anchor.blockId);
    if (!block || (block.type !== 'paragraph' && block.type !== 'heading')) return pendingMarks;
    const start = Math.min(selection.anchor.offset, selection.focus.offset);
    const end = Math.max(selection.anchor.offset, selection.focus.offset);
    if (start === end) return pendingMarks.length ? pendingMarks : marksAtOffset(block.runs, start);
    const marks: InlineMark[] = [];
    if (rangeHasMark(block.runs, start, end, 'bold')) marks.push('bold');
    if (rangeHasMark(block.runs, start, end, 'italic')) marks.push('italic');
    return marks;
  }, [section, selection, pendingMarks]);

  function toggle(mark: InlineMark) {
    if (!section || !selection || selection.anchor.offset === selection.focus.offset) {
      setPendingMarks((prev) => (prev.includes(mark) ? prev.filter((m) => m !== mark) : [...prev, mark]));
      return;
    }
    const block = section.blocks.find((b) => b.id === selection.anchor.blockId);
    if (!block || (block.type !== 'paragraph' && block.type !== 'heading')) return;
    const start = Math.min(selection.anchor.offset, selection.focus.offset);
    const end = Math.max(selection.anchor.offset, selection.focus.offset);
    const runs = toggleMarkInRuns(block.runs, start, end, mark);
    apply(updateBlock(manuscript, section.id, { ...block, runs }), selection, { kind: 'mark' });
    setPendingMarks([]);
  }

  async function close() {
    const settled = await autosave?.flush();
    if (!settled || settled.status === 'saved') onClose();
    else Alert.alert('Save failed', 'Close anyway and risk losing recent changes?', [{ text: 'Stay' }, { text: 'Close', style: 'destructive', onPress: onClose }]);
  }

  if (!autosave || !section) return null;

  return (
    <KeyboardAvoidingView style={libraryStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={editorStyles.bar}>
        <Pressable onPress={close} style={libraryStyles.secondaryButton} accessibilityRole="button">
          <Text style={libraryStyles.secondaryButtonText}>Close</Text>
        </Pressable>
        <Pressable onPress={() => setNavOpen(true)} style={libraryStyles.secondaryButton} accessibilityRole="button">
          <Text style={libraryStyles.secondaryButtonText}>Chapters</Text>
        </Pressable>
        <Text style={libraryStyles.muted} accessibilityLiveRegion="polite">
          {SAVE_STATUS_LABEL[saveSnap.status]}
          {bookSync ? ` · ${SYNC_STATUS_LABEL[bookSync.kind]}` : ''}
        </Text>
      </View>

      <View style={editorStyles.toolbar} accessibilityRole="toolbar">
        <ToolBtn label="Undo" disabled={!history.current.canUndo} onPress={() => {
          const prev = history.current.undo({ manuscript, selection });
          if (!prev || !autosave) return;
          setManuscript(prev.manuscript);
          setSelection(prev.selection);
          autosave.update(prev.manuscript);
          bump((n) => n + 1);
        }} />
        <ToolBtn label="Redo" disabled={!history.current.canRedo} onPress={() => {
          const next = history.current.redo({ manuscript, selection });
          if (!next || !autosave) return;
          setManuscript(next.manuscript);
          setSelection(next.selection);
          autosave.update(next.manuscript);
          bump((n) => n + 1);
        }} />
        <ToolBtn label="B" active={activeMarks.includes('bold')} onPress={() => toggle('bold')} />
        <ToolBtn label="I" active={activeMarks.includes('italic')} onPress={() => toggle('italic')} italic />
        <ToolBtn
          label="Break"
          onPress={() => {
            const blockId = selection?.anchor.blockId ?? section.blocks.at(-1)?.id ?? null;
            const result = insertSceneBreakAfter(manuscript, section.id, blockId);
            apply(result.manuscript, result.selection, { kind: 'structure' });
          }}
        />
        <Text style={[libraryStyles.muted, { marginLeft: 'auto' }]}>{manuscriptWordCount(manuscript).toLocaleString()} w</Text>
      </View>

      {bookSync?.conflicts ? (
        <Pressable style={libraryStyles.primaryButton} onPress={() => void autosave.flush().then(() => onNavigate('conflicts'))}>
          <Text style={libraryStyles.primaryButtonText}>Review conflicts</Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={libraryStyles.muted}>Book title</Text>
        <TextInput
          value={manuscript.title}
          onChangeText={(title) => apply(updateManuscriptMeta(manuscript, { title }), selection, { kind: 'meta', coalesce: true })}
          style={editorStyles.input}
          accessibilityLabel="Book title"
        />
        <Text style={libraryStyles.muted}>Authors</Text>
        <TextInput
          value={manuscript.authors.join(', ')}
          onChangeText={(value) =>
            apply(
              updateManuscriptMeta(manuscript, {
                authors: value
                  .split(',')
                  .map((a) => a.trim())
                  .filter(Boolean),
              }),
              selection,
              { kind: 'meta', coalesce: true },
            )
          }
          style={editorStyles.input}
          accessibilityLabel="Authors"
        />
        <Text style={editorStyles.sectionTitle}>{section.title || 'Untitled'}</Text>
        {section.blocks.map((block) => (
          <MobileBlock
            key={block.id}
            block={block}
            sectionId={section.id}
            manuscript={manuscript}
            pendingMarks={pendingMarks}
            onApply={apply}
            onSelect={setSelection}
          />
        ))}
        <Pressable style={libraryStyles.secondaryButton} onPress={() => void autosave.flush().then(() => onNavigate('snapshots'))}>
          <Text style={libraryStyles.secondaryButtonText}>Snapshots</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={navOpen} animationType="slide" onRequestClose={() => setNavOpen(false)}>
        <View style={[libraryStyles.screen, libraryStyles.content]}>
          <Pressable onPress={() => setNavOpen(false)} style={libraryStyles.secondaryButton}>
            <Text style={libraryStyles.secondaryButtonText}>Done</Text>
          </Pressable>
          <Text style={libraryStyles.title}>Chapters</Text>
          <ScrollView>
            {manuscript.sections.map((s, index) => {
              const n = numbers.get(s.id);
              return (
                <View key={s.id} style={libraryStyles.bookRow}>
                  <Pressable
                    style={libraryStyles.bookMain}
                    onPress={() => {
                      setActiveSectionId(s.id);
                      setNavOpen(false);
                    }}
                  >
                    <Text style={libraryStyles.rowTitle}>{n !== undefined ? `${n}. ${s.title}` : s.title || s.kind}</Text>
                  </Pressable>
                  {s.id === activeSectionId ? (
                    <View style={{ gap: 4 }}>
                      <TextInput
                        value={s.title}
                        onChangeText={(title) => apply(renameSection(manuscript, s.id, title), selection, { kind: 'structure' })}
                        style={editorStyles.input}
                      />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <ToolBtn label="Up" disabled={index === 0} onPress={() => apply(nudgeSection(manuscript, s.id, -1), selection, { kind: 'structure' })} />
                        <ToolBtn label="Down" disabled={index === manuscript.sections.length - 1} onPress={() => apply(nudgeSection(manuscript, s.id, 1), selection, { kind: 'structure' })} />
                        <ToolBtn
                          label="Dup"
                          onPress={() => {
                            const result = duplicateSection(manuscript, s.id);
                            apply(result.manuscript, result.selection, { kind: 'structure' });
                          }}
                        />
                        <ToolBtn
                          label="Del"
                          onPress={() => {
                            if (manuscript.sections.length <= 1) return;
                            Alert.alert('Delete section?', s.title || 'Untitled', [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => {
                                  apply(deleteSection(manuscript, s.id), null, { kind: 'structure' });
                                  setActiveSectionId(manuscript.sections.find((x) => x.id !== s.id)?.id ?? '');
                                },
                              },
                            ]);
                          }}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {(['frontMatter', 'chapter', 'backMatter'] as const).map((kind) => (
                          <ToolBtn key={kind} label={kind === 'frontMatter' ? 'Front' : kind === 'backMatter' ? 'Back' : 'Ch'} active={s.kind === kind} onPress={() => apply(setSectionKind(manuscript, s.id, kind), selection, { kind: 'structure' })} />
                        ))}
                        <ToolBtn
                          label="Split"
                          onPress={() => {
                            const mid = s.blocks[1];
                            if (!mid) {
                              Alert.alert('Need at least two blocks to split.');
                              return;
                            }
                            try {
                              const result = splitSectionAtBlock(manuscript, s.id, mid.id);
                              apply(result.manuscript, result.selection, { kind: 'structure' });
                              setActiveSectionId(result.selection.anchor.sectionId);
                            } catch (e) {
                              Alert.alert(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        />
                        <ToolBtn
                          label="Merge"
                          onPress={() => {
                            try {
                              apply(mergeWithPreviousSection(manuscript, s.id), null, { kind: 'structure' });
                            } catch (e) {
                              Alert.alert(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12 }}>
            <ToolBtn
              label="+ Chapter"
              onPress={() => {
                const result = addSection(manuscript, { kind: 'chapter', title: 'Chapter' });
                apply(result.manuscript, result.selection, { kind: 'structure' });
                setActiveSectionId(result.selection.anchor.sectionId);
              }}
            />
            <ToolBtn
              label="+ Front"
              onPress={() => {
                const result = addSection(manuscript, { kind: 'frontMatter', title: 'Front matter', atIndex: 0 });
                apply(result.manuscript, result.selection, { kind: 'structure' });
                setActiveSectionId(result.selection.anchor.sectionId);
              }}
            />
            <ToolBtn
              label="+ Back"
              onPress={() => {
                const result = addSection(manuscript, { kind: 'backMatter', title: 'Back matter' });
                apply(result.manuscript, result.selection, { kind: 'structure' });
                setActiveSectionId(result.selection.anchor.sectionId);
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ToolBtn({ label, onPress, disabled, active, italic }: { label: string; onPress: () => void; disabled?: boolean; active?: boolean; italic?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[editorStyles.tool, active && editorStyles.toolOn, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
    >
      <Text style={[editorStyles.toolText, italic && { fontStyle: 'italic' }, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function MobileBlock({
  block,
  sectionId,
  manuscript,
  pendingMarks,
  onApply,
  onSelect,
}: {
  block: Block;
  sectionId: string;
  manuscript: Manuscript;
  pendingMarks: readonly InlineMark[];
  onApply: (m: Manuscript, sel?: TextRange | null, opts?: { kind?: string; coalesce?: boolean }) => void;
  onSelect: (range: TextRange | null) => void;
}) {
  if (block.type === 'sceneBreak') {
    return (
      <Text style={editorStyles.sceneBreak} accessibilityRole="text">
        {block.marker ?? '* * *'}
      </Text>
    );
  }
  if (block.type !== 'paragraph' && block.type !== 'heading') return null;
  const plain = runsToPlainText(block.runs);

  return (
    <TextInput
      value={plain}
      multiline
      style={[editorStyles.body, block.type === 'heading' && editorStyles.heading]}
      accessibilityLabel={block.type === 'heading' ? `Heading level ${block.level}` : 'Paragraph'}
      onSelectionChange={(e) => {
        const { start, end } = e.nativeEvent.selection;
        onSelect({
          anchor: { sectionId, blockId: block.id, offset: start },
          focus: { sectionId, blockId: block.id, offset: end },
        });
      }}
      onChangeText={(text) => {
        if (text === plain) return;
        let runs: TextRun[];
        if (pendingMarks.length > 0 && plain.length === 0) {
          runs = [{ text, marks: [...pendingMarks] }];
        } else if (text.startsWith(plain)) {
          runs = insertTextIntoRuns(block.runs, plain.length, text.slice(plain.length));
        } else if (plain.startsWith(text)) {
          runs = deleteRangeFromRuns(block.runs, text.length, plain.length);
        } else {
          let i = 0;
          while (i < text.length && i < plain.length && text[i] === plain[i]) i += 1;
          runs = deleteRangeFromRuns(block.runs, i, plain.length);
          runs = insertTextIntoRuns(runs, i, text.slice(i));
        }
        onApply(updateBlock(manuscript, sectionId, { ...block, runs }), undefined, { kind: 'type', coalesce: true });
      }}
      onKeyPress={(e) => {
        if (e.nativeEvent.key !== 'Backspace' || plain.length > 0) return;
        const result = deleteSelection(manuscript, {
          anchor: { sectionId, blockId: block.id, offset: 0 },
          focus: { sectionId, blockId: block.id, offset: 0 },
        });
        onApply(result.manuscript, result.selection, { kind: 'structure' });
      }}
      blurOnSubmit={false}
    />
  );
}

const editorStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 56, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#fff' },
  tool: { minHeight: 40, minWidth: 40, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: colors.ink },
  toolText: { color: colors.ink, fontWeight: '700' },
  input: { color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, backgroundColor: '#fff', fontSize: 16 },
  sectionTitle: { color: colors.ink, fontSize: 24, fontWeight: '600', marginTop: 8 },
  body: { color: colors.ink, fontSize: 17, lineHeight: 26, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, backgroundColor: '#fff', textAlignVertical: 'top' },
  heading: { fontSize: 20, fontWeight: '700' },
  sceneBreak: { textAlign: 'center', color: colors.muted, letterSpacing: 6, paddingVertical: 12 },
});
