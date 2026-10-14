import { type Block, createId, createParagraph, createSceneBreak, type IdGenerator } from '@folio-loom/book-model';
import { detectSectionsInLines, splitLines } from '@folio-loom/chapter-engine';
import { checkManuscriptPreservesSource } from '@folio-loom/validation';
import { assembleManuscript } from './assemble';
import { buildReport } from './report';
import { isSceneBreakLine } from './sceneBreaks';
import type { ImportOptions, ImportResult } from './types';

/** True when blank lines separate text anywhere, i.e. paragraphs are blank-line delimited. */
export function usesBlankLineParagraphs(lines: readonly string[]): boolean {
  let seenText = false;
  let blankAfterText = false;
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (seenText) blankAfterText = true;
    } else if (blankAfterText) {
      return true;
    } else {
      seenText = true;
    }
  }
  return false;
}

/**
 * Blank-line mode: consecutive lines form one paragraph joined by soft line breaks ("\n").
 * Otherwise every non-empty line is its own paragraph. Scene-break lines always stand alone.
 */
export function linesToBlocks(lines: readonly string[], blankLineParagraphs: boolean, idGen: IdGenerator = createId): Block[] {
  const blocks: Block[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length > 0) blocks.push(createParagraph(pending.join('\n'), idGen));
    pending = [];
  };
  for (const line of lines) {
    const text = line.trim();
    if (text.length === 0) {
      flush();
    } else if (isSceneBreakLine(text)) {
      flush();
      blocks.push(createSceneBreak(text, idGen));
    } else if (blankLineParagraphs) {
      pending.push(text);
    } else {
      blocks.push(createParagraph(text, idGen));
    }
  }
  flush();
  return blocks;
}

export function importTxt(raw: string, options: ImportOptions = {}): ImportResult {
  const idGen = options.idGen ?? createId;
  const lines = splitLines(raw);
  const detection = detectSectionsInLines(lines);
  const blankLineParagraphs = usesBlankLineParagraphs(lines);
  const { manuscript, warnings } = assembleManuscript(
    detection,
    (start, end) => linesToBlocks(lines.slice(start, end), blankLineParagraphs, idGen),
    { ...options, idGen },
  );
  const preservation = checkManuscriptPreservesSource(raw, manuscript);
  return {
    manuscript,
    report: buildReport({
      format: 'txt',
      strategy: detection.strategy,
      needsReview: detection.needsReview,
      manuscript,
      preservation,
      warnings,
    }),
  };
}
