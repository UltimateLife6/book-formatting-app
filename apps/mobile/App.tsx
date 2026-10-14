import { chapterNumbers, MANUSCRIPT_SCHEMA_VERSION, manuscriptWordCount } from '@folio-loom/book-model';
import { isStrongChapterHeadingLine } from '@folio-loom/chapter-engine';
import { DEFAULT_FORMATTING, findTrimSize } from '@folio-loom/formatting';
// Main entry only: the DOCX importer pulls in Mammoth and runs on the server/web.
import { importTxt, SAMPLE_MANUSCRIPT_TXT } from '@folio-loom/import-engine';
import { hasErrors, validateManuscriptIntegrity } from '@folio-loom/validation';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

const KIND_LABEL = { frontMatter: 'Front matter', chapter: 'Chapter', backMatter: 'Back matter' } as const;

export default function App() {
  const { manuscript, report } = useMemo(() => importTxt(SAMPLE_MANUSCRIPT_TXT, { title: 'Sample Manuscript' }), []);
  const numbers = useMemo(() => chapterNumbers(manuscript), [manuscript]);
  const valid = useMemo(() => !hasErrors(validateManuscriptIntegrity(manuscript)), [manuscript]);
  const trim = findTrimSize(DEFAULT_FORMATTING.trimSizeId);

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={manuscript.sections}
        keyExtractor={(section) => section.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.tag}>Folio Loom 2.0 · foundation preview</Text>
            <Text style={styles.title}>{manuscript.title}</Text>
            <Text style={styles.muted}>
              Schema v{MANUSCRIPT_SCHEMA_VERSION} · {trim?.name ?? 'unknown trim'} · heading check{' '}
              {isStrongChapterHeadingLine('Chapter 1') ? 'ok' : 'failed'}
            </Text>
            <View style={styles.stats}>
              <Stat label="sections" value={String(report.sectionCount)} />
              <Stat label="words" value={String(manuscriptWordCount(manuscript))} />
              <Stat label="text preserved" value={report.preservation.ok && valid ? 'Yes' : 'No'} />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.tag}>{numbers.has(item.id) ? `Chapter ${numbers.get(item.id)}` : KIND_LABEL[item.kind]}</Text>
          </View>
        )}
      />
      <StatusBar style="dark" />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#faf8f3' },
  content: { padding: 16, paddingTop: 56 },
  tag: { color: '#8a5a2b', fontSize: 13 },
  title: { color: '#1f2a44', fontSize: 28, fontWeight: '600', marginVertical: 6 },
  muted: { color: '#5b6475', fontSize: 14 },
  stats: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  stat: { flex: 1, backgroundColor: '#fff', borderColor: '#e4e0d6', borderWidth: 1, borderRadius: 12, padding: 12 },
  statValue: { color: '#1f2a44', fontSize: 20, fontWeight: '600' },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: '#e4e0d6',
    borderBottomWidth: 1,
    gap: 12,
  },
  rowTitle: { color: '#1f2a44', fontSize: 16, flexShrink: 1 },
});
