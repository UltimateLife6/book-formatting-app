import { type Manuscript, manuscriptToPlainText, tokenizeWords } from '@folio-loom/book-model';

/**
 * `words` compares whitespace-separated tokens. `characters` ignores all whitespace, for sources
 * (such as Mammoth raw text) that drop line breaks without leaving a space behind.
 */
export type PreservationMode = 'words' | 'characters';

export interface TextPreservationReport {
  ok: boolean;
  mode: PreservationMode;
  sourceWordCount: number;
  resultWordCount: number;
  /** First differing word (or character) position, with a little context from each side. */
  firstMismatch: { index: number; expected: string; actual: string } | null;
}

function firstDifference<T>(a: readonly T[], b: readonly T[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export function checkTextPreservation(
  sourceText: string,
  resultText: string,
  mode: PreservationMode = 'words',
): TextPreservationReport {
  const sourceWords = tokenizeWords(sourceText);
  const resultWords = tokenizeWords(resultText);
  const base = { mode, sourceWordCount: sourceWords.length, resultWordCount: resultWords.length };

  if (mode === 'words') {
    const index = firstDifference(sourceWords, resultWords);
    if (index === -1) return { ok: true, ...base, firstMismatch: null };
    const around = (words: readonly string[]) => words.slice(Math.max(0, index - 3), index + 4).join(' ');
    return { ok: false, ...base, firstMismatch: { index, expected: around(sourceWords), actual: around(resultWords) } };
  }

  const sourceChars = Array.from(sourceWords.join(''));
  const resultChars = Array.from(resultWords.join(''));
  const index = firstDifference(sourceChars, resultChars);
  if (index === -1) return { ok: true, ...base, firstMismatch: null };
  const around = (chars: readonly string[]) => chars.slice(Math.max(0, index - 20), index + 20).join('');
  return { ok: false, ...base, firstMismatch: { index, expected: around(sourceChars), actual: around(resultChars) } };
}

/** Compares source text with the manuscript, ignoring section titles Folio Loom generated. */
export function checkManuscriptPreservesSource(
  sourceText: string,
  manuscript: Manuscript,
  mode: PreservationMode = 'words',
): TextPreservationReport {
  return checkTextPreservation(sourceText, manuscriptToPlainText(manuscript, { sourceOnly: true }), mode);
}
