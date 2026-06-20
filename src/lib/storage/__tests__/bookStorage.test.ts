import type { BookData } from '../../../context/BookContext';
import {
  BOOK_STORAGE_KEY,
  BOOK_STORAGE_VERSION,
  clearBook,
  hasMeaningfulBookContent,
  loadBook,
  mergePersistedBook,
  saveBook,
} from '../bookStorage';

const emptyBook = (): BookData =>
  ({
    title: '',
    author: '',
    genre: 'fiction',
    content: '',
    template: 'classic',
    pageSize: {
      trimSize: null,
      unit: 'inches',
      gutter: 0.25,
      isAdvanced: false,
    },
    metadata: {},
    formatting: {
      fontSize: 12,
      lineHeight: 1.5,
      fontFamily: 'Times New Roman',
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1,
      marginRight: 1,
      paragraphIndent: 0.5,
      chapterHeading: {
        fontFamily: 'Times New Roman',
        align: 'center',
        style: 'normal',
        sizePt: 18,
        widthPercent: 100,
        numberView: 'chapter-number',
      },
      chapterTitle: {
        fontFamily: 'Times New Roman',
        align: 'center',
        style: 'normal',
        sizePt: 18,
        widthPercent: 100,
      },
      chapterSubtitle: {
        fontFamily: 'Times New Roman',
        align: 'center',
        style: 'italic',
        sizePt: 14,
        widthPercent: 100,
      },
    },
    chapters: [],
    manuscript: {
      frontMatter: [],
      parts: [],
      chapters: [],
      backMatter: [],
    },
  }) as BookData;

describe('bookStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips save and load', () => {
    const book = emptyBook();
    book.title = 'My Novel';
    book.author = 'Ada Author';
    book.manuscript.chapters = [
      {
        id: 'ch-1',
        title: 'Chapter One',
        body: 'Once upon a time.',
        isNumbered: true,
        startOnRightPage: false,
        type: 'chapter',
      },
    ];

    const result = saveBook({ book, currentStep: 2 });
    expect(result.ok).toBe(true);

    const loaded = loadBook();
    expect(loaded).not.toBeNull();
    expect(loaded?.book.title).toBe('My Novel');
    expect(loaded?.book.manuscript.chapters).toHaveLength(1);
    expect(loaded?.currentStep).toBe(2);
    expect(loaded?.version).toBe(BOOK_STORAGE_VERSION);
  });

  it('mergePersistedBook fills missing nested formatting fields', () => {
    const defaults = emptyBook();
    const saved = emptyBook();
    saved.formatting = {
      ...saved.formatting,
      fontSize: 14,
      chapterHeading: undefined as unknown as typeof saved.formatting.chapterHeading,
    };

    const merged = mergePersistedBook(defaults, saved);
    expect(merged.formatting.fontSize).toBe(14);
    expect(merged.formatting.chapterHeading.numberView).toBe('chapter-number');
  });

  it('clearBook removes persisted snapshot', () => {
    saveBook({ book: emptyBook(), currentStep: 0 });
    clearBook();
    expect(loadBook()).toBeNull();
  });

  it('loadBook returns null for corrupt JSON', () => {
    localStorage.setItem(BOOK_STORAGE_KEY, '{not json');
    expect(loadBook()).toBeNull();
  });

  it('loadBook returns null for wrong schema version', () => {
    localStorage.setItem(
      BOOK_STORAGE_KEY,
      JSON.stringify({ version: 999, book: emptyBook(), currentStep: 0 })
    );
    expect(loadBook()).toBeNull();
  });

  it('hasMeaningfulBookContent detects manuscript text', () => {
    const book = emptyBook();
    expect(hasMeaningfulBookContent(book)).toBe(false);
    book.manuscript.chapters = [
      {
        id: 'x',
        title: 'T',
        body: 'Words',
        isNumbered: true,
        startOnRightPage: false,
        type: 'chapter',
      },
    ];
    expect(hasMeaningfulBookContent(book)).toBe(true);
  });
});
