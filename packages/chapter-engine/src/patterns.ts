/**
 * Whole-line heading patterns, adapted from the legacy `src/utils/chapterDetection.ts`.
 * Every pattern is anchored (^…$) so prose that merely mentions "chapter" never matches.
 */

const UNITS = 'one|two|three|four|five|six|seven|eight|nine';
const TEENS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const SPELLED_NUMBER = `(?:(?:${TENS})(?:[-\\s](?:${UNITS}))?|${TEENS}|${UNITS}|(?:one\\s)?hundred)`;
const ROMAN_NUMBER = '(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
const NUMBER_TOKEN = `(?:\\d{1,4}|${SPELLED_NUMBER}|${ROMAN_NUMBER})`;
/** Optional title after a separator: "Chapter 3: The Turning Road", "CHAPTER 4 — A Quiet Signal". */
const TITLE_TAIL = '(?:\\s*[:.\\-–—]\\s*(.*))?';

export const CHAPTER_HEADING = new RegExp(`^chapter\\s+(${NUMBER_TOKEN})${TITLE_TAIL}$`, 'i');
export const PART_HEADING = new RegExp(`^(?:part|book)\\s+(${NUMBER_TOKEN})${TITLE_TAIL}$`, 'i');
export const PROLOGUE_HEADING = new RegExp(`^prologue${TITLE_TAIL}$`, 'i');
export const EPILOGUE_HEADING = new RegExp(`^epilogue${TITLE_TAIL}$`, 'i');

const WEAK_SPELLED = /^(one|two|three|four|five|six|seven|eight|nine|ten)$/i;
/** Max characters on a weak numeric line (e.g. "99.") */
const MAX_WEAK_NUM_LINE_LEN = 4;
/** Spelled-out numbers are short words only */
const MAX_WEAK_SPELL_LINE_LEN = 5;

function clean(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

export function isChapterPatternLine(text: string): boolean {
  return CHAPTER_HEADING.test(clean(text));
}

export function isPartHeadingLine(text: string): boolean {
  return PART_HEADING.test(clean(text));
}

/** Chapter / prologue / epilogue lines that rarely appear as false positives mid-paragraph. */
export function isStrongChapterHeadingLine(text: string): boolean {
  const t = clean(text);
  if (!t) return false;
  return PROLOGUE_HEADING.test(t) || EPILOGUE_HEADING.test(t) || CHAPTER_HEADING.test(t);
}

/** Standalone "12." style — must be only digits + dot, no trailing text (excludes "1.5", "1. Foo"). */
export function matchesWeakNumericOnly(text: string): boolean {
  const t = text.trim();
  if (!/^\d{1,2}\.\s*$/.test(t)) return false;
  return t.length <= MAX_WEAK_NUM_LINE_LEN;
}

export function matchesWeakSpelledOnly(text: string): boolean {
  const t = text.trim();
  if (t.length > MAX_WEAK_SPELL_LINE_LEN) return false;
  return WEAK_SPELLED.test(t);
}

function isBlankLine(line: string | undefined): boolean {
  return line === undefined || line.trim().length === 0;
}

function firstNonBlankAfter(lines: readonly string[], lineIndex: number): string | null {
  for (let j = lineIndex + 1; j < lines.length; j++) {
    const t = lines[j]?.trim() ?? '';
    if (t.length > 0) return t;
  }
  return null;
}

function firstLetter(text: string): string | null {
  const match = /[a-zA-Z]/.exec(text);
  return match ? match[0] : null;
}

/**
 * Weak "1."-style heading: previous line blank (or start of file), and the next non-blank line
 * is not another weak outline marker (avoids "1.\n2.\n3." outlines).
 */
export function isWeakNumericChapterHeading(lineIndex: number, lines: readonly string[]): boolean {
  const t = lines[lineIndex]?.trim() ?? '';
  if (!matchesWeakNumericOnly(t)) return false;
  if (lineIndex > 0 && !isBlankLine(lines[lineIndex - 1])) return false;
  const next = firstNonBlankAfter(lines, lineIndex);
  if (next === null) return false;
  return !(matchesWeakNumericOnly(next) || matchesWeakSpelledOnly(next));
}

/**
 * Weak "One" / "Two" heading: same blank-before rule, reject chains of weak markers, and reject
 * when the next line starts lowercase (dialogue such as "One\nmust have known.").
 */
export function isWeakSpelledChapterHeading(lineIndex: number, lines: readonly string[]): boolean {
  const t = lines[lineIndex]?.trim() ?? '';
  if (!matchesWeakSpelledOnly(t)) return false;
  if (lineIndex > 0 && !isBlankLine(lines[lineIndex - 1])) return false;
  const next = firstNonBlankAfter(lines, lineIndex);
  if (next === null) return false;
  if (matchesWeakNumericOnly(next) || matchesWeakSpelledOnly(next)) return false;
  const letter = firstLetter(next);
  return !(letter !== null && letter === letter.toLowerCase());
}

export function isWeakChapterHeadingAt(lineIndex: number, lines: readonly string[]): boolean {
  return isWeakNumericChapterHeading(lineIndex, lines) || isWeakSpelledChapterHeading(lineIndex, lines);
}

/** Legacy-compatible predicate: strong or weak heading at this line. */
export function isChapterHeadingAt(lineIndex: number, lines: readonly string[]): boolean {
  const t = lines[lineIndex]?.trim() ?? '';
  if (!t) return false;
  return isStrongChapterHeadingLine(t) || isWeakChapterHeadingAt(lineIndex, lines);
}

export function cleanHeadingText(text: string): string {
  return clean(text);
}
