import type { Chapter } from '../context/BookContext';

/**
 * Turn a chapter's body into the same paragraph stream Preview uses (single newlines).
 */
export function normalizeChapterBodyToLines(raw: string): string[] {
  return raw.replace(/\r\n/g, '\n').split('\n').map((p) => p.trimEnd());
}

/**
 * Build flat measurement tokens for one chapter (headers, title, subtitle, body words).
 * Mirrors Preview `contentTokens` construction so pagination matches chapter styling.
 */
export function buildTokensForChapter(
  chapter: Chapter,
  formatChapterHeader: (c: Chapter) => string | null
): string[] {
  const parts: string[] = [];
  const chapterHeader = formatChapterHeader(chapter);
  if (chapterHeader) {
    parts.push(`__HEADER__${chapter.id}`);
    parts.push('\n');
  }
  if (chapter.title?.trim()) {
    parts.push(`__TITLE__${chapter.id}`);
    parts.push('\n');
  }
  if (chapter.subtitle?.trim()) {
    parts.push(`__SUBTITLE__${chapter.id}`);
    parts.push('\n');
  }
  const body = chapter.body || chapter.content || '';
  if (body) {
    parts.push(body);
    parts.push('\n');
  }
  const fullText = parts.join('');

  const paragraphs = normalizeChapterBodyToLines(fullText);
  const tokens: string[] = [];

  paragraphs.forEach((para) => {
    if (para.length > 0) {
      if (
        para.startsWith('__HEADER__') ||
        para.startsWith('__TITLE__') ||
        para.startsWith('__SUBTITLE__')
      ) {
        tokens.push(para);
      } else {
        const words = para.split(/\s+/).filter(Boolean);
        tokens.push(...words);
        tokens.push('\n\n');
      }
    }
  });

  return tokens;
}

/** Cheap signature for cache invalidation (not cryptographic). */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
