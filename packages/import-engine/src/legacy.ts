import {
  createId,
  createManuscript,
  createParagraph,
  createPart,
  createSection,
  type Part,
  type Section,
} from '@folio-loom/book-model';
import { classifySectionTitle } from '@folio-loom/chapter-engine';
import { checkManuscriptPreservesSource } from '@folio-loom/validation';
import { buildReport } from './report';
import { importTxt } from './txt';
import type { ImportOptions, ImportResult } from './types';

/** The subset of the legacy CRA `BookData` (src/context/BookContext.tsx) that holds text. */
export interface LegacyChapter {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  content?: string;
  isNumbered?: boolean;
  startOnRightPage?: boolean;
  type?: 'chapter' | 'frontMatter' | 'backMatter';
}

export interface LegacyBook {
  title?: string;
  author?: string;
  manuscript?: {
    frontMatter?: LegacyChapter[];
    parts?: { id: string; title: string; subtitle?: string; chapterIds: string[] }[];
    chapters?: LegacyChapter[];
    backMatter?: LegacyChapter[];
  };
  chapters?: LegacyChapter[];
  content?: string;
}

/**
 * Convert a legacy localStorage book. Legacy previews split paragraphs on every newline, so
 * each non-empty line becomes a paragraph. The author's explicit kind/numbering choices win
 * over re-classification; IDs are regenerated because legacy IDs were not guaranteed unique.
 */
export function fromLegacyBook(book: LegacyBook, options: ImportOptions = {}): ImportResult {
  const idGen = options.idGen ?? createId;
  const structured = book.manuscript;
  const groups: [NonNullable<LegacyChapter['type']>, LegacyChapter[]][] = structured
    ? [
        ['frontMatter', structured.frontMatter ?? []],
        ['chapter', structured.chapters ?? []],
        ['backMatter', structured.backMatter ?? []],
      ]
    : [['chapter', book.chapters ?? []]];

  const sourcePieces: string[] = [];
  const sections: Section[] = [];
  const idMap = new Map<string, string>();
  const partTitleBefore = new Map<string, string>();
  for (const part of structured?.parts ?? []) {
    const first = groups.flatMap(([, list]) => list).find((chapter) => part.chapterIds.includes(chapter.id));
    if (first && !partTitleBefore.has(first.id)) partTitleBefore.set(first.id, part.title);
  }

  for (const [groupKind, chapters] of groups) {
    for (const chapter of chapters) {
      const kind = chapter.type ?? groupKind;
      const body = chapter.body ?? chapter.content ?? '';
      const blocks = body
        .split(/\r\n?|\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => createParagraph(line, idGen));
      const classified = classifySectionTitle(chapter.title);
      const section = createSection(
        {
          kind,
          role: classified.kind === kind ? classified.role : kind === 'chapter' ? 'chapter' : 'other',
          title: chapter.title,
          ...(chapter.subtitle ? { subtitle: chapter.subtitle } : {}),
          numbered: chapter.isNumbered ?? kind === 'chapter',
          startOnRecto: chapter.startOnRightPage ?? false,
          blocks,
          detection: { signal: 'manual', confidence: 'high' },
        },
        idGen,
      );
      if (!idMap.has(chapter.id)) idMap.set(chapter.id, section.id);
      sections.push(section);

      const partTitle = partTitleBefore.get(chapter.id);
      if (partTitle) sourcePieces.push(partTitle);
      sourcePieces.push(chapter.title, chapter.subtitle ?? '', body);
    }
  }

  if (sections.length === 0 && book.content?.trim()) {
    // Oldest saves only kept the raw imported text.
    const result = importTxt(book.content, {
      ...options,
      idGen,
      title: options.title ?? book.title ?? '',
      authors: options.authors ?? (book.author ? [book.author] : []),
    });
    return { ...result, report: { ...result.report, format: 'legacy' } };
  }

  const parts: Part[] = (structured?.parts ?? [])
    .map((part) =>
      createPart(
        {
          title: part.title,
          ...(part.subtitle ? { subtitle: part.subtitle } : {}),
          sectionIds: sections
            .filter((section) => part.chapterIds.some((legacyId) => idMap.get(legacyId) === section.id))
            .map((section) => section.id),
        },
        idGen,
      ),
    )
    .filter((part) => part.sectionIds.length > 0);

  const manuscript = createManuscript(
    {
      title: options.title ?? book.title ?? '',
      authors: options.authors ?? (book.author ? [book.author] : []),
      language: options.language ?? 'en',
      sections,
      parts,
      ...(options.now ? { now: options.now } : {}),
    },
    idGen,
  );
  const preservation = checkManuscriptPreservesSource(sourcePieces.join('\n'), manuscript);
  return {
    manuscript,
    report: buildReport({ format: 'legacy', strategy: 'legacy', needsReview: false, manuscript, preservation, warnings: [] }),
  };
}
