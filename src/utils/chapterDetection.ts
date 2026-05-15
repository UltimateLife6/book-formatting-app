import type { Chapter, ManuscriptStructure } from '../context/BookContext';

/**
 * Heuristic chapter split for pasted manuscripts.
 * Strategy: treat certain whole-line headings as chapter boundaries, keep original order.
 * Strong patterns (Chapter …, Prologue, Epilogue) match anywhere on a line.
 * Weak patterns ("1.", "One") require blank-line context and a following non-outline line
 * to reduce false splits from lists and dialogue.
 * If nothing matches, return a single chapter named "Manuscript".
 */
export interface DetectedChapterDraft {
  title: string;
  body: string;
  type: Chapter['type'];
  isNumbered: boolean;
}

const SPELL_ONE = /^one$/i;
const SPELL_NUMBER = /^(two|three|four|five|six|seven|eight|nine|ten)$/i;
const CHAPTER_WORD = /^chapter\s+(\d+|[a-z]+)$/i;
const CHAPTER_UPPER = /^CHAPTER\s+(\d+|[A-Z]+)$/;
const PROLOGUE = /^prologue$/i;
const EPILOGUE = /^epilogue$/i;

/** Max characters on a weak numeric line (e.g. "99.") */
const MAX_WEAK_NUM_LINE_LEN = 4;
/** Spelled-out numbers are short words only */
const MAX_WEAK_SPELL_LINE_LEN = 5;

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

/** Chapter / prologue / epilogue lines that rarely appear as false positives mid-paragraph. */
export function isStrongChapterHeadingLine(trimmed: string): boolean {
  const t = trimmed.trim();
  if (!t) return false;
  if (PROLOGUE.test(t) || EPILOGUE.test(t)) return true;
  if (CHAPTER_WORD.test(t) || CHAPTER_UPPER.test(t)) return true;
  return false;
}

/** Standalone "12." style — must be only digits + dot, no trailing text (excludes "1.5", "1. Foo"). */
function matchesWeakNumericOnly(trimmed: string): boolean {
  const t = trimmed.trim();
  if (!/^\d{1,2}\.\s*$/.test(t)) return false;
  return t.length <= MAX_WEAK_NUM_LINE_LEN;
}

function matchesWeakSpelledOnly(trimmed: string): boolean {
  const t = trimmed.trim();
  if (t.length > MAX_WEAK_SPELL_LINE_LEN) return false;
  return SPELL_ONE.test(t) || SPELL_NUMBER.test(t);
}

function firstNonBlankAfter(lines: readonly string[], lineIndex: number): { idx: number; text: string } | null {
  for (let j = lineIndex + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t.length > 0) return { idx: j, text: t };
  }
  return null;
}

/**
 * Weak "1."-style heading: previous line blank (or start of file), and the next non-blank line
 * is not another weak outline marker (avoids "1.\n2.\n3." outlines).
 */
function isWeakNumericChapterHeading(lineIndex: number, lines: readonly string[]): boolean {
  const t = lines[lineIndex].trim();
  if (!matchesWeakNumericOnly(t)) return false;

  const prevOk = lineIndex === 0 || isBlankLine(lines[lineIndex - 1]);
  if (!prevOk) return false;

  const nb = firstNonBlankAfter(lines, lineIndex);
  if (!nb) return false;

  if (matchesWeakNumericOnly(nb.text) || matchesWeakSpelledOnly(nb.text)) {
    return false;
  }

  return true;
}

function firstLetterOfLine(trimmedLine: string): string | null {
  for (let k = 0; k < trimmedLine.length; k++) {
    const c = trimmedLine[k];
    if (/[a-zA-Z]/.test(c)) return c;
  }
  return null;
}

/**
 * Weak "One" / "Two" heading: same blank-before rule and reject if the next non-blank is another weak marker.
 * Also reject when the following line looks like a sentence continuation (starts with a lowercase letter),
 * which catches dialogue when `One` is followed by a lowercase sentence continuation on the next line.
 */
function isWeakSpelledChapterHeading(lineIndex: number, lines: readonly string[]): boolean {
  const t = lines[lineIndex].trim();
  if (!matchesWeakSpelledOnly(t)) return false;

  const prevOk = lineIndex === 0 || isBlankLine(lines[lineIndex - 1]);
  if (!prevOk) return false;

  const nb = firstNonBlankAfter(lines, lineIndex);
  if (!nb) return false;

  if (matchesWeakNumericOnly(nb.text) || matchesWeakSpelledOnly(nb.text)) {
    return false;
  }

  const firstLetter = firstLetterOfLine(nb.text);
  if (firstLetter !== null && firstLetter === firstLetter.toLowerCase()) {
    return false;
  }

  return true;
}

/** True if this line starts a detected chapter, given full line array and index. */
export function isChapterHeadingAt(lineIndex: number, lines: readonly string[]): boolean {
  const trimmed = lines[lineIndex].trimEnd().trim();
  if (!trimmed) return false;
  if (isStrongChapterHeadingLine(trimmed)) return true;
  if (isWeakNumericChapterHeading(lineIndex, lines)) return true;
  if (isWeakSpelledChapterHeading(lineIndex, lines)) return true;
  return false;
}

