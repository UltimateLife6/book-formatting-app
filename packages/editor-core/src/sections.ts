import {
  createId,
  createParagraph,
  createSection,
  type IdGenerator,
  type Manuscript,
  type Section,
  type SectionKind,
  type SectionRole,
} from '@folio-loom/book-model';
import type { EditResult } from './blocks';
import { collapsedAt } from './selection';
import { EditError, moveSection, removeBlock, sectionIndex, sortPartsByReadingOrder, updateSection } from './structure';

function stripFromParts(manuscript: Manuscript, sectionId: string): Manuscript['parts'] {
  return manuscript.parts
    .map((part) => ({ ...part, sectionIds: part.sectionIds.filter((id) => id !== sectionId) }))
    .filter((part) => part.sectionIds.length > 0);
}

function cloneSection(section: Section, title: string, idGen: IdGenerator): Section {
  const blocks = section.blocks.map((block) => {
    if (block.type === 'paragraph') return { ...block, id: idGen('blk'), runs: block.runs.map((run) => ({ ...run })) };
    if (block.type === 'heading') return { ...block, id: idGen('blk'), runs: block.runs.map((run) => ({ ...run })) };
    return { ...block, id: idGen('blk') };
  });
  return createSection(
    {
      kind: section.kind,
      role: section.role,
      title,
      subtitle: section.subtitle,
      numbered: section.numbered,
      startOnRecto: section.startOnRecto,
      blocks,
      detection: { signal: 'manual', confidence: 'high' },
    },
    idGen,
  );
}

export function updateManuscriptMeta(
  manuscript: Manuscript,
  patch: Partial<Pick<Manuscript, 'title' | 'subtitle' | 'authors' | 'language' | 'metadata'>>,
): Manuscript {
  return { ...manuscript, ...patch };
}

export function addSection(
  manuscript: Manuscript,
  input: { kind: SectionKind; role?: SectionRole; title: string; atIndex?: number },
  idGen?: IdGenerator,
): EditResult {
  const section = createSection(
    {
      kind: input.kind,
      role: input.role,
      title: input.title,
      blocks: [createParagraph('', idGen)],
      detection: { signal: 'manual', confidence: 'high' },
    },
    idGen,
  );
  const at = input.atIndex ?? manuscript.sections.length;
  const sections = [...manuscript.sections];
  sections.splice(Math.max(0, Math.min(sections.length, at)), 0, section);
  const next = { ...manuscript, sections, parts: sortPartsByReadingOrder(manuscript.parts, sections) };
  const firstBlock = section.blocks[0];
  return {
    manuscript: next,
    selection: firstBlock ? collapsedAt(section.id, firstBlock.id, 0) : collapsedAt(section.id, section.id, 0),
  };
}

/** Delete a section. The last remaining section cannot be deleted. */
export function deleteSection(manuscript: Manuscript, sectionId: string): Manuscript {
  sectionIndex(manuscript, sectionId);
  if (manuscript.sections.length <= 1) throw new EditError('A manuscript must keep at least one section.');
  const sections = manuscript.sections.filter((section) => section.id !== sectionId);
  return { ...manuscript, sections, parts: stripFromParts(manuscript, sectionId) };
}

export function duplicateSection(manuscript: Manuscript, sectionId: string, idGen?: IdGenerator): EditResult {
  const index = sectionIndex(manuscript, sectionId);
  const section = manuscript.sections[index];
  if (!section) throw new EditError(`Unknown section ${sectionId}`);
  const copy = cloneSection(section, `${section.title || 'Untitled'} (copy)`, idGen ?? createId);
  const sections = [...manuscript.sections];
  sections.splice(index + 1, 0, copy);
  const next = { ...manuscript, sections, parts: sortPartsByReadingOrder(manuscript.parts, sections) };
  const firstBlock = copy.blocks[0];
  return {
    manuscript: next,
    selection: firstBlock ? collapsedAt(copy.id, firstBlock.id, 0) : collapsedAt(copy.id, copy.id, 0),
  };
}

