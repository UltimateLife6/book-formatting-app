import type { Chapter, ManuscriptStructure } from '../context/BookContext';

/**
 * Chapter split for imports.
 * - Plain text / TXT / paste / Google Docs: strong + weak line heuristics.
 * - DOCX (via Mammoth HTML): Heading 1 is authoritative; strong regex is fallback;
 *   weak heuristics only when no Heading 1 / strong boundaries were found.
 */
export interface DetectedChapterDraft {
  title: string;
  body: string;
  type: Chapter['type'];
  isNumbered: boolean;
}

/** Structured document blocks (typically from Mammoth HTML). */
export type DocumentBlock =
  | { kind: 'heading1'; text: string }
  | { kind: 'heading2'; text: string }
  | { kind: 'paragraph'; text: string };

const SPELL_ONE = /^one$/i;
const SPELL_NUMBER = /^(two|three|four|five|six|seven|eight|nine|ten)$/i;
/**
 * Whole-line chapter titles only.
 * Allows optional subtitle after : - – — so "Chapter 3: The Turning Road" matches,
 * but mid-sentence uses of "chapter" do not (anchored ^$).
 */
const CHAPTER_HEADING =
  /^chapter\s+(\d+|[a-z]+)(?:\s*[:\-–—]\s*.+)?$/i;
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
  if (CHAPTER_HEADING.test(t)) return true;
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
 * Also reject when the following line looks like a sentence continuation (starts with a lowercase letter).
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
  if (CHAPTER_HEADING.test(t)) {
    const m = t.match(/^chapter\s+(\d+|[a-z]+)/i);
    const token = m?.[1] ?? '';
    const numbered = /^\d+$/.test(token);
    return { type: 'chapter', isNumbered: numbered };
  }
  if (matchesWeakNumericOnly(t) || matchesWeakSpelledOnly(t)) {
    return { type: 'chapter', isNumbered: true };
  }
  // Heading 1 titles without "Chapter" (e.g. "The Long Road Home") stay chapters, unnumbered.
  return { type: 'chapter', isNumbered: false };
}

const FALLBACK_MANUSCRIPT_TITLE = 'Manuscript';

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Convert Mammoth HTML into ordered heading/paragraph blocks. */
export function parseMammothHtmlToBlocks(html: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const re = /<(h1|h2|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const rawInner = decodeBasicHtmlEntities(stripHtmlTags(match[2])).replace(/\u00a0/g, ' ');
    const text = rawInner.replace(/[ \t]+\n/g, '\n').trim();
    if (!text) continue;
    if (tag === 'h1') blocks.push({ kind: 'heading1', text });
    else if (tag === 'h2') blocks.push({ kind: 'heading2', text });
    else blocks.push({ kind: 'paragraph', text });
  }
  return blocks;
}

/** Flatten blocks to plain text (paragraphs / headings separated by blank lines). */
export function blocksToPlainText(blocks: readonly DocumentBlock[]): string {
  return blocks
    .map((b) => b.text)
    .filter((t) => t.trim().length > 0)
    .join('\n\n');
}

type Acc = { title: string; body: string; type: Chapter['type']; isNumbered: boolean };

function finalizeBlocks(blocks: Acc[]): DetectedChapterDraft[] {
  return blocks.map((b) => ({
    title: b.title,
    body: (b.body || '').replace(/^\n+/, '').replace(/\n+$/, ''),
    type: b.type,
    isNumbered: b.isNumbered,
  }));
}

function appendBodyParagraph(acc: Acc, paragraph: string) {
  const p = paragraph.replace(/\n+$/, '');
  if (!p.trim()) return;
  if (acc.body) acc.body += '\n\n' + p;
  else acc.body = p;
}

/**
 * Split structured blocks (DOCX via Mammoth HTML) into chapter drafts.
 * Heading 1 always starts a section. Strong regex can start a section on Normal paragraphs.
 * If neither yields sections, falls back to full text heuristics (including weak rules).
 */
export function detectManuscriptChaptersFromBlocks(
  blocks: readonly DocumentBlock[]
): DetectedChapterDraft[] {
  const acc: Acc[] = [];
  let pendingParas: string[] = [];
  let started = false;

  const flushPendingAsOpening = () => {
    if (!pendingParas.length) return;
    const body = pendingParas.join('\n\n').replace(/^\n+/, '').replace(/\n+$/, '');
    pendingParas = [];
    if (!body.trim()) return;
    acc.push({
      title: 'Opening',
      body,
      type: 'frontMatter',
      isNumbered: false,
    });
  };

  const startSection = (title: string) => {
    if (!started) {
      flushPendingAsOpening();
      started = true;
    }
    const { type, isNumbered } = classifyHeading(title);
    acc.push({ title, body: '', type, isNumbered });
  };

  for (const block of blocks) {
    if (block.kind === 'heading1') {
      // Style is authoritative — one Heading 1 = one section (even if text also matches regex).
      startSection(block.text);
      continue;
    }

    // Heading 2: keep as body text (do not invent part structure here).
    if (block.kind === 'heading2') {
      if (!started) pendingParas.push(block.text);
      else if (acc.length) appendBodyParagraph(acc[acc.length - 1], block.text);
      else pendingParas.push(block.text);
      continue;
    }

    // Normal paragraph: strong regex fallback (priority 2). Weak rules only in fallback below.
    if (isStrongChapterHeadingLine(block.text)) {
      startSection(block.text.trim());
      continue;
    }

    if (!started) pendingParas.push(block.text);
    else if (acc.length) appendBodyParagraph(acc[acc.length - 1], block.text);
    else pendingParas.push(block.text);
  }

  if (!started) {
    // No Heading 1 and no strong paragraph titles — use line heuristics (incl. weak).
    return detectManuscriptChapters(blocksToPlainText(blocks));
  }

  return finalizeBlocks(acc);
}

/**
 * Split raw manuscript text into ordered chapter drafts.
 */
export function detectManuscriptChapters(raw: string): DetectedChapterDraft[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

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

  return finalizeBlocks(blocks);
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

function structureFromDrafts(drafts: DetectedChapterDraft[]): {
  manuscript: ManuscriptStructure;
  defaultSelectedChapterId: string | null;
} {
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

/** Build manuscript buckets + chapter numbers for main "chapter" sections. */
export function buildManuscriptStructureFromRawText(raw: string): {
  manuscript: ManuscriptStructure;
  defaultSelectedChapterId: string | null;
} {
  return structureFromDrafts(detectManuscriptChapters(raw));
}

/**
 * Build manuscript structure from Mammoth HTML (DOCX import).
 * Returns plainText suitable for BookData.content.
 */
export function buildManuscriptStructureFromDocxHtml(html: string): {
  manuscript: ManuscriptStructure;
  defaultSelectedChapterId: string | null;
  plainText: string;
} {
  const blocks = parseMammothHtmlToBlocks(html);
  const plainText = blocksToPlainText(blocks);
  const drafts = detectManuscriptChaptersFromBlocks(blocks);
  return {
    ...structureFromDrafts(drafts),
    plainText,
  };
}
