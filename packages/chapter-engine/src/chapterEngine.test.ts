import { describe, expect, it } from 'vitest';
import {
  classifySectionTitle,
  detectChaptersInText,
  detectSectionsInBlocks,
  detectSectionsInLines,
  type DetectionUnit,
  isChapterHeadingAt,
  isPartHeadingLine,
  isStrongChapterHeadingLine,
  pickChapterHeadingLevel,
  splitLines,
} from './index';

/** Ported from legacy src/utils/__tests__/chapterDetection.test.ts (line heuristics). */
describe('legacy regression: line patterns', () => {
  it('strong headings match without line context', () => {
    expect(isStrongChapterHeadingLine('Chapter 1')).toBe(true);
    expect(isStrongChapterHeadingLine('CHAPTER ONE')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter One')).toBe(true);
    expect(isStrongChapterHeadingLine('Prologue')).toBe(true);
    expect(isStrongChapterHeadingLine('Epilogue')).toBe(true);
  });

  it('strong headings allow titled chapter lines with common separators', () => {
    expect(isStrongChapterHeadingLine('Chapter 3: The Turning Road')).toBe(true);
    expect(isStrongChapterHeadingLine('CHAPTER 4 — A Quiet Signal')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter Five - Homecoming')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter Twelve: Into the Dark')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter 2 – Arrival')).toBe(true);
  });

  it('strong headings reject mid-sentence chapter mentions', () => {
    expect(isStrongChapterHeadingLine('I started chapter 4 yesterday.')).toBe(false);
    expect(isStrongChapterHeadingLine('This chapter explains the process.')).toBe(false);
    expect(isStrongChapterHeadingLine('Chapter 4 was my favorite part.')).toBe(false);
  });

  it('strong-only check rejects weak markers without context', () => {
    expect(isStrongChapterHeadingLine('1.')).toBe(false);
    expect(isStrongChapterHeadingLine('One')).toBe(false);
  });

  it('weak numeric with context: blank before and real body after', () => {
    expect(isChapterHeadingAt(2, ['Intro.', '', '1.', '', 'She opened the door.'])).toBe(true);
  });

  it('weak numeric rejected when previous line is not blank', () => {
    expect(isChapterHeadingAt(1, ['Some text', '1.', 'Body'])).toBe(false);
  });

  it('weak numeric rejected when next non-blank is another outline marker', () => {
    expect(isChapterHeadingAt(1, ['', '1.', '', '2.', '', 'Still outline'])).toBe(false);
  });

  it('weak spelled rejected when chained with another weak marker', () => {
    expect(isChapterHeadingAt(1, ['', 'One', '', 'Two', '', 'Then narrative'])).toBe(false);
  });

  it('weak spelled accepted with blank before and narrative after', () => {
    expect(isChapterHeadingAt(1, ['', 'One', '', 'The rain fell.'])).toBe(true);
  });

  it('decimal line 1.5 is not a heading', () => {
    expect(isChapterHeadingAt(1, ['', '1.5', 'More text'])).toBe(false);
  });
});

describe('legacy regression: plain-text detection', () => {
  const single = (text: string) => {
    const chapters = detectChaptersInText(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.title).toBe('Manuscript');
    expect(chapters[0]?.signal).toBe('fallback');
    return chapters;
  };

  it('false positive: numbered list line "1. This is a list item"', () => {
    single('Shopping list:\n1. This is a list item\n2. Another item');
  });

  it('false positive: outline bullets only', () => {
    single('\n1.\n\n2.\n\n3.\n\n');
  });

  it('false positive: section reference "1. Introduction paragraph text"', () => {
    single('See below.\n1. Introduction paragraph text continues here.');
  });

  it('false positive: dialogue line One followed by lowercase continuation', () => {
    single('He stared.\n\nOne\nmust have known.');
  });

  it('false positive: multiple numbered bullets in an outline', () => {
    single('Agenda:\n1. First topic with long text\n2. Second topic here\n3. Third topic continues');
  });

  it('false positives: prose that mentions chapters', () => {
    single(['I started chapter 4 yesterday.', '', 'This chapter explains the process.', '', 'Chapter 4 was my favorite part.'].join('\n'));
  });

  it('returns single Manuscript when no headings', () => {
    const [chapter] = single('Just some prose.\nNo headings here.');
    expect(chapter?.body).toContain('Just some prose');
  });

  it('splits on strong headings and preserves order', () => {
    const chapters = detectChaptersInText('Intro line\nChapter 1\nFirst.\nCHAPTER TWO\nSecond.');
    expect(chapters.map((c) => c.title)).toEqual(['Opening', 'Chapter 1', 'CHAPTER TWO']);
    expect(chapters[0]?.body).toContain('Intro line');
    expect(chapters[0]?.kind).toBe('frontMatter');
  });

  it('splits on standalone weak numeric when context is chapter-like', () => {
    const chapters = detectChaptersInText('Note.\n\n2.\n\nThe next act began.');
    expect(chapters.some((c) => c.title === '2.' && c.signal === 'weakPattern')).toBe(true);
  });

  it('plain-text fallback splits titled chapter lines', () => {
    const text = ['Chapter 1', '', 'Body.', '', 'Chapter 2: Arrival', '', 'Body.', '', 'CHAPTER 3 — The Storm', '', 'Body.'].join('\n');
    expect(detectChaptersInText(text).map((c) => c.title)).toEqual([
      'Chapter 1',
      'Chapter 2: Arrival',
      'CHAPTER 3 — The Storm',
    ]);
  });
});

describe('plain-text detection improvements', () => {
  it('weak heuristics are not used when any strong heading exists', () => {
    const text = ['Chapter 1', '', 'Body.', '', 'One', '', 'Then the rain came.', '', 'Chapter 2', '', 'More.'].join('\n');
    const result = detectSectionsInLines(splitLines(text));
    expect(result.strategy).toBe('strongPatterns');
    expect(result.sections.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2']);
  });

  it('does not treat arbitrary words after "Chapter" as headings', () => {
    expect(isStrongChapterHeadingLine('Chapter summary')).toBe(false);
    expect(isStrongChapterHeadingLine('Chapter IV')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter Twenty-One')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter 7.')).toBe(true);
  });

  it('detects parts without turning them into chapters', () => {
    expect(isPartHeadingLine('PART ONE')).toBe(true);
    expect(isPartHeadingLine('Part 2: The Return')).toBe(true);
    expect(isPartHeadingLine('Part one of the plan was simple.')).toBe(false);

    const text = ['PART ONE', '', 'Chapter 1', '', 'A.', '', 'PART TWO', '', 'Chapter 2', '', 'B.'].join('\n');
    const result = detectSectionsInLines(splitLines(text));
    expect(result.sections.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(result.parts.map((p) => [p.title, p.firstSectionIndex])).toEqual([
      ['PART ONE', 0],
      ['PART TWO', 1],
    ]);
  });

  it('keeps text between a part heading and the next chapter', () => {
    const text = ['PART ONE', '', 'An epigraph.', '', 'Chapter 1', '', 'A.'].join('\n');
    const result = detectSectionsInLines(splitLines(text));
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.title).toBe('');
    expect(result.sections[0]?.signal).toBe('opening');
  });

  it('splits standalone front/back matter titles but not sentences', () => {
    const text = ['Dedication', '', 'For M.', '', 'Chapter 1', '', 'Body.', '', 'Also by the river they walked.', '', 'Acknowledgments', '', 'Thanks.'].join('\n');
    const result = detectSectionsInLines(splitLines(text));
    expect(result.sections.map((s) => [s.title, s.role, s.confidence])).toEqual([
      ['Dedication', 'dedication', 'medium'],
      ['Chapter 1', 'chapter', 'high'],
      ['Acknowledgments', 'acknowledgments', 'medium'],
    ]);
    expect(result.needsReview).toBe(true);
  });

  it('matter titles do not disable weak chapter heuristics', () => {
    const text = ['Dedication', '', 'For M.', '', '1.', '', 'The rain fell.', '', '2.', '', 'It stopped.'].join('\n');
    const result = detectSectionsInLines(splitLines(text));
    expect(result.strategy).toBe('weakPatterns');
    expect(result.sections.map((s) => s.title)).toEqual(['Dedication', '1.', '2.']);
  });

  it('section ranges cover every line exactly once', () => {
    const lines = splitLines('Title page\n\nChapter 1\nA\nB\nPrologue\nC\nChapter 2\nD');
    const { sections } = detectSectionsInLines(lines);
    const covered = new Set<number>();
    for (const s of sections) {
      if (s.headingIndex !== null) covered.add(s.headingIndex);
      for (let i = s.bodyStart; i < s.bodyEnd; i++) covered.add(i);
    }
    expect(covered.size).toBe(lines.length);
  });
});

describe('structured (DOCX) detection', () => {
  const h1 = (text: string): DetectionUnit => ({ text, headingLevel: 1 });
  const h2 = (text: string): DetectionUnit => ({ text, headingLevel: 2 });
  const p = (text: string): DetectionUnit => ({ text, headingLevel: null });

  it('splits five Heading 1 titles including subtitled chapters', () => {
    const units = [
      h1('Chapter 1'),
      p('First body.'),
      h1('CHAPTER 2'),
      p('Second body.'),
      h1('Chapter 3: The Turning Road'),
      p('Third body.'),
      h1('CHAPTER 4 — A Quiet Signal'),
      p('Fourth body.'),
      h1('Chapter 5'),
      p('Fifth body.'),
    ];
    const result = detectSectionsInBlocks(units);
    expect(result.strategy).toBe('headings');
    expect(result.sections.map((s) => s.title)).toEqual([
      'Chapter 1',
      'CHAPTER 2',
      'Chapter 3: The Turning Road',
      'CHAPTER 4 — A Quiet Signal',
      'Chapter 5',
    ]);
    expect(result.needsReview).toBe(false);
  });

  it('Heading 1 without the word Chapter still creates a numbered chapter', () => {
    const result = detectSectionsInBlocks([h1('The Long Road Home'), p('She walked until dusk.')]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ title: 'The Long Road Home', kind: 'chapter', numbered: true, signal: 'heading' });
  });

  it('a Heading 1 that also matches the chapter pattern creates exactly one section', () => {
    const result = detectSectionsInBlocks([h1('Chapter 1'), p('Only once.')]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ headingIndex: 0, bodyStart: 1, bodyEnd: 2 });
  });

  it('classifies front and back matter headings', () => {
    const result = detectSectionsInBlocks([
      h1('Dedication'),
      p('For M.'),
      h1('Prologue'),
      p('Before.'),
      h1('Chapter 1'),
      p('Main.'),
      h1('Epilogue'),
      p('After.'),
      h1('Acknowledgments'),
      p('Thanks.'),
      h1('About the Author'),
      p('Bio.'),
    ]);
    expect(result.sections.map((s) => [s.kind, s.role, s.numbered])).toEqual([
      ['frontMatter', 'dedication', false],
      ['frontMatter', 'prologue', false],
      ['chapter', 'chapter', true],
      ['backMatter', 'epilogue', false],
      ['backMatter', 'acknowledgments', false],
      ['backMatter', 'aboutAuthor', false],
    ]);
  });

  it('uses Heading 2 for chapters when a lone Heading 1 is the book title', () => {
    const units = [h1('The Long Road Home'), h2('Chapter 1'), p('A.'), h2('Chapter 2'), p('B.')];
    expect(pickChapterHeadingLevel(units)).toBe(2);
    const result = detectSectionsInBlocks(units);
    expect(result.sections.map((s) => [s.title, s.role])).toEqual([
      ['The Long Road Home', 'titlePage'],
      ['Chapter 1', 'chapter'],
      ['Chapter 2', 'chapter'],
    ]);
  });

  it('treats Heading 1 "Part One" as a part above Heading 2 chapters', () => {
    const units = [h1('Part One'), h2('Chapter 1'), p('A.'), h1('Part Two'), h2('Chapter 2'), p('B.')];
    const result = detectSectionsInBlocks(units);
    expect(result.sections.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(result.parts.map((part) => part.title)).toEqual(['Part One', 'Part Two']);
  });

  it('keeps deeper headings inside chapter bodies', () => {
    const result = detectSectionsInBlocks([h1('Chapter 1'), h2('A scene'), p('Text.'), h1('Chapter 2'), p('More.')]);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ bodyStart: 1, bodyEnd: 3 });
  });

  it('falls back to text patterns when the document has no heading styles', () => {
    const result = detectSectionsInBlocks([p('Chapter 1'), p('A.'), p('Chapter 2: Arrival'), p('B.')]);
    expect(result.strategy).toBe('strongPatterns');
    expect(result.sections.map((s) => [s.title, s.headingIndex, s.bodyStart, s.bodyEnd])).toEqual([
      ['Chapter 1', 0, 1, 2],
      ['Chapter 2: Arrival', 2, 3, 4],
    ]);
  });

  it('uses weak heuristics only when nothing stronger exists', () => {
    const result = detectSectionsInBlocks([p('1.'), p('The rain fell.'), p('2.'), p('It stopped.')]);
    expect(result.strategy).toBe('weakPatterns');
    expect(result.needsReview).toBe(true);
    expect(result.sections.map((s) => s.title)).toEqual(['1.', '2.']);
  });

  it('marks an opening section before the first heading for review', () => {
    const result = detectSectionsInBlocks([p('A Novel'), p('by A. Writer'), h1('Chapter 1'), p('A.'), h1('Chapter 2'), p('B.')]);
    expect(result.sections[0]).toMatchObject({ title: 'Opening', signal: 'opening', bodyStart: 0, bodyEnd: 2 });
    expect(result.needsReview).toBe(true);
  });
});

describe('classifySectionTitle', () => {
  it.each([
    ['Chapter Five', 'chapter', 'chapter', true],
    ['Chapter One: Arrival', 'chapter', 'chapter', true],
    ['Prologue: The Fall', 'frontMatter', 'prologue', false],
    ['Table of Contents', 'frontMatter', 'contents', false],
    ['Acknowledgements', 'backMatter', 'acknowledgments', false],
    ["Author's Note", 'backMatter', 'note', false],
    ['Also by A. Writer', 'backMatter', 'alsoBy', false],
    ['The Long Road Home', 'chapter', 'chapter', true],
  ])('%s → %s/%s', (title, kind, role, numbered) => {
    expect(classifySectionTitle(title)).toEqual({ kind, role, numbered });
  });
});
