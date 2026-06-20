import type { BookData, ChapterHeadingStyle, ChapterSubtitleStyle, ChapterTitleStyle } from '../../context/BookContext';

/** Schema version — bump when persisted shape changes and add a migrator. */
export const BOOK_STORAGE_VERSION = 1;

export const BOOK_STORAGE_KEY = 'folio-loom:book';

export interface PersistedBookSnapshot {
  version: number;
  savedAt: string;
  book: BookData;
  currentStep: number;
}

export type SaveBookResult =
  | { ok: true }
  | { ok: false; reason: 'quota_exceeded' | 'serialize_error' | 'storage_unavailable' };

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function mergeChapterHeading(
  defaults: ChapterHeadingStyle,
  saved?: Partial<ChapterHeadingStyle>
): ChapterHeadingStyle {
  return { ...defaults, ...saved };
}

function mergeChapterTitle(
  defaults: ChapterTitleStyle,
  saved?: Partial<ChapterTitleStyle>
): ChapterTitleStyle {
  return { ...defaults, ...saved };
}

function mergeChapterSubtitle(
  defaults: ChapterSubtitleStyle,
  saved?: Partial<ChapterSubtitleStyle>
): ChapterSubtitleStyle {
  return { ...defaults, ...saved };
}

/**
 * Deep-merge persisted book data onto defaults so older saves missing new fields still load.
 */
export function mergePersistedBook(defaults: BookData, saved: BookData): BookData {
  const savedFormatting = saved.formatting ?? defaults.formatting;

  return {
    ...defaults,
    ...saved,
    metadata: {
      ...defaults.metadata,
      ...(saved.metadata ?? {}),
    },
    pageSize: {
      ...defaults.pageSize,
      ...(saved.pageSize ?? {}),
    },
    formatting: {
      ...defaults.formatting,
      ...savedFormatting,
      chapterHeading: mergeChapterHeading(
        defaults.formatting.chapterHeading,
        savedFormatting.chapterHeading
      ),
      chapterTitle: mergeChapterTitle(defaults.formatting.chapterTitle, savedFormatting.chapterTitle),
      chapterSubtitle: mergeChapterSubtitle(
        defaults.formatting.chapterSubtitle,
        savedFormatting.chapterSubtitle
      ),
    },
    chapters: Array.isArray(saved.chapters) ? saved.chapters : defaults.chapters,
    manuscript: saved.manuscript
      ? {
          frontMatter: Array.isArray(saved.manuscript.frontMatter)
            ? saved.manuscript.frontMatter
            : defaults.manuscript.frontMatter,
          parts: Array.isArray(saved.manuscript.parts) ? saved.manuscript.parts : defaults.manuscript.parts,
          chapters: Array.isArray(saved.manuscript.chapters)
            ? saved.manuscript.chapters
            : defaults.manuscript.chapters,
          backMatter: Array.isArray(saved.manuscript.backMatter)
            ? saved.manuscript.backMatter
            : defaults.manuscript.backMatter,
        }
      : defaults.manuscript,
    manuscriptUi: {
      ...(defaults.manuscriptUi ?? { selectedChapterId: null }),
      ...(saved.manuscriptUi ?? {}),
    },
  };
}

function parseSnapshot(raw: string): PersistedBookSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedBookSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== BOOK_STORAGE_VERSION) return null;
    if (!parsed.book || typeof parsed.book !== 'object') return null;
    if (typeof parsed.currentStep !== 'number') return null;
    return parsed as PersistedBookSnapshot;
  } catch {
    return null;
  }
}

export function loadBook(): PersistedBookSnapshot | null {
  if (!isBrowser) return null;

  try {
    const raw = window.localStorage.getItem(BOOK_STORAGE_KEY);
    if (!raw) return null;
    return parseSnapshot(raw);
  } catch {
    return null;
  }
}

export function saveBook(snapshot: {
  book: BookData;
  currentStep: number;
}): SaveBookResult {
  if (!isBrowser) {
    return { ok: false, reason: 'storage_unavailable' };
  }

  const payload: PersistedBookSnapshot = {
    version: BOOK_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    book: snapshot.book,
    currentStep: snapshot.currentStep,
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { ok: false, reason: 'serialize_error' };
  }

  try {
    window.localStorage.setItem(BOOK_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014)
    ) {
      return { ok: false, reason: 'quota_exceeded' };
    }
    return { ok: false, reason: 'storage_unavailable' };
  }
}

export function clearBook(): void {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(BOOK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** True when the book has author-entered content worth restoring. */
export function hasMeaningfulBookContent(book: BookData): boolean {
  if (book.title.trim() || book.author.trim()) return true;
  if (book.content.trim()) return true;
  if (book.chapters.length > 0) return true;

  const m = book.manuscript;
  return (
    m.frontMatter.length > 0 ||
    m.chapters.length > 0 ||
    m.backMatter.length > 0 ||
    m.parts.length > 0
  );
}
