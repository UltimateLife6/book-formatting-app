import { describe, expect, it } from 'vitest';
import {
  chapterNumbers,
  countWords,
  createHeadingBlock,
  createManuscript,
  createParagraph,
  createPart,
  createSceneBreak,
  createSection,
  createSequentialIdGenerator,
  deserializeManuscript,
  MANUSCRIPT_SCHEMA_VERSION,
  ManuscriptValidationError,
  manuscriptToPlainText,
  normalizeRuns,
  parseManuscript,
  serializeManuscript,
  trimRuns,
} from './index';
import type { Manuscript } from './index';

function sampleManuscript(): Manuscript {
  const id = createSequentialIdGenerator('s');
  const prologue = createSection(
    {
      kind: 'frontMatter',
      role: 'prologue',
      title: 'Prologue',
      numbered: false,
      blocks: [createParagraph('Before the storm.', id)],
    },
    id,
  );
  const chapterOne = createSection(
    {
      kind: 'chapter',
      title: 'Chapter 1',
      subtitle: 'The Turning Road',
      blocks: [
        createParagraph(
          [{ text: 'She said ' }, { text: 'no', marks: ['italic'] }, { text: ' and ' }, { text: 'meant it', marks: ['bold', 'italic'] }, { text: '.' }],
          id,
        ),
        createSceneBreak('* * *', id),
        createHeadingBlock(2, 'Later that night', id),
        createParagraph('Second paragraph.', id),
      ],
    },
    id,
  );
  const chapterTwo = createSection({ kind: 'chapter', title: 'Chapter 2', blocks: [createParagraph('Third.', id)] }, id);
  const acknowledgments = createSection(
    {
      kind: 'backMatter',
      role: 'acknowledgments',
      title: 'Acknowledgments',
      numbered: false,
      blocks: [createParagraph('Thank you.', id)],
    },
    id,
  );
  const part = createPart({ title: 'Part One', sectionIds: [chapterOne.id, chapterTwo.id] }, id);
  return createManuscript(
    {
      title: 'The Long Road Home',
      authors: ['A. Writer'],
      sections: [prologue, chapterOne, chapterTwo, acknowledgments],
      parts: [part],
      now: new Date('2026-10-14T12:00:00.000Z'),
    },
    id,
  );
}

describe('canonical manuscript schema', () => {
  it('supports chapters, paragraphs, inline formatting, scene breaks, and front/back matter', () => {
    const manuscript = sampleManuscript();
    const parsed = parseManuscript(manuscript);
    expect(parsed.ok).toBe(true);
    expect(manuscript.schemaVersion).toBe(MANUSCRIPT_SCHEMA_VERSION);
    expect(manuscript.sections.map((s) => s.kind)).toEqual(['frontMatter', 'chapter', 'chapter', 'backMatter']);
    const firstParagraph = manuscript.sections[1]?.blocks[0];
    expect(firstParagraph?.type).toBe('paragraph');
    if (firstParagraph?.type === 'paragraph') {
      expect(firstParagraph.runs).toEqual([
        { text: 'She said ' },
        { text: 'no', marks: ['italic'] },
        { text: ' and ' },
        { text: 'meant it', marks: ['bold', 'italic'] },
        { text: '.' },
      ]);
    }
  });

  it('round-trips through serialize/deserialize without changes', () => {
    const manuscript = sampleManuscript();
    const json = serializeManuscript(manuscript);
    const result = deserializeManuscript(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manuscript).toEqual(manuscript);
      expect(result.migratedFrom).toBeNull();
      expect(serializeManuscript(result.manuscript)).toBe(json);
    }
  });

  it('rejects unknown fields instead of silently stripping them', () => {
    const doc = { ...sampleManuscript(), futureField: true };
    const result = parseManuscript(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_document');
  });

  it('refuses documents from a newer schema version', () => {
    const doc = { ...sampleManuscript(), schemaVersion: MANUSCRIPT_SCHEMA_VERSION + 1 };
    const result = parseManuscript(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_version');
  });

  it('reports invalid JSON and missing versions distinctly', () => {
    const badJson = deserializeManuscript('{not json');
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.error).toBe('invalid_json');

    const { schemaVersion: _omit, ...withoutVersion } = sampleManuscript();
    const missing = parseManuscript(withoutVersion);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe('missing_version');
  });

  it('refuses to serialize an invalid manuscript', () => {
    const manuscript = sampleManuscript();
    const broken = { ...manuscript, id: 'has spaces' };
    expect(() => serializeManuscript(broken)).toThrow(ManuscriptValidationError);
  });

  it('rejects unknown inline marks and block types', () => {
    const manuscript = sampleManuscript();
    const section = manuscript.sections[0];
    if (!section) throw new Error('fixture');
    const badBlock = { id: 'blk_x', type: 'image', src: 'x' };
    const result = parseManuscript({
      ...manuscript,
      sections: [{ ...section, blocks: [badBlock] }, ...manuscript.sections.slice(1)],
    });
    expect(result.ok).toBe(false);
  });
});

describe('plain-text projection', () => {
  it('keeps every word in reading order, with part titles before their first section', () => {
    const text = manuscriptToPlainText(sampleManuscript());
    expect(text.split('\n\n')).toEqual([
      'Prologue',
      'Before the storm.',
      'Part One',
      'Chapter 1',
      'The Turning Road',
      'She said no and meant it.',
      '* * *',
      'Later that night',
      'Second paragraph.',
      'Chapter 2',
      'Third.',
      'Acknowledgments',
      'Thank you.',
    ]);
    expect(countWords(text)).toBe(31);
  });

  it('derives chapter numbers from order, skipping front/back matter', () => {
    const manuscript = sampleManuscript();
    const numbers = chapterNumbers(manuscript);
    expect([...numbers.values()]).toEqual([1, 2]);
    expect(numbers.get(manuscript.sections[0]?.id ?? '')).toBeUndefined();
  });
});

describe('run normalization', () => {
  it('merges adjacent runs with identical marks and orders marks canonically', () => {
    expect(
      normalizeRuns([
        { text: 'a', marks: ['italic', 'bold'] },
        { text: 'b', marks: ['bold', 'italic', 'bold'] },
        { text: '' },
        { text: 'c', marks: [] },
      ]),
    ).toEqual([{ text: 'ab', marks: ['bold', 'italic'] }, { text: 'c' }]);
  });

  it('trims only outer whitespace', () => {
    expect(trimRuns([{ text: '  ' }, { text: ' Hello ', marks: ['bold'] }, { text: 'world  ' }])).toEqual([
      { text: 'Hello ', marks: ['bold'] },
      { text: 'world' },
    ]);
  });
});
