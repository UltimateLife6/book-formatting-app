import {
  detectManuscriptChapters,
  detectManuscriptChaptersFromBlocks,
  isLikelyChapterHeadingLine,
  isStrongChapterHeadingLine,
  isChapterHeadingAt,
  parseMammothHtmlToBlocks,
  buildManuscriptStructureFromDocxHtml,
  type DocumentBlock,
} from '../chapterDetection';

describe('chapterDetection', () => {
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

  it('plain-text fallback splits titled chapter lines', () => {
    const text = [
      'Chapter 1',
      '',
      'Body.',
      '',
      'Chapter 2: Arrival',
      '',
      'Body.',
      '',
      'CHAPTER 3 — The Storm',
      '',
      'Body.',
    ].join('\n');
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(3);
    expect(ch.map((c) => c.title)).toEqual([
      'Chapter 1',
      'Chapter 2: Arrival',
      'CHAPTER 3 — The Storm',
    ]);
  });

  it('plain-text false positives do not create chapters', () => {
    const text = [
      'I started chapter 4 yesterday.',
      '',
      'This chapter explains the process.',
      '',
      'Chapter 4 was my favorite part.',
    ].join('\n');
    const ch = detectManuscriptChapters(text);
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Manuscript');
  });

  describe('structured DOCX blocks (Heading 1)', () => {
    it('splits five Heading 1 titles including subtitled chapters', () => {
      const blocks: DocumentBlock[] = [
        { kind: 'heading1', text: 'Chapter 1' },
        { kind: 'paragraph', text: 'First body.' },
        { kind: 'heading1', text: 'CHAPTER 2' },
        { kind: 'paragraph', text: 'Second body.' },
        { kind: 'heading1', text: 'Chapter 3: The Turning Road' },
        { kind: 'paragraph', text: 'Third body.' },
        { kind: 'heading1', text: 'CHAPTER 4 — A Quiet Signal' },
        { kind: 'paragraph', text: 'Fourth body.' },
        { kind: 'heading1', text: 'Chapter 5' },
        { kind: 'paragraph', text: 'Fifth body.' },
      ];
      const ch = detectManuscriptChaptersFromBlocks(blocks);
      expect(ch).toHaveLength(5);
      expect(ch.map((c) => c.title)).toEqual([
        'Chapter 1',
        'CHAPTER 2',
        'Chapter 3: The Turning Road',
        'CHAPTER 4 — A Quiet Signal',
        'Chapter 5',
      ]);
    });

    it('Heading 1 without the word Chapter still creates a chapter', () => {
      const blocks: DocumentBlock[] = [
        { kind: 'heading1', text: 'The Long Road Home' },
        { kind: 'paragraph', text: 'She walked until dusk.' },
      ];
      const ch = detectManuscriptChaptersFromBlocks(blocks);
      expect(ch).toHaveLength(1);
      expect(ch[0].title).toBe('The Long Road Home');
      expect(ch[0].body).toContain('She walked until dusk.');
      expect(ch[0].isNumbered).toBe(false);
    });

    it('Heading 1 matching Chapter regex creates exactly one chapter (no duplicate)', () => {
      const blocks: DocumentBlock[] = [
        { kind: 'heading1', text: 'Chapter 1' },
        { kind: 'paragraph', text: 'Only once.' },
      ];
      const ch = detectManuscriptChaptersFromBlocks(blocks);
      expect(ch).toHaveLength(1);
      expect(ch[0].title).toBe('Chapter 1');
    });

    it('preserves separate Word paragraphs in chapter body', () => {
      const blocks: DocumentBlock[] = [
        { kind: 'heading1', text: 'Chapter 1' },
        { kind: 'paragraph', text: 'First paragraph.' },
        { kind: 'paragraph', text: 'Second paragraph.' },
        { kind: 'heading1', text: 'Chapter 2' },
        { kind: 'paragraph', text: 'Third paragraph.' },
      ];
      const ch = detectManuscriptChaptersFromBlocks(blocks);
      expect(ch).toHaveLength(2);
      expect(ch[0].body).toBe('First paragraph.\n\nSecond paragraph.');
      expect(ch[1].body).toBe('Third paragraph.');
    });

    it('classifies Prologue / Epilogue Heading 1 as front/back matter', () => {
      const blocks: DocumentBlock[] = [
        { kind: 'heading1', text: 'Prologue' },
        { kind: 'paragraph', text: 'Before.' },
        { kind: 'heading1', text: 'Chapter 1' },
        { kind: 'paragraph', text: 'Main.' },
        { kind: 'heading1', text: 'Epilogue' },
        { kind: 'paragraph', text: 'After.' },
      ];
      const ch = detectManuscriptChaptersFromBlocks(blocks);
      expect(ch.map((c) => c.type)).toEqual(['frontMatter', 'chapter', 'backMatter']);
    });
  });

  describe('Mammoth HTML parsing', () => {
    it('parses h1 and p tags into blocks and builds five chapters', () => {
      const html = [
        '<h1>Chapter 1</h1><p>First paragraph.</p><p>Second paragraph.</p>',
        '<h1>CHAPTER 2</h1><p>A.</p>',
        '<h1>Chapter 3: The Turning Road</h1><p>B.</p>',
        '<h1>CHAPTER 4 — A Quiet Signal</h1><p>C.</p>',
        '<h1>Chapter 5</h1><p>D.</p>',
      ].join('');
      const blocks = parseMammothHtmlToBlocks(html);
      expect(blocks.filter((b) => b.kind === 'heading1')).toHaveLength(5);
      const built = buildManuscriptStructureFromDocxHtml(html);
      expect(built.manuscript.chapters).toHaveLength(5);
      expect(built.manuscript.chapters.map((c) => c.title)).toEqual([
        'Chapter 1',
        'CHAPTER 2',
        'Chapter 3: The Turning Road',
        'CHAPTER 4 — A Quiet Signal',
        'Chapter 5',
      ]);
      expect(built.manuscript.chapters[0].body).toBe('First paragraph.\n\nSecond paragraph.');
    });
  });
});
