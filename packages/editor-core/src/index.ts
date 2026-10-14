import type { Block, Manuscript, Part, Section } from '@folio-loom/book-model';

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}

function sectionIndex(manuscript: Manuscript, sectionId: string): number {
  const index = manuscript.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) throw new EditError(`Unknown section ${sectionId}`);
  return index;
}

function sortPartsByReadingOrder(parts: readonly Part[], sections: readonly Section[]): Part[] {
  const order = new Map(sections.map((section, i) => [section.id, i]));
  return parts.map((part) => ({
    ...part,
    sectionIds: [...part.sectionIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
  }));
}

/**
 * Move any section (front matter, chapter, or back matter) to `toIndex` in reading order.
 * The legacy reducer only reordered chapters, so moving front/back matter silently did nothing.
 */
export function moveSection(manuscript: Manuscript, sectionId: string, toIndex: number): Manuscript {
  const from = sectionIndex(manuscript, sectionId);
  const target = Math.max(0, Math.min(manuscript.sections.length - 1, toIndex));
  if (from === target) return manuscript;
  const sections = [...manuscript.sections];
  const [moved] = sections.splice(from, 1);
  if (!moved) return manuscript;
  sections.splice(target, 0, moved);
  return { ...manuscript, sections, parts: sortPartsByReadingOrder(manuscript.parts, sections) };
}

/** Put a section in a part (or remove it from all parts with `null`). */
export function assignSectionToPart(manuscript: Manuscript, sectionId: string, partId: string | null): Manuscript {
  sectionIndex(manuscript, sectionId);
  if (partId !== null && !manuscript.parts.some((part) => part.id === partId)) {
    throw new EditError(`Unknown part ${partId}`);
  }
  const parts = manuscript.parts.map((part) => {
    const without = part.sectionIds.filter((id) => id !== sectionId);
    return part.id === partId ? { ...part, sectionIds: [...without, sectionId] } : { ...part, sectionIds: without };
  });
  return { ...manuscript, parts: sortPartsByReadingOrder(parts, manuscript.sections) };
}

export type SectionPatch = Partial<Pick<Section, 'title' | 'subtitle' | 'kind' | 'role' | 'numbered' | 'startOnRecto'>>;

export function updateSection(manuscript: Manuscript, sectionId: string, patch: SectionPatch): Manuscript {
  const index = sectionIndex(manuscript, sectionId);
  const sections = [...manuscript.sections];
  const current = sections[index];
  if (!current) return manuscript;
  const next: Section = { ...current, ...patch };
  if (patch.title !== undefined || patch.kind !== undefined || patch.role !== undefined) {
    // An author edit replaces the importer's guess.
    next.detection = { signal: 'manual', confidence: 'high' };
  }
  sections[index] = next;
  return { ...manuscript, sections };
}

function mapBlocks(manuscript: Manuscript, sectionId: string, fn: (blocks: Block[]) => Block[]): Manuscript {
  const index = sectionIndex(manuscript, sectionId);
  const sections = [...manuscript.sections];
  const section = sections[index];
  if (!section) return manuscript;
  sections[index] = { ...section, blocks: fn([...section.blocks]) };
  return { ...manuscript, sections };
}

function blockIndex(blocks: readonly Block[], blockId: string): number {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1) throw new EditError(`Unknown block ${blockId}`);
  return index;
}

/** Replace a block. The replacement must keep the same ID so sync can track it. */
export function updateBlock(manuscript: Manuscript, sectionId: string, block: Block): Manuscript {
  return mapBlocks(manuscript, sectionId, (blocks) => {
    blocks[blockIndex(blocks, block.id)] = block;
    return blocks;
  });
}

/** Insert after `afterBlockId`, or at the start when it is null. */
export function insertBlockAfter(manuscript: Manuscript, sectionId: string, afterBlockId: string | null, block: Block): Manuscript {
  return mapBlocks(manuscript, sectionId, (blocks) => {
    if (blocks.some((existing) => existing.id === block.id)) throw new EditError(`Duplicate block ${block.id}`);
    const at = afterBlockId === null ? 0 : blockIndex(blocks, afterBlockId) + 1;
    blocks.splice(at, 0, block);
    return blocks;
  });
}

export function removeBlock(manuscript: Manuscript, sectionId: string, blockId: string): Manuscript {
  return mapBlocks(manuscript, sectionId, (blocks) => {
    blocks.splice(blockIndex(blocks, blockId), 1);
    return blocks;
  });
}
