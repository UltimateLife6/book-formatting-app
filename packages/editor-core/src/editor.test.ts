import {
  chapterNumbers,
  createManuscript,
  createParagraph,
  createPart,
  createSection,
  createSequentialIdGenerator,
  type Manuscript,
} from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import { assignSectionToPart, EditError, insertBlockAfter, moveSection, removeBlock, updateBlock, updateSection } from './index';

function sample(): Manuscript {
  const id = createSequentialIdGenerator('e');
  const dedication = createSection({ kind: 'frontMatter', role: 'dedication', title: 'Dedication' }, id);
  const one = createSection({ kind: 'chapter', title: 'One', blocks: [createParagraph('A', id), createParagraph('B', id)] }, id);
  const two = createSection({ kind: 'chapter', title: 'Two' }, id);
  const three = createSection({ kind: 'chapter', title: 'Three' }, id);
  const thanks = createSection({ kind: 'backMatter', role: 'acknowledgments', title: 'Thanks' }, id);
  const part = createPart({ title: 'Part One', sectionIds: [one.id, two.id] }, id);
  return createManuscript({ sections: [dedication, one, two, three, thanks], parts: [part] }, id);
}

const titles = (m: Manuscript) => m.sections.map((s) => s.title);

describe('editor-core', () => {
  it('moves front and back matter (legacy reorder bug)', () => {
    const m = sample();
    const thanks = m.sections[4]?.id ?? '';
    expect(titles(moveSection(m, thanks, 0))).toEqual(['Thanks', 'Dedication', 'One', 'Two', 'Three']);
  });

  it('keeps part membership ordered and chapter numbers derived after a move', () => {
    const m = sample();
    const two = m.sections[2]?.id ?? '';
    const one = m.sections[1]?.id ?? '';
    const moved = moveSection(m, two, 1);
    expect(moved.parts[0]?.sectionIds).toEqual([two, one]);
    expect(chapterNumbers(moved).get(two)).toBe(1);
    expect(m.sections[1]?.id).toBe(one);
  });

  it('assigns sections to parts', () => {
    const m = sample();
    const three = m.sections[3]?.id ?? '';
    const partId = m.parts[0]?.id ?? '';
    expect(assignSectionToPart(m, three, partId).parts[0]?.sectionIds.at(-1)).toBe(three);
    expect(assignSectionToPart(m, m.sections[1]?.id ?? '', null).parts[0]?.sectionIds).toHaveLength(1);
  });

  it('marks author edits as manual detection', () => {
    const m = sample();
    const edited = updateSection(m, m.sections[1]?.id ?? '', { title: 'Renamed' });
    expect(edited.sections[1]).toMatchObject({ title: 'Renamed', detection: { signal: 'manual', confidence: 'high' } });
  });

  it('updates, inserts, and removes blocks immutably', () => {
    const m = sample();
    const section = m.sections[1];
    if (!section) throw new Error('fixture');
    const [first, second] = section.blocks;
    if (!first || !second) throw new Error('fixture');

    const updated = updateBlock(m, section.id, { ...first, type: 'paragraph', runs: [{ text: 'A!', marks: ['italic'] }] });
    expect(updated.sections[1]?.blocks[0]).toMatchObject({ runs: [{ text: 'A!' }] });
    expect(section.blocks[0]).toBe(first);

    const inserted = insertBlockAfter(m, section.id, first.id, { id: 'blk_new', type: 'sceneBreak' });
    expect(inserted.sections[1]?.blocks.map((b) => b.id)).toEqual([first.id, 'blk_new', second.id]);
    expect(() => insertBlockAfter(inserted, section.id, null, { id: 'blk_new', type: 'sceneBreak' })).toThrow(EditError);

    expect(removeBlock(m, section.id, first.id).sections[1]?.blocks.map((b) => b.id)).toEqual([second.id]);
    expect(() => removeBlock(m, section.id, 'blk_missing')).toThrow(EditError);
  });
});
