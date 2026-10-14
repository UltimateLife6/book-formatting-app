import type { AuthService, AuthUser } from '@folio-loom/auth';
import { chapterNumbers, MANUSCRIPT_SCHEMA_VERSION, manuscriptWordCount } from '@folio-loom/book-model';
import { isStrongChapterHeadingLine } from '@folio-loom/chapter-engine';
import { DEFAULT_FORMATTING, findTrimSize } from '@folio-loom/formatting';
// Main entry only: the DOCX importer pulls in Mammoth and runs on the server/web.
import { importTxt, SAMPLE_MANUSCRIPT_TXT } from '@folio-loom/import-engine';
import { hasErrors, validateManuscriptIntegrity } from '@folio-loom/validation';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

const KIND_LABEL = { frontMatter: 'Front matter', chapter: 'Chapter', backMatter: 'Back matter' } as const;

export function ProjectsScreen({ user, service }: { user: AuthUser; service: AuthService }) {
  const { manuscript, report } = useMemo(() => importTxt(SAMPLE_MANUSCRIPT_TXT, { title: 'Sample Manuscript' }), []);
  const numbers = useMemo(() => chapterNumbers(manuscript), [manuscript]);
  const valid = useMemo(() => !hasErrors(validateManuscriptIntegrity(manuscript)), [manuscript]);
  const trim = findTrimSize(DEFAULT_FORMATTING.trimSizeId);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const result = await service.signOut();
    setBusy(false);
    if (!result.ok) setSignOutError(result.error.message);
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={manuscript.sections}
      keyExtractor={(section) => section.id}
      ListHeaderComponent={
        <View>
          <View style={styles.accountBar}>
            <Text style={styles.tag} numberOfLines={1}>
              Signed in as {user.email ?? 'your account'}
            </Text>
            <Pressable
              onPress={signOut}
              disabled={busy}
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
            >
              <Text style={styles.secondaryButtonText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
            </Pressable>
          </View>
          {signOutError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {signOutError}
            </Text>
          ) : null}
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
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingTop: 56 },
  accountBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tag: { color: colors.accent, fontSize: 13, flexShrink: 1 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.ink, justifyContent: 'center' },
  secondaryButtonText: { color: colors.ink, fontWeight: '600' },
  error: { color: colors.error, marginTop: 8 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '600', marginVertical: 6 },
  muted: { color: colors.muted, fontSize: 14 },
  stats: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  stat: { flex: 1, backgroundColor: '#fff', borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: 12,
  },
  rowTitle: { color: colors.ink, fontSize: 16, flexShrink: 1 },
});
