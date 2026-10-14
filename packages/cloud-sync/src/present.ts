import { type Manuscript, manuscriptWordCount, type Section, sectionToPlainText } from '@folio-loom/book-model';
import { type BookStructure, CHOICES_BY_KIND, type ConflictChoice, type ConflictKind } from '@folio-loom/sync';
import type { ConflictView } from './engine';

/** Shared wording for the web and mobile conflict screens, so both platforms explain the same thing. */
export const CONFLICT_EXPLANATION: Record<ConflictKind, string> = {
  edit: 'This section was changed on this device and on another device.',
  remoteDeleted: 'You edited this section here, but it was deleted on another device.',
  localDeleted: 'You deleted this section here, but it was edited on another device.',
  structure: 'The book’s details or section order were changed on this device and on another device.',
  bookDeleted: 'This book was deleted on another device, but it has changes here that were never synced.',
};

export const CHOICE_LABEL: Record<ConflictChoice, string> = { mine: 'Keep mine', theirs: 'Keep theirs', both: 'Keep both' };

const CHOICE_HINT: Record<ConflictKind, Partial<Record<ConflictChoice, string>>> = {
  edit: {
    mine: 'Use this device’s version. The other version is kept as a recovered copy.',
    theirs: 'Use the other device’s version. Your version is kept as a recovered copy.',
    both: 'Keep the other device’s version and add yours right after it as “(my version)”.',
  },
  remoteDeleted: {
    mine: 'Keep the section with your edits.',
    theirs: 'Remove the section. Your version is kept as a recovered copy.',
    both: 'Keep your edits as a new section.',
  },
  localDeleted: {
    mine: 'Keep it deleted. The other device’s version is kept as a recovered copy.',
    theirs: 'Bring back the section with the other device’s edits.',
    both: 'Bring back the section with the other device’s edits.',
  },
  structure: {
    mine: 'Use this device’s details and order. The other version is kept as a recovered copy.',
    theirs: 'Use the other device’s details and order. Yours is kept as a recovered copy.',
  },
  bookDeleted: {
    mine: 'Keep the book and upload it again.',
    theirs: 'Delete it here too. Your copy is kept under “Recovered copies”.',
  },
};

export interface ConflictOption {
  choice: ConflictChoice;
  label: string;
  hint: string;
}

export function conflictOptions(kind: ConflictKind): ConflictOption[] {
  return CHOICES_BY_KIND[kind].map((choice) => ({ choice, label: CHOICE_LABEL[choice], hint: CHOICE_HINT[kind][choice] ?? '' }));
}

export interface ConflictSide {
  label: string;
  text: string;
}

function structureText(structure: BookStructure, titles: Readonly<Record<string, string>>): string {
  const lines = [`Title: ${structure.title}`];
  if (structure.subtitle) lines.push(`Subtitle: ${structure.subtitle}`);
  if (structure.authors.length > 0) lines.push(`Authors: ${structure.authors.join(', ')}`);
  lines.push('', 'Sections in order:');
  for (const [index, id] of structure.order.entries()) lines.push(`${index + 1}. ${titles[id] ?? '(a section from another device)'}`);
  return lines.join('\n');
}

const sectionText = (section: Section | null) => (section ? sectionToPlainText(section) || '(empty)' : '(deleted)');

/** Both versions as plain text, labelled by where they came from. */
export function conflictSides(view: ConflictView): { mine: ConflictSide; theirs: ConflictSide } {
  const kind = view.conflict.kind;
  const mineLabel = 'Your version (this device)';
  const theirsLabel = 'Other device’s version (cloud)';
  if (kind === 'bookDeleted') {
    const mine = view.mine as Manuscript;
    return {
      mine: { label: mineLabel, text: `“${mine.title}”: ${manuscriptWordCount(mine).toLocaleString()} words, ${mine.sections.length} sections` },
      theirs: { label: theirsLabel, text: '(book deleted)' },
    };
  }
  if (kind === 'structure') {
    return {
      mine: { label: mineLabel, text: structureText(view.mine as BookStructure, view.sectionTitles) },
      theirs: { label: theirsLabel, text: view.theirs ? structureText(view.theirs as BookStructure, view.sectionTitles) : '(missing)' },
    };
  }
  return {
    mine: { label: mineLabel, text: sectionText(view.mine as Section | null) },
    theirs: { label: theirsLabel, text: sectionText(view.theirs as Section | null) },
  };
}
