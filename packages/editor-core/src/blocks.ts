import {
  createHeadingBlock,
  createParagraph,
  createSceneBreak,
  type Block,
  type HeadingBlock,
  type IdGenerator,
  type InlineMark,
  type Manuscript,
  type ParagraphBlock,
  runsToPlainText,
  type TextRun,
} from '@folio-loom/book-model';
import { deleteRangeFromRuns, insertTextIntoRuns, replaceRangeWithRuns, splitRunsAt, toggleMarkInRuns } from './runs-edit';
import type { TextRange } from './selection';
import { blockRange, collapsedAt } from './selection';
import { EditError, insertBlockAfter, removeBlock, updateBlock } from './structure';

type TextBlock = ParagraphBlock | HeadingBlock;

function isTextBlock(block: Block): block is TextBlock {
  return block.type === 'paragraph' || block.type === 'heading';
}

function findBlock(manuscript: Manuscript, sectionId: string, blockId: string): { sectionIndex: number; blockIndex: number; block: Block } {
  const sectionIndex = manuscript.sections.findIndex((s) => s.id === sectionId);
  if (sectionIndex === -1) throw new EditError(`Unknown section ${sectionId}`);
  const section = manuscript.sections[sectionIndex];
  if (!section) throw new EditError(`Unknown section ${sectionId}`);
  const blockIndex = section.blocks.findIndex((b) => b.id === blockId);
  if (blockIndex === -1) throw new EditError(`Unknown block ${blockId}`);
  const block = section.blocks[blockIndex];
  if (!block) throw new EditError(`Unknown block ${blockId}`);
  return { sectionIndex, blockIndex, block };
}

function textBlockOrThrow(block: Block): TextBlock {
  if (!isTextBlock(block)) throw new EditError('This operation needs a paragraph or heading.');
  return block;
}

function withTextRuns(block: TextBlock, runs: TextRun[]): TextBlock {
  return block.type === 'paragraph' ? { ...block, runs } : { ...block, runs };
}

export interface EditResult {
  manuscript: Manuscript;
  selection: TextRange;
}

export function insertTextAt(manuscript: Manuscript, point: { sectionId: string; blockId: string; offset: number }, text: string): EditResult {
  const { block } = findBlock(manuscript, point.sectionId, point.blockId);
  const textBlock = textBlockOrThrow(block);
  const runs = insertTextIntoRuns(textBlock.runs, point.offset, text);
  const next = updateBlock(manuscript, point.sectionId, withTextRuns(textBlock, runs));
  return { manuscript: next, selection: collapsedAt(point.sectionId, point.blockId, point.offset + text.length) };
}

export function deleteSelection(manuscript: Manuscript, range: TextRange): EditResult {
  const single = blockRange(range);
  if (!single) throw new EditError('Cross-block selection is not supported for delete yet; delete within one block.');
  if (single.start === single.end) {
    // Backspace at caret: delete one code unit before the caret.
    if (single.start === 0) return mergeWithPreviousBlock(manuscript, single.sectionId, single.blockId);
    const { block } = findBlock(manuscript, single.sectionId, single.blockId);
    const textBlock = textBlockOrThrow(block);
    const runs = deleteRangeFromRuns(textBlock.runs, single.start - 1, single.start);
    const next = updateBlock(manuscript, single.sectionId, withTextRuns(textBlock, runs));
    return { manuscript: next, selection: collapsedAt(single.sectionId, single.blockId, single.start - 1) };
  }
  const { block } = findBlock(manuscript, single.sectionId, single.blockId);
  const textBlock = textBlockOrThrow(block);
  const runs = deleteRangeFromRuns(textBlock.runs, single.start, single.end);
  const next = updateBlock(manuscript, single.sectionId, withTextRuns(textBlock, runs));
  return { manuscript: next, selection: collapsedAt(single.sectionId, single.blockId, single.start) };
}

export function toggleMark(manuscript: Manuscript, range: TextRange, mark: InlineMark): EditResult {
  const single = blockRange(range);
  if (!single) throw new EditError('Formatting applies within one paragraph or heading.');
  if (single.start === single.end) {
    // Empty selection: no run rewrite; UI should track pending marks for the next insert.
    return { manuscript, selection: range };
  }
  const { block } = findBlock(manuscript, single.sectionId, single.blockId);
  const textBlock = textBlockOrThrow(block);
  const runs = toggleMarkInRuns(textBlock.runs, single.start, single.end, mark);
  const next = updateBlock(manuscript, single.sectionId, withTextRuns(textBlock, runs));
  return { manuscript: next, selection: range };
}

/** Split a paragraph/heading at the caret (Enter). Scene breaks cannot be split. */
export function splitBlockAt(manuscript: Manuscript, point: { sectionId: string; blockId: string; offset: number }, idGen?: IdGenerator): EditResult {
  const { block } = findBlock(manuscript, point.sectionId, point.blockId);
  const textBlock = textBlockOrThrow(block);
  const plain = runsToPlainText(textBlock.runs);
  const at = Math.max(0, Math.min(plain.length, point.offset));
  const leftRuns = deleteRangeFromRuns(textBlock.runs, at, plain.length);
  const rightRuns = deleteRangeFromRuns(textBlock.runs, 0, at);
  const left = withTextRuns(textBlock, leftRuns.length > 0 ? leftRuns : [{ text: '' }]);
  const right =
    textBlock.type === 'paragraph'
      ? createParagraph(rightRuns.length > 0 ? rightRuns : [{ text: '' }], idGen)
      : createHeadingBlock(textBlock.level, rightRuns.length > 0 ? rightRuns : [{ text: '' }], idGen);
  let next = updateBlock(manuscript, point.sectionId, left);
  next = insertBlockAfter(next, point.sectionId, point.blockId, right);
  return { manuscript: next, selection: collapsedAt(point.sectionId, right.id, 0) };
}

