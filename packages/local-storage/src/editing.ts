import { createParagraph, createSection, type Manuscript, normalizeRuns, runsToPlainText } from '@folio-loom/book-model';
import { AutosaveController, type AutosaveOptions } from './autosave';
import type { LocalManuscriptRecord } from './types';
import type { UserLibrary } from './store';

/** Text of the first paragraph of the first section (the minimal M1-B editor edits only this). */
export function firstParagraphText(manuscript: Manuscript): string {
  for (const block of manuscript.sections[0]?.blocks ?? []) {
    if (block.type === 'paragraph') return runsToPlainText(block.runs);
  }
  return '';
}

/**
 * Replaces the first paragraph's text, keeping its id. Inline formatting of that one paragraph is
 * kept when its text is unchanged and dropped once edited (the minimal editor is plain text).
 */
export function withFirstParagraph(manuscript: Manuscript, text: string): Manuscript {
  if (firstParagraphText(manuscript) === text) return manuscript;
  const [first, ...rest] = manuscript.sections;
  if (!first) {
    return { ...manuscript, sections: [createSection({ kind: 'chapter', title: 'Chapter 1', blocks: [createParagraph(text)] })] };
  }
  const index = first.blocks.findIndex((block) => block.type === 'paragraph');
  const blocks = [...first.blocks];
  if (index === -1) {
    blocks.unshift(createParagraph(text));
  } else {
    const block = blocks[index];
    if (block?.type === 'paragraph') blocks[index] = { ...block, runs: normalizeRuns([{ text }]) };
  }
  return { ...manuscript, sections: [{ ...first, blocks }, ...rest] };
}

export function withTitle(manuscript: Manuscript, title: string): Manuscript {
  return manuscript.title === title ? manuscript : { ...manuscript, title };
}

/**
 * Autosave for one open manuscript, bound to the library (and therefore the account) it was
 * loaded from. A library is fixed to one UID, so even a late write can only land in that account.
 */
export function createManuscriptAutosave(
  library: UserLibrary,
  record: LocalManuscriptRecord,
  options: Pick<AutosaveOptions<Manuscript>, 'debounceMs' | 'maxWaitMs' | 'timers'> = {},
): AutosaveController<Manuscript> {
  return new AutosaveController<Manuscript>({
    ...options,
    initialRevision: record.localRevision,
    initialSavedAt: record.updatedAt,
    save: (manuscript, expectedRevision) => library.save(record.bookId, manuscript, expectedRevision),
  });
}

export const SAVE_STATUS_LABEL = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  failed: 'Save failed',
} as const;
