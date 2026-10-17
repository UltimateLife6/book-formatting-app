import {
  createManuscript,
  createParagraph,
  createSection,
  createSequentialIdGenerator,
  type Manuscript,
  runsToPlainText,
} from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import {
  addSection,
  deleteSection,
  deleteSelection,
  duplicateSection,
  EditHistory,
  insertSceneBreakAfter,
  insertTextAt,
  mergeWithPreviousSection,
  moveSection,
  pastePlainText,
  rangeHasMark,
  splitBlockAt,
  splitSectionAtBlock,
  toggleMark,
  toggleMarkInRuns,
} from './index';
import { insertTextIntoRuns, splitRunsAt } from './runs-edit';

const id = createSequentialIdGenerator('r');

function book(): Manuscript {
  return createManuscript(
    {
      title: 'Demo',
      authors: ['Ada'],
      sections: [
        createSection(
          {
            kind: 'chapter',
            title: 'One',
            blocks: [
              createParagraph(
                [
                  { text: 'Hello ', marks: ['bold'] },
                  { text: 'world', marks: ['italic'] },
                  { text: '!' },
                ],
                id,
              ),
              createParagraph('Second paragraph.', id),
            ],
          },
          id,
        ),
        createSection({ kind: 'chapter', title: 'Two', blocks: [createParagraph('Later.', id)] }, id),
      ],
    },
    id,
  );
}

describe('run editing', () => {
  it('splits runs without rewriting unrelated marks', () => {
    const runs = [
      { text: 'Hello ', marks: ['bold' as const] },
      { text: 'world', marks: ['italic' as const] },
    ];
    const { left, right } = splitRunsAt(runs, 3);
    expect(runsToPlainText(left)).toBe('Hel');
    expect(left[0]?.marks).toEqual(['bold']);
    expect(runsToPlainText(right)).toBe('lo world');
    expect(right.map((r) => r.marks)).toEqual([['bold'], ['italic']]);
  });

  it('inserts text inheriting marks at the caret', () => {
    const runs = [{ text: 'ab', marks: ['bold' as const] }, { text: 'cd' }];
    const next = insertTextIntoRuns(runs, 2, 'X');
    expect(next).toEqual([
      { text: 'abX', marks: ['bold'] },
      { text: 'cd' },
    ]);
  });

  it('toggles bold across mixed runs without stripping italic', () => {
    const runs = [
      { text: 'Hello ', marks: ['bold' as const] },
      { text: 'world', marks: ['italic' as const] },
    ];
    // Select "world" (offsets 6–11) and bold it — italic stays.
    const bolded = toggleMarkInRuns(runs, 6, 11, 'bold');
    expect(bolded).toEqual([
      { text: 'Hello ', marks: ['bold'] },
      { text: 'world', marks: ['bold', 'italic'] },
    ]);
    expect(rangeHasMark(bolded, 6, 11, 'bold')).toBe(true);
    const unbolded = toggleMarkInRuns(bolded, 6, 11, 'bold');
    expect(unbolded).toEqual([
      { text: 'Hello ', marks: ['bold'] },
      { text: 'world', marks: ['italic'] },
    ]);
  });

  it('handles emoji and surrogate pairs as UTF-16 offsets', () => {
    const runs = [{ text: 'a😀b' }];
    expect(runsToPlainText(runs).length).toBe(4); // emoji = 2 code units
    const next = insertTextIntoRuns(runs, 3, 'X'); // after emoji
    expect(runsToPlainText(next)).toBe('a😀Xb');
  });
});

