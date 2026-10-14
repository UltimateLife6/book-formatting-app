import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createSequentialIdGenerator,
  manuscriptToPlainText,
  type ParagraphBlock,
  serializeManuscript,
  deserializeManuscript,
} from '@folio-loom/book-model';
import { hasErrors, validateManuscriptIntegrity } from '@folio-loom/validation';
import { describe, expect, it } from 'vitest';
import { fromLegacyBook, importTxt, SAMPLE_MANUSCRIPT_TXT } from './index';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../qa/fixtures/${name}`, import.meta.url)), 'utf8');

describe('importTxt', () => {
  it('keeps blank-line paragraphs, soft line breaks, and scene breaks', () => {
    const { manuscript, report } = importTxt(
      ['Chapter 1', '', 'First line', 'second line.', '', '* * *', '', 'After the break.', '', 'Chapter 2', '', 'More.'].join('\n'),
      { idGen: createSequentialIdGenerator('x') },
    );
    expect(report.preservation.ok).toBe(true);
    const [one, two] = manuscript.sections;
    expect(one?.title).toBe('Chapter 1');
    expect(one?.blocks.map((b) => b.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
    expect(one?.blocks[0] as ParagraphBlock).toMatchObject({ runs: [{ text: 'First line\nsecond line.' }] });
    expect(one?.blocks[1]).toMatchObject({ type: 'sceneBreak', marker: '* * *' });
    expect(two?.title).toBe('Chapter 2');
  });

  it('treats each line as a paragraph when the file has no blank lines', () => {
    const { manuscript } = importTxt('Chapter 1\nOne.\nTwo.\nChapter 2\nThree.');
    expect(manuscript.sections.map((s) => s.blocks.length)).toEqual([2, 1]);
  });

  it('never drops text before the first chapter', () => {
    const { manuscript, report } = importTxt('A Novel\nby Someone\n\nChapter 1\n\nBody.');
    expect(manuscript.sections[0]).toMatchObject({ title: 'Opening', kind: 'frontMatter' });
    expect(report.preservation.ok).toBe(true);
    expect(report.needsReview).toBe(true);
  });

  it('groups chapters into parts and keeps empty part headings as text', () => {
    const { manuscript, report } = importTxt(
      ['PART ONE', '', 'Chapter 1', '', 'A.', '', 'PART TWO', '', 'Chapter 2', '', 'B.', '', 'Epilogue', '', 'C.', '', 'PART THREE'].join('\n'),
    );
    expect(manuscript.parts.map((p) => [p.title, p.sectionIds.length])).toEqual([
      ['PART ONE', 1],
      ['PART TWO', 1],
    ]);
    expect(manuscript.sections.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2', 'Epilogue', 'PART THREE']);
    expect(report.warnings.map((w) => w.code)).toContain('empty_part');
    expect(report.preservation.ok).toBe(true);
  });

  it('classifies the sample manuscript used by the app shells', () => {
    const { manuscript, report } = importTxt(SAMPLE_MANUSCRIPT_TXT);
    expect(manuscript.sections.map((s) => [s.title, s.kind, s.role])).toEqual([
      ['Dedication', 'frontMatter', 'dedication'],
      ['Prologue', 'frontMatter', 'prologue'],
      ['Chapter 1: The Letter', 'chapter', 'chapter'],
      ['Chapter 2 — Low Tide', 'chapter', 'chapter'],
      ['Epilogue', 'backMatter', 'epilogue'],
      ['Acknowledgments', 'backMatter', 'acknowledgments'],
    ]);
    expect(manuscript.parts).toEqual([expect.objectContaining({ title: 'PART ONE', sectionIds: [manuscript.sections[2]?.id, manuscript.sections[3]?.id] })]);
    expect(manuscript.sections[2]?.blocks.map((b) => b.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
    expect(report.preservation.ok).toBe(true);
    expect(hasErrors(validateManuscriptIntegrity(manuscript))).toBe(false);
  });

  it('handles CRLF and a byte-order mark', () => {
    const { manuscript, report } = importTxt('\uFEFFChapter 1\r\n\r\nBody text.\r\n');
    expect(manuscript.sections[0]?.title).toBe('Chapter 1');
    expect(report.preservation.ok).toBe(true);
  });

  it.each([
    ['small-manuscript.txt', 5],
    ['medium-manuscript.txt', 25],
    ['large-novel.txt', 40],
    ['very-large-manuscript.txt', 70],
  ])('%s imports %i chapters with every word preserved', (name, chapters) => {
    const text = fixture(name);
    const rawWordCount = text.split(/\s+/).filter((word) => word.length > 0).length;
    const started = performance.now();
    const { manuscript, report } = importTxt(text);
    const elapsed = performance.now() - started;

    expect(report.chapterCount).toBe(chapters);
    expect(report.strategy).toBe('strongPatterns');
    expect(report.preservation).toMatchObject({ ok: true, sourceWordCount: rawWordCount, resultWordCount: rawWordCount });
    expect(manuscriptToPlainText(manuscript).split(/\s+/).filter(Boolean)).toEqual(text.split(/\s+/).filter(Boolean));
    expect(hasErrors(validateManuscriptIntegrity(manuscript))).toBe(false);
    expect(deserializeManuscript(serializeManuscript(manuscript))).toEqual({ ok: true, manuscript, migratedFrom: null });
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('fromLegacyBook', () => {
  it('converts the legacy structure, keeping author choices and parts', () => {
    const { manuscript, report } = fromLegacyBook({
      title: 'Legacy',
      author: 'Ana Núñez',
      manuscript: {
        frontMatter: [{ id: 'f1', title: 'Prologue', body: 'Before.', isNumbered: false, type: 'frontMatter' }],
        parts: [{ id: 'p1', title: 'Part One', chapterIds: ['c1', 'c2'] }],
        chapters: [
          { id: 'c1', title: 'Chapter 1', body: 'Line one\nLine two', isNumbered: true, startOnRightPage: true, type: 'chapter' },
          { id: 'c2', title: 'Interlude', body: 'Quiet.', isNumbered: false, type: 'chapter' },
        ],
        backMatter: [{ id: 'b1', title: 'Acknowledgments', body: 'Thanks.', isNumbered: false, type: 'backMatter' }],
      },
    });
    expect(manuscript.authors).toEqual(['Ana Núñez']);
    expect(manuscript.sections.map((s) => [s.title, s.kind, s.role, s.numbered])).toEqual([
      ['Prologue', 'frontMatter', 'prologue', false],
      ['Chapter 1', 'chapter', 'chapter', true],
      ['Interlude', 'chapter', 'chapter', false],
      ['Acknowledgments', 'backMatter', 'acknowledgments', false],
    ]);
    expect(manuscript.sections[1]?.startOnRecto).toBe(true);
    expect(manuscript.sections[1]?.blocks).toHaveLength(2);
    expect(manuscript.parts[0]?.sectionIds).toEqual([manuscript.sections[1]?.id, manuscript.sections[2]?.id]);
    expect(report.preservation.ok).toBe(true);
    expect(manuscriptToPlainText(manuscript)).toContain('Part One\n\nChapter 1');
  });

  it('falls back to the raw legacy content field', () => {
    const { manuscript, report } = fromLegacyBook({ title: 'Old', content: 'Chapter 1\n\nHello.' });
    expect(report.format).toBe('legacy');
    expect(manuscript.sections[0]?.title).toBe('Chapter 1');
  });
});
