'use client';

import { chapterNumbers, MANUSCRIPT_SCHEMA_VERSION, manuscriptWordCount } from '@folio-loom/book-model';
import { isStrongChapterHeadingLine } from '@folio-loom/chapter-engine';
import { escapeXml } from '@folio-loom/export-epub';
import { DEFAULT_FORMATTING, findTrimSize } from '@folio-loom/formatting';
import { importTxt, SAMPLE_MANUSCRIPT_TXT } from '@folio-loom/import-engine';
import { hasErrors, validateManuscriptIntegrity } from '@folio-loom/validation';
import { useMemo } from 'react';

const KIND_LABEL = { frontMatter: 'Front matter', chapter: 'Chapter', backMatter: 'Back matter' } as const;

export function ManuscriptPreview() {
  const { manuscript, report } = useMemo(() => importTxt(SAMPLE_MANUSCRIPT_TXT, { title: 'Sample Manuscript' }), []);
  const numbers = chapterNumbers(manuscript);
  const issues = validateManuscriptIntegrity(manuscript);
  const trim = findTrimSize(DEFAULT_FORMATTING.trimSizeId);

  return (
    <>
      <h1>{manuscript.title}</h1>
      <p className="muted">
        Shared packages loaded: schema v{MANUSCRIPT_SCHEMA_VERSION}, default trim {trim?.name ?? 'unknown'}. Heading check:{' '}
        {isStrongChapterHeadingLine('Chapter 1') ? 'ok' : 'failed'}. EPUB escaping: {escapeXml('&') === '&amp;' ? 'ok' : 'failed'}.
      </p>

      <ul className="stats">
        <li>
          <strong>{report.sectionCount}</strong>sections
        </li>
        <li>
          <strong>{report.partCount}</strong>parts
        </li>
        <li>
          <strong>{manuscriptWordCount(manuscript)}</strong>words
        </li>
        <li>
          <strong>{report.preservation.ok && !hasErrors(issues) ? 'Yes' : 'No'}</strong>text preserved
        </li>
      </ul>

      <ol className="outline">
        {manuscript.sections.map((section) => (
          <li key={section.id}>
            <span>{section.title}</span>
            <span className="tag">
              {numbers.has(section.id) ? `Chapter ${numbers.get(section.id)}` : KIND_LABEL[section.kind]}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
