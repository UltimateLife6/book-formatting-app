import {
  detectManuscriptChapters,
  isLikelyChapterHeadingLine,
  isStrongChapterHeadingLine,
  isChapterHeadingAt,
} from '../chapterDetection';

describe('chapterDetection', () => {
  it('strong headings match without line context', () => {
    expect(isStrongChapterHeadingLine('Chapter 1')).toBe(true);
    expect(isStrongChapterHeadingLine('CHAPTER ONE')).toBe(true);
    expect(isStrongChapterHeadingLine('Chapter One')).toBe(true);
    expect(isStrongChapterHeadingLine('Prologue')).toBe(true);
    expect(isStrongChapterHeadingLine('Epilogue')).toBe(true);
  });

  it('isLikelyChapterHeadingLine without context is strong-only', () => {
    expect(isLikelyChapterHeadingLine('Chapter 1')).toBe(true);
    expect(isLikelyChapterHeadingLine('1.')).toBe(false);
    expect(isLikelyChapterHeadingLine('One')).toBe(false);
  });

  it('weak numeric with context: blank before and real body after', () => {
    const lines = ['Intro.', '', '1.', '', 'She opened the door.'];
    expect(isChapterHeadingAt(2, lines)).toBe(true);
    expect(isLikelyChapterHeadingLine('1.', 2, lines)).toBe(true);
  });

  it('weak numeric rejected when previous line is not blank', () => {
    const lines = ['Some text', '1.', 'Body'];
    expect(isChapterHeadingAt(1, lines)).toBe(false);
  });

  it('weak numeric rejected when next non-blank is another outline marker', () => {
    const lines = ['', '1.', '', '2.', '', 'Still outline'];
    expect(isChapterHeadingAt(1, lines)).toBe(false);
  });

  it('weak spelled rejected when chained with another weak marker', () => {
    const lines = ['', 'One', '', 'Two', '', 'Then narrative'];
    expect(isChapterHeadingAt(1, lines)).toBe(false);
  });

  it('weak spelled accepted with blank before and narrative after', () => {
    const lines = ['', 'One', '', 'The rain fell.'];
    expect(isChapterHeadingAt(1, lines)).toBe(true);
  });

  it('false positive: numbered list line "1. This is a list item"', () => {
    const text = 'Shopping list:\n1. This is a list item\n2. Another item';
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
  });

  it('false positive: outline bullets only', () => {
    const text = '\n1.\n\n2.\n\n3.\n\n';
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
  });

  it('false positive: decimal line 1.5 is not a heading', () => {
    const lines = ['', '1.5', 'More text'];
    expect(isChapterHeadingAt(1, lines)).toBe(false);
  });

  it('false positive: section reference "1. Introduction paragraph text"', () => {
    const text = 'See below.\n1. Introduction paragraph text continues here.';
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
  });

  it('false positive: dialogue line One followed by lowercase continuation', () => {
    const text = 'He stared.\n\nOne\nmust have known.';
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
  });

  it('false positive: multiple numbered bullets in an outline', () => {
    const text =
      'Agenda:\n1. First topic with long text\n2. Second topic here\n3. Third topic continues';
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
  });

  it('returns single Manuscript when no headings', () => {
    const text = 'Just some prose.\nNo headings here.';
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
    expect(ch[0].body).toContain('Just some prose');
  });

  it('splits on strong headings and preserves order', () => {
    const text = 'Intro line\nChapter 1\nFirst.\nCHAPTER TWO\nSecond.';
    const ch = detectManuscriptChapters(text);
    expect(ch.length).toBeGreaterThanOrEqual(2);
    expect(ch[0].title).toBe('Opening');
    expect(ch[0].body).toContain('Intro line');
    expect(ch.some((c) => c.title === 'Chapter 1')).toBe(true);
  });

  it('splits on standalone weak numeric when context is chapter-like', () => {
    const text = 'Note.\n\n2.\n\nThe next act began.';
    const ch = detectManuscriptChapters(text);
    expect(ch.some((c) => c.title === '2.')).toBe(true);
  });
});
