import { runsToPlainText } from './runs';
import type { Block, Manuscript, Section } from './types';

export function blockToPlainText(block: Block): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return runsToPlainText(block.runs);
    case 'sceneBreak':
      return block.marker ?? '';
  }
}

/** Titles such as "Opening" or "Manuscript" that Folio Loom invented during import. */
export function hasSyntheticTitle(section: Section): boolean {
  return section.detection?.signal === 'opening' || section.detection?.signal === 'fallback';
}

export interface PlainTextOptions {
  /** Omit titles Folio Loom generated, so the result can be compared with the imported source. */
  sourceOnly?: boolean;
}

export function sectionToPlainText(section: Section, options: PlainTextOptions = {}): string {
  const pieces: string[] = [];
  if (!(options.sourceOnly && hasSyntheticTitle(section)) && section.title.length > 0) {
    pieces.push(section.title);
  }
  if (section.subtitle) pieces.push(section.subtitle);
  for (const block of section.blocks) {
    const text = blockToPlainText(block);
    if (text.length > 0) pieces.push(text);
  }
  return pieces.join('\n\n');
}

/** Reading-order plain text; part titles appear before their first section. */
export function manuscriptToPlainText(manuscript: Manuscript, options: PlainTextOptions = {}): string {
  const partTitleBySectionId = new Map<string, string>();
  for (const part of manuscript.parts) {
    const firstInReadingOrder = manuscript.sections.find((section) => part.sectionIds.includes(section.id));
    if (firstInReadingOrder && part.title.length > 0) {
      partTitleBySectionId.set(firstInReadingOrder.id, part.title);
    }
  }
  const pieces: string[] = [];
  for (const section of manuscript.sections) {
    const partTitle = partTitleBySectionId.get(section.id);
    if (partTitle) pieces.push(partTitle);
    const text = sectionToPlainText(section, options);
    if (text.length > 0) pieces.push(text);
  }
  return pieces.join('\n\n');
}

export function tokenizeWords(text: string): string[] {
  const normalized = text.normalize('NFC').trim();
  return normalized.length === 0 ? [] : normalized.split(/\s+/u);
}

export function countWords(text: string): number {
  return tokenizeWords(text).length;
}

export function manuscriptWordCount(manuscript: Manuscript): number {
  return countWords(manuscriptToPlainText(manuscript));
}

/** Chapter numbers are derived from order so reordering can never leave stale numbers behind. */
export function chapterNumbers(manuscript: Manuscript): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;
  for (const section of manuscript.sections) {
    if (section.kind === 'chapter' && section.numbered) {
      numbers.set(section.id, next);
      next += 1;
    }
  }
  return numbers;
}