/** Split a section so blocks from `blockId` onward become a new chapter after this one. */
export function splitSectionAtBlock(manuscript: Manuscript, sectionId: string, blockId: string, idGen?: IdGenerator): EditResult {
  const index = sectionIndex(manuscript, sectionId);
  const section = manuscript.sections[index];
  if (!section) throw new EditError(`Unknown section ${sectionId}`);
  const blockIndex = section.blocks.findIndex((block) => block.id === blockId);
  if (blockIndex <= 0) throw new EditError('Split after the first block of the section.');
  const kept = section.blocks.slice(0, blockIndex);
  const moved = section.blocks.slice(blockIndex);
  const newSection = createSection(
    {
      kind: 'chapter',
      title: 'Chapter',
      blocks: moved.length > 0 ? moved : [createParagraph('', idGen)],
      detection: { signal: 'manual', confidence: 'high' },
    },
    idGen,
  );
  const sections = [...manuscript.sections];
  sections[index] = {
    ...section,
    blocks: kept.length > 0 ? kept : [createParagraph('', idGen)],
    detection: { signal: 'manual', confidence: 'high' },
  };
  sections.splice(index + 1, 0, newSection);
  // The new chapter is not in any part; the original keeps its membership.
  const next = { ...manuscript, sections, parts: sortPartsByReadingOrder(manuscript.parts, sections) };
  const first = newSection.blocks[0];
  return {
    manuscript: next,
    selection: first ? collapsedAt(newSection.id, first.id, 0) : collapsedAt(newSection.id, newSection.id, 0),
  };
}

/** Merge `sectionId` into the previous section (blocks appended). */
export function mergeWithPreviousSection(manuscript: Manuscript, sectionId: string): Manuscript {
  const index = sectionIndex(manuscript, sectionId);
  if (index === 0) throw new EditError('Nothing to merge into.');
  const previous = manuscript.sections[index - 1];
  const current = manuscript.sections[index];
  if (!previous || !current) throw new EditError('Unknown section.');
  const merged: Section = {
    ...previous,
    blocks: [...previous.blocks, ...current.blocks],
    detection: { signal: 'manual', confidence: 'high' },
  };
  const sections = [...manuscript.sections];
  sections.splice(index - 1, 2, merged);
  return { ...manuscript, sections, parts: stripFromParts({ ...manuscript, sections }, sectionId) };
}

export function renameSection(manuscript: Manuscript, sectionId: string, title: string): Manuscript {
  return updateSection(manuscript, sectionId, { title });
}

export function setSectionKind(manuscript: Manuscript, sectionId: string, kind: SectionKind, role?: SectionRole): Manuscript {
  const defaults: Record<SectionKind, SectionRole> = { frontMatter: 'other', chapter: 'chapter', backMatter: 'other' };
  return updateSection(manuscript, sectionId, {
    kind,
    role: role ?? defaults[kind],
    numbered: kind === 'chapter',
  });
}

/** Move a section up or down by one position. */
export function nudgeSection(manuscript: Manuscript, sectionId: string, direction: -1 | 1): Manuscript {
  const index = sectionIndex(manuscript, sectionId);
  return moveSection(manuscript, sectionId, index + direction);
}

/** Remove an empty trailing paragraph after inserting a scene break elsewhere — kept for API completeness. */
export function ensureSectionHasBlock(manuscript: Manuscript, sectionId: string, idGen?: IdGenerator): Manuscript {
  const index = sectionIndex(manuscript, sectionId);
  const section = manuscript.sections[index];
  if (!section) return manuscript;
  if (section.blocks.length > 0) return manuscript;
  const sections = [...manuscript.sections];
  sections[index] = { ...section, blocks: [createParagraph('', idGen)] };
  return { ...manuscript, sections };
}

export function removeEmptyParagraph(manuscript: Manuscript, sectionId: string, blockId: string): Manuscript {
  try {
    return removeBlock(manuscript, sectionId, blockId);
  } catch {
    return manuscript;
  }
}