describe('block and section ops', () => {
  it('preserves formatting when editing another paragraph', () => {
    const m = book();
    const section = m.sections[0]!;
    const second = section.blocks[1]!;
    const { manuscript } = insertTextAt(m, { sectionId: section.id, blockId: second.id, offset: 0 }, 'NEW ');
    const first = manuscript.sections[0]?.blocks[0];
    expect(first?.type === 'paragraph' && first.runs).toEqual([
      { text: 'Hello ', marks: ['bold'] },
      { text: 'world', marks: ['italic'] },
      { text: '!' },
    ]);
    expect(manuscript.sections[0]?.blocks[1]?.type === 'paragraph' && runsToPlainText(manuscript.sections[0].blocks[1].runs)).toBe(
      'NEW Second paragraph.',
    );
  });

  it('splits and merges paragraphs with Enter/Backspace semantics', () => {
    const m = book();
    const section = m.sections[0]!;
    const first = section.blocks[0]!;
    const split = splitBlockAt(m, { sectionId: section.id, blockId: first.id, offset: 6 });
    expect(split.manuscript.sections[0]?.blocks).toHaveLength(3);
    const left = split.manuscript.sections[0]?.blocks[0];
    const right = split.manuscript.sections[0]?.blocks[1];
    expect(left?.type === 'paragraph' && runsToPlainText(left.runs)).toBe('Hello ');
    expect(right?.type === 'paragraph' && runsToPlainText(right.runs)).toBe('world!');
    expect(left?.type === 'paragraph' && left.runs[0]?.marks).toEqual(['bold']);

    const merged = deleteSelection(split.manuscript, {
      anchor: { sectionId: section.id, blockId: right!.id, offset: 0 },
      focus: { sectionId: section.id, blockId: right!.id, offset: 0 },
    });
    expect(merged.manuscript.sections[0]?.blocks).toHaveLength(2);
    const restored = merged.manuscript.sections[0]?.blocks[0];
    expect(restored?.type === 'paragraph' && runsToPlainText(restored.runs)).toBe('Hello world!');
  });

  it('inserts a scene break and keeps surrounding text', () => {
    const m = book();
    const section = m.sections[0]!;
    const first = section.blocks[0]!;
    const { manuscript } = insertSceneBreakAfter(m, section.id, first.id);
    expect(manuscript.sections[0]?.blocks.map((b) => b.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph', 'paragraph']);
  });

  it('toggles marks through the manuscript API', () => {
    const m = book();
    const section = m.sections[0]!;
    const first = section.blocks[0]!;
    const { manuscript } = toggleMark(
      m,
      {
        anchor: { sectionId: section.id, blockId: first.id, offset: 0 },
        focus: { sectionId: section.id, blockId: first.id, offset: 5 },
      },
      'italic',
    );
    const runs = manuscript.sections[0]?.blocks[0];
    expect(runs?.type === 'paragraph' && runs.runs[0]).toEqual({ text: 'Hello', marks: ['bold', 'italic'] });
  });

  it('pastes plain text as multiple paragraphs', () => {
    const m = book();
    const section = m.sections[0]!;
    const second = section.blocks[1]!;
    const { manuscript } = pastePlainText(
      m,
      {
        anchor: { sectionId: section.id, blockId: second.id, offset: 0 },
        focus: { sectionId: section.id, blockId: second.id, offset: 0 },
      },
      'Line A\nLine B',
      id,
    );
    const types = manuscript.sections[0]?.blocks.map((b) => (b.type === 'paragraph' ? runsToPlainText(b.runs) : b.type));
    expect(types).toContain('Line A');
    expect(types).toContain('Line BSecond paragraph.');
  });

  it('creates, duplicates, reorders, splits and merges sections; chapter numbers stay derived', () => {
    let m = book();
    const firstId = m.sections[0]!.id;
    m = addSection(m, { kind: 'frontMatter', title: 'Dedication', atIndex: 0 }, id).manuscript;
    expect(m.sections[0]?.kind).toBe('frontMatter');
    m = duplicateSection(m, firstId, id).manuscript;
    expect(m.sections.filter((s) => s.title.startsWith('One')).length).toBe(2);
    m = moveSection(m, m.sections[1]!.id, m.sections.length - 1);
    const chapter = m.sections.find((s) => s.title === 'One')!;
    const mid = chapter.blocks[1]!;
    m = splitSectionAtBlock(m, chapter.id, mid.id, id).manuscript;
    expect(m.sections.some((s) => s.title === 'Chapter')).toBe(true);
    const newChapter = m.sections.find((s) => s.title === 'Chapter')!;
    m = mergeWithPreviousSection(m, newChapter.id);
    expect(m.sections.find((s) => s.id === newChapter.id)).toBeUndefined();
    expect(() => deleteSection(createManuscript({ sections: [createSection({ kind: 'chapter', title: 'Only' }, id)] }, id), 'x')).toThrow();
  });

  it('undo/redo restores manuscript and coalesces typing', () => {
    const history = new EditHistory({ coalesceMs: 60_000 });
    let m = book();
    const section = m.sections[0]!;
    const block = section.blocks[1]!;
    const before = { manuscript: m, selection: null };
    history.push(before, 'type', false);
    m = insertTextAt(m, { sectionId: section.id, blockId: block.id, offset: 0 }, 'a').manuscript;
    history.push({ manuscript: m, selection: null }, 'type', true); // coalesced — stack still length 1
    m = insertTextAt(m, { sectionId: section.id, blockId: block.id, offset: 1 }, 'b').manuscript;
    expect(history.canUndo).toBe(true);
    const undone = history.undo({ manuscript: m, selection: null });
    expect(undone?.manuscript.sections[0]?.blocks[1]?.type === 'paragraph' && runsToPlainText(undone.manuscript.sections[0].blocks[1].runs)).toBe(
      'Second paragraph.',
    );
    const redone = history.redo({ manuscript: undone!.manuscript, selection: null });
    expect(redone?.manuscript).toBe(m);
  });
});