/**
 * Backspace at the start of a block: merge its text into the previous text block,
 * or remove an empty block / remove a scene break before the caret.
 */
export function mergeWithPreviousBlock(manuscript: Manuscript, sectionId: string, blockId: string): EditResult {
  const { blockIndex, block } = findBlock(manuscript, sectionId, blockId);
  const section = manuscript.sections.find((s) => s.id === sectionId);
  if (!section) throw new EditError(`Unknown section ${sectionId}`);
  if (blockIndex === 0) return { manuscript, selection: collapsedAt(sectionId, blockId, 0) };

  const previous = section.blocks[blockIndex - 1];
  if (!previous) return { manuscript, selection: collapsedAt(sectionId, blockId, 0) };

  if (previous.type === 'sceneBreak') {
    const next = removeBlock(manuscript, sectionId, previous.id);
    return { manuscript: next, selection: collapsedAt(sectionId, blockId, 0) };
  }
  if (!isTextBlock(block) || !isTextBlock(previous)) {
    // Non-text into text: just delete the current empty-ish block if empty.
    if (isTextBlock(block) && runsToPlainText(block.runs).length === 0) {
      return { manuscript: removeBlock(manuscript, sectionId, blockId), selection: collapsedAt(sectionId, previous.id, runsToPlainText(previous.runs).length) };
    }
    return { manuscript, selection: collapsedAt(sectionId, blockId, 0) };
  }

  const caret = runsToPlainText(previous.runs).length;
  const merged = withTextRuns(previous, [...previous.runs, ...block.runs]);
  let next = updateBlock(manuscript, sectionId, merged);
  next = removeBlock(next, sectionId, blockId);
  return { manuscript: next, selection: collapsedAt(sectionId, previous.id, caret) };
}

export function insertParagraphAfter(manuscript: Manuscript, sectionId: string, afterBlockId: string | null, idGen?: IdGenerator): EditResult {
  const block = createParagraph('', idGen);
  const next = insertBlockAfter(manuscript, sectionId, afterBlockId, block);
  return { manuscript: next, selection: collapsedAt(sectionId, block.id, 0) };
}

export function insertHeadingAfter(
  manuscript: Manuscript,
  sectionId: string,
  afterBlockId: string | null,
  level: HeadingBlock['level'] = 2,
  idGen?: IdGenerator,
): EditResult {
  const block = createHeadingBlock(level, '', idGen);
  const next = insertBlockAfter(manuscript, sectionId, afterBlockId, block);
  return { manuscript: next, selection: collapsedAt(sectionId, block.id, 0) };
}

export function insertSceneBreakAfter(manuscript: Manuscript, sectionId: string, afterBlockId: string | null, idGen?: IdGenerator): EditResult {
  const breakBlock = createSceneBreak('* * *', idGen);
  let next = insertBlockAfter(manuscript, sectionId, afterBlockId, breakBlock);
  const paragraph = createParagraph('', idGen);
  next = insertBlockAfter(next, sectionId, breakBlock.id, paragraph);
  return { manuscript: next, selection: collapsedAt(sectionId, paragraph.id, 0) };
}

/** Paste plain text into a block, splitting on newlines into sibling paragraphs. */
export function pastePlainText(manuscript: Manuscript, range: TextRange, text: string, idGen?: IdGenerator): EditResult {
  const single = blockRange(range);
  if (!single) throw new EditError('Paste into one paragraph or heading.');
  const { block } = findBlock(manuscript, single.sectionId, single.blockId);
  const textBlock = textBlockOrThrow(block);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 1) {
    const runs = replaceRangeWithRuns(textBlock.runs, single.start, single.end, [{ text: lines[0] ?? '' }]);
    const next = updateBlock(manuscript, single.sectionId, withTextRuns(textBlock, runs));
    return { manuscript: next, selection: collapsedAt(single.sectionId, single.blockId, single.start + (lines[0]?.length ?? 0)) };
  }

  const first = lines[0] ?? '';
  const last = lines[lines.length - 1] ?? '';
  const middle = lines.slice(1, -1);
  const { left } = splitRunsAt(textBlock.runs, single.start);
  const { right } = splitRunsAt(textBlock.runs, single.end);
  const firstRuns = insertTextIntoRuns(left, runsToPlainText(left).length, first);

  let next = updateBlock(manuscript, single.sectionId, withTextRuns(textBlock, firstRuns));
  let afterId = single.blockId;
  for (const line of middle) {
    const para = createParagraph(line, idGen);
    next = insertBlockAfter(next, single.sectionId, afterId, para);
    afterId = para.id;
  }
  const lastPara = createParagraph([{ text: last }, ...right], idGen);
  next = insertBlockAfter(next, single.sectionId, afterId, lastPara);
  return { manuscript: next, selection: collapsedAt(single.sectionId, lastPara.id, last.length) };
}