/**
 * Back-compat helper: without document context, only **strong** headings count
 * (Chapter …, Prologue, Epilogue). Pass `lineIndex` and `allLines` to evaluate weak headings.
 */
export function isLikelyChapterHeadingLine(
  line: string,
  lineIndex?: number,
  allLines?: readonly string[]
): boolean {
  if (lineIndex !== undefined && allLines !== undefined) {
    return isChapterHeadingAt(lineIndex, allLines);
  }
  return isStrongChapterHeadingLine(line.trim());
}

function classifyHeading(title: string): Pick<Chapter, 'type' | 'isNumbered'> {
  const t = title.trim();
  if (PROLOGUE.test(t)) return { type: 'frontMatter', isNumbered: false };
  if (EPILOGUE.test(t)) return { type: 'backMatter', isNumbered: false };
  if (CHAPTER_WORD.test(t) || CHAPTER_UPPER.test(t)) {
    const m = t.match(/chapter\s+(\d+|[a-z]+)/i);
    const token = m?.[1] ?? '';
    const numbered = /^\d+$/.test(token);
    return { type: 'chapter', isNumbered: numbered };
  }
  if (matchesWeakNumericOnly(t) || matchesWeakSpelledOnly(t)) {
    return { type: 'chapter', isNumbered: true };
  }
  return { type: 'chapter', isNumbered: false };
}

const FALLBACK_MANUSCRIPT_TITLE = 'Manuscript';

/**
 * Split raw manuscript text into ordered chapter drafts.
 */
export function detectManuscriptChapters(raw: string): DetectedChapterDraft[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  type Acc = { title: string; body: string; type: Chapter['type']; isNumbered: boolean };
  const blocks: Acc[] = [];
  let pendingBody: string[] = [];
  let started = false;

  const flushPendingAsOpening = () => {
    if (!pendingBody.length) return;
    const body = pendingBody.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    pendingBody = [];
    if (!body.trim()) return;
    blocks.push({
      title: 'Opening',
      body,
      type: 'frontMatter',
      isNumbered: false,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    if (isChapterHeadingAt(i, lines)) {
      const heading = trimmed.trim();
      if (!started) {
        flushPendingAsOpening();
        started = true;
      } else {
        const prev = blocks[blocks.length - 1];
        if (prev) {
          prev.body = prev.body.replace(/\n+$/, '');
        }
      }
      const { type, isNumbered } = classifyHeading(heading);
      blocks.push({
        title: heading,
        body: '',
        type,
        isNumbered,
      });
      continue;
    }
    if (!started) {
      pendingBody.push(line);
    } else {
      const cur = blocks[blocks.length - 1];
      if (!cur) {
        pendingBody.push(line);
        continue;
      }
      if (cur.body) cur.body += '\n' + line;
      else cur.body = line;
    }
  }

  if (!started) {
    const body = normalized.trim();
    if (!body) {
      return [
        {
          title: FALLBACK_MANUSCRIPT_TITLE,
          body: '',
          type: 'chapter',
          isNumbered: false,
        },
      ];
    }
    return [
      {
        title: FALLBACK_MANUSCRIPT_TITLE,
        body,
        type: 'chapter',
        isNumbered: true,
      },
    ];
  }

  return blocks.map((b) => ({
    title: b.title,
    body: (b.body || '').replace(/^\n+/, '').replace(/\n+$/, ''),
    type: b.type,
    isNumbered: b.isNumbered,
  }));
}

export function draftsToImportedChapters(
  drafts: DetectedChapterDraft[],
  idPrefix: string
): Chapter[] {
  const ts = Date.now();
  return drafts.map((d, i) => ({
    id: `${idPrefix}-${ts}-${i}`,
    title: d.title,
    body: d.body,
    content: d.body,
    isNumbered: d.isNumbered,
    startOnRightPage: false,
    type: d.type,
    metadata: { createdAt: new Date().toISOString(), importDetected: true },
  }));
}

/** Build manuscript buckets + chapter numbers for main "chapter" sections. */
export function buildManuscriptStructureFromRawText(raw: string): {
  manuscript: ManuscriptStructure;
  defaultSelectedChapterId: string | null;
} {
  const drafts = detectManuscriptChapters(raw);
  const flat = draftsToImportedChapters(drafts, 'import');
  const manuscript: ManuscriptStructure = {
    frontMatter: [],
    parts: [],
    chapters: [],
    backMatter: [],
  };
  for (const ch of flat) {
    if (ch.type === 'frontMatter') manuscript.frontMatter.push(ch);
    else if (ch.type === 'backMatter') manuscript.backMatter.push(ch);
    else manuscript.chapters.push(ch);
  }
  let chapterNumber = 1;
  manuscript.chapters = manuscript.chapters.map((chapter) => {
    if (chapter.isNumbered && chapter.type === 'chapter') {
      return { ...chapter, chapterNumber: chapterNumber++ };
    }
    return chapter;
  });
  const ordered = [...manuscript.frontMatter, ...manuscript.chapters, ...manuscript.backMatter];
  return {
    manuscript,
    defaultSelectedChapterId: ordered[0]?.id ?? null,
  };
}
