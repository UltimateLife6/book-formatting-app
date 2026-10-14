import {
  type Block,
  createHeadingBlock,
  createId,
  createParagraph,
  createSceneBreak,
  type HeadingBlock,
  type IdGenerator,
  type InlineMark,
  type ParagraphBlock,
  runsToPlainText,
  type TextRun,
  trimRuns,
} from '@folio-loom/book-model';
import { type DetectionUnit, detectSectionsInBlocks, pickChapterHeadingLevel } from '@folio-loom/chapter-engine';
import { checkManuscriptPreservesSource } from '@folio-loom/validation';
import mammoth from 'mammoth';
import { assembleManuscript } from './assemble';
import { buildReport } from './report';
import { isSceneBreakLine } from './sceneBreaks';
import type { ImportOptions, ImportResult, ImportWarning, ImportWarningCode } from './types';

/** Minimal view of Mammoth's internal document tree (see mammoth/lib/documents.js). */
interface MammothNode {
  type: string;
  children?: MammothNode[];
  value?: string;
  styleId?: string | null;
  styleName?: string | null;
  alignment?: string | null;
  breakType?: 'line' | 'page' | 'column';
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  isSmallCaps?: boolean;
  verticalAlignment?: 'baseline' | 'superscript' | 'subscript';
}

export interface DocxParagraph {
  runs: TextRun[];
  text: string;
  headingLevel: number | null;
  align?: ParagraphBlock['align'];
}

const HEADING_STYLE = /^heading\s*([1-6])$/i;
const CHAPTER_STYLE = /^chapter\s*(?:title|heading)$/i;

function headingLevelFor(node: MammothNode): number | null {
  for (const name of [node.styleName, node.styleId]) {
    if (!name) continue;
    const match = HEADING_STYLE.exec(name.trim());
    if (match?.[1]) return Number(match[1]);
    if (CHAPTER_STYLE.test(name.trim())) return 1;
  }
  return null;
}

function marksFor(run: MammothNode): InlineMark[] {
  const marks: InlineMark[] = [];
  if (run.isBold) marks.push('bold');
  if (run.isItalic) marks.push('italic');
  if (run.isUnderline) marks.push('underline');
  if (run.isStrikethrough) marks.push('strikethrough');
  if (run.isSmallCaps) marks.push('smallCaps');
  if (run.verticalAlignment === 'superscript') marks.push('superscript');
  if (run.verticalAlignment === 'subscript') marks.push('subscript');
  return marks;
}

function alignFor(alignment: string | null | undefined): ParagraphBlock['align'] | undefined {
  if (alignment === 'center') return 'center';
  if (alignment === 'right' || alignment === 'end') return 'end';
  return undefined;
}

/** Walks Mammoth's document tree, keeping heading levels, inline marks, and soft line breaks. */
export function collectDocxParagraphs(document: MammothNode): { paragraphs: DocxParagraph[]; warnings: ImportWarning[] } {
  const paragraphs: DocxParagraph[] = [];
  const seen = new Set<ImportWarningCode>();
  const warn = (code: ImportWarningCode) => seen.add(code);

  const collectRuns = (node: MammothNode, marks: InlineMark[], out: TextRun[]) => {
    switch (node.type) {
      case 'text':
        out.push({ text: node.value ?? '', marks });
        return;
      case 'tab':
        out.push({ text: '\t', marks });
        return;
      case 'break':
        if (node.breakType === 'line') out.push({ text: '\n', marks });
        return;
      case 'run':
        for (const child of node.children ?? []) collectRuns(child, marksFor(node), out);
        return;
      case 'hyperlink':
        warn('links_unlinked');
        break;
      case 'noteReference':
        warn('footnotes_omitted');
        return;
      case 'image':
        warn('images_omitted');
        return;
      case 'commentReference':
        warn('comments_omitted');
        return;
    }
    for (const child of node.children ?? []) collectRuns(child, marks, out);
  };

  const visit = (node: MammothNode) => {
    if (node.type === 'paragraph') {
      const runs: TextRun[] = [];
      for (const child of node.children ?? []) collectRuns(child, [], runs);
      const trimmed = trimRuns(runs);
      const text = runsToPlainText(trimmed);
      if (text.trim().length === 0) return;
      const paragraph: DocxParagraph = { runs: trimmed, text, headingLevel: headingLevelFor(node) };
      const align = alignFor(node.alignment);
      if (align) paragraph.align = align;
      paragraphs.push(paragraph);
      return;
    }
    if (node.type === 'table') warn('tables_flattened');
    for (const child of node.children ?? []) visit(child);
  };
  visit(document);

  const messages: Record<string, string> = {
    tables_flattened: 'Tables were converted to plain paragraphs.',
    footnotes_omitted: 'Footnotes and endnotes are not imported yet; their reference marks were removed.',
    images_omitted: 'Images are not imported yet.',
    links_unlinked: 'Hyperlinks were kept as plain text.',
    comments_omitted: 'Word comments were not imported.',
  };
  const warnings = [...seen].map((code) => ({ code, message: messages[code] ?? code }));
  return { paragraphs, warnings };
}

function paragraphToBlock(paragraph: DocxParagraph, chapterLevel: number | null, idGen: IdGenerator): Block {
  if (paragraph.headingLevel === null && isSceneBreakLine(paragraph.text)) {
    return createSceneBreak(paragraph.text.trim(), idGen);
  }
  if (paragraph.headingLevel !== null && chapterLevel !== null && paragraph.headingLevel > chapterLevel) {
    const relative = Math.min(4, Math.max(2, paragraph.headingLevel - chapterLevel + 1)) as HeadingBlock['level'];
    return createHeadingBlock(relative, paragraph.runs, idGen);
  }
  return createParagraph(paragraph.runs, idGen, paragraph.align ? { align: paragraph.align } : {});
}

async function readDocument(data: ArrayBuffer | Uint8Array): Promise<MammothNode> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // Node's reader expects `buffer`, the browser build `arrayBuffer`; JSZip accepts either type.
  const input = { buffer: bytes, arrayBuffer } as unknown as Parameters<typeof mammoth.convertToHtml>[0];
  const captured: { document?: MammothNode } = {};
  await mammoth.convertToHtml(input, {
    transformDocument: (document: MammothNode) => {
      captured.document = document;
      return document;
    },
    convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
  });
  if (!captured.document) throw new Error('Could not read the DOCX document body.');
  return captured.document;
}

async function readRawText(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const input = { buffer: bytes, arrayBuffer } as unknown as Parameters<typeof mammoth.extractRawText>[0];
  return (await mammoth.extractRawText(input)).value;
}

/**
 * Import a .docx file. Text preservation is verified against Mammoth's independent raw-text
 * extraction (which never goes through our tree walk), ignoring whitespace placement.
 */
export async function importDocx(data: ArrayBuffer | Uint8Array, options: ImportOptions = {}): Promise<ImportResult> {
  const idGen = options.idGen ?? createId;
  const document = await readDocument(data);
  const { paragraphs, warnings } = collectDocxParagraphs(document);

  const units: DetectionUnit[] = paragraphs.map((p) => ({ text: p.text, headingLevel: p.headingLevel }));
  const detection = detectSectionsInBlocks(units);
  const chapterLevel = pickChapterHeadingLevel(units);
  const assembled = assembleManuscript(
    detection,
    (start, end) => paragraphs.slice(start, end).map((p) => paragraphToBlock(p, chapterLevel, idGen)),
    { ...options, idGen },
  );

  const rawText = await readRawText(data);
  const preservation = checkManuscriptPreservesSource(rawText, assembled.manuscript, 'characters');
  return {
    manuscript: assembled.manuscript,
    report: buildReport({
      format: 'docx',
      strategy: detection.strategy,
      needsReview: detection.needsReview,
      manuscript: assembled.manuscript,
      preservation,
      warnings: [...warnings, ...assembled.warnings],
    }),
  };
}
