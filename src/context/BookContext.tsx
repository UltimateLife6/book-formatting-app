import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Trim size presets
export interface TrimSize {
  id: string;
  width: number; // in inches
  height: number; // in inches
  name: string;
  description: string;
  commonFor?: string[]; // Genres this size is common for
}

export interface PageSizeSettings {
  trimSize: TrimSize | null; // null for eBooks
  unit: 'inches' | 'millimeters';
  customWidth?: number; // For advanced mode
  customHeight?: number; // For advanced mode
  gutter: number; // Binding gutter in inches
  bleed?: number; // Bleed in inches (advanced only)
  isAdvanced: boolean; // Whether advanced mode is enabled
}

// Chapter heading style types
export type ChapterAlign = 'left' | 'center' | 'right';
export type ChapterTextStyle = 'normal' | 'italic' | 'bold' | 'bold-italic' | 'small-caps';
export type ChapterNumberView = 'none' | 'number' | 'chapter-number' | 'roman' | 'custom';

export interface ChapterHeadingStyle {
  fontFamily: string;
  align: ChapterAlign;
  style: ChapterTextStyle;
  sizePt: number;
  widthPercent: number; // 40 - 100
  numberView: ChapterNumberView;
  customPrefix?: string; // used when numberView === 'custom'
  subtitleItalic?: boolean; // whether subtitle should be italic
  subtitleBold?: boolean; // whether subtitle should be bold
}

export interface ChapterTitleStyle {
  fontFamily: string;
  align: ChapterAlign;
  style: ChapterTextStyle;
  sizePt: number;
  widthPercent: number; // 40 - 100
}

export interface ChapterSubtitleStyle {
  fontFamily: string;
  align: ChapterAlign;
  style: ChapterTextStyle;
  sizePt: number;
  widthPercent: number; // 40 - 100
}

export interface BookData {
  title: string;
  author: string;
  genre: string;
  content: string; // Legacy field - kept for backward compatibility
  template: string;
  pageSize: PageSizeSettings; // Print page size settings
  metadata: {
    isbn?: string;
    publisher?: string;
    publicationDate?: string;
    description?: string;
  };
  formatting: {
    fontSize: number;
    lineHeight: number;
    fontFamily: string;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    paragraphIndent: number;
    chapterTitleStyle?: 'classic' | 'modern' | 'minimal' | 'ornate';
    useDropCaps?: boolean;
    useSmallCaps?: boolean;
    chapterHeading: ChapterHeadingStyle;
    chapterTitle: ChapterTitleStyle;
    chapterSubtitle: ChapterSubtitleStyle;
  };
  chapters: Chapter[]; // Legacy - kept for compatibility
  manuscript: ManuscriptStructure; // New Atticus-style structure
}

// Atticus-style Chapter model
export interface Chapter {
  id: string;
  title: string;
  subtitle?: string;
  body: string; // Rich text or markdown content (primary field)
  content?: string; // Legacy field - kept for backward compatibility, maps to body
  chapterNumber?: number; // Auto-calculated based on position
  isNumbered: boolean; // false for Prologue/Epilogue
  startOnRightPage: boolean;
  metadata?: {
    authorNotes?: string;
    version?: string;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: any;
  };
  type: 'chapter' | 'frontMatter' | 'backMatter';
  partId?: string; // If chapter belongs to a Part
}

// Part grouping (e.g., "Part I: The Beginning")
export interface Part {
  id: string;
  title: string;
  subtitle?: string;
  chapterIds: string[]; // Ordered list of chapter IDs
}

// Manuscript structure
export interface ManuscriptStructure {
  frontMatter: Chapter[]; // Prologue, Dedication, etc.
  parts: Part[]; // Optional parts grouping
  chapters: Chapter[]; // Main chapters
  backMatter: Chapter[]; // Epilogue, Acknowledgments, etc.
}

interface BookState {
  book: BookData;
  currentStep: number;
  isProcessing: boolean;
}

type BookAction =
  | { type: 'SET_BOOK'; payload: Partial<BookData> }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'ADD_CHAPTER'; payload: Chapter }
  | { type: 'UPDATE_CHAPTER'; payload: { id: string; updates: Partial<Chapter> } }
  | { type: 'REMOVE_CHAPTER'; payload: string }
  | { type: 'REORDER_CHAPTERS'; payload: { sourceIndex: number; destinationIndex: number } }
  | { type: 'ADD_PART'; payload: Part }
  | { type: 'UPDATE_PART'; payload: { id: string; updates: Partial<Part> } }
  | { type: 'REMOVE_PART'; payload: string }
  | { type: 'MOVE_CHAPTER_TO_PART'; payload: { chapterId: string; partId: string | null } }
  | { type: 'SET_MANUSCRIPT_STRUCTURE'; payload: ManuscriptStructure };

// Default trim size presets
export const TRIM_SIZE_PRESETS: TrimSize[] = [
  {
    id: '5x8',
    width: 5,
    height: 8,
    name: '5 × 8 in',
    description: 'Compact paperback, great for shorter works',
    commonFor: ['poetry', 'short-stories'],
  },
  {
    id: '5.25x8',
    width: 5.25,
    height: 8,
    name: '5.25 × 8 in',
    description: 'Slightly wider than standard, good readability',
    commonFor: ['fiction', 'mystery'],
  },
  {
    id: '5.5x8.5',
    width: 5.5,
    height: 8.5,
    name: '5.5 × 8.5 in',
    description: 'Trade paperback size, comfortable reading',
    commonFor: ['fiction', 'nonfiction'],
  },
  {
    id: '6x9',
    width: 6,
    height: 9,
    name: '6 × 9 in',
    description: 'Most common paperback size on Amazon (default for fiction)',
    commonFor: ['fiction', 'romance', 'fantasy', 'thriller'],
  },
  {
    id: '7x10',
    width: 7,
    height: 10,
    name: '7 × 10 in',
    description: 'Larger format for nonfiction guides and workbooks',
    commonFor: ['nonfiction', 'academic', 'biography'],
  },
  {
    id: '8.5x11',
    width: 8.5,
    height: 11,
    name: '8.5 × 11 in',
    description: 'Standard workbook size, perfect for guides and manuals',
    commonFor: ['nonfiction', 'academic'],
  },
];

// Get default trim size based on genre
export const getDefaultTrimSizeForGenre = (genre: string): TrimSize => {
  const genreLower = genre.toLowerCase();
  
  // Fiction genres default to 6x9
  if (['fiction', 'romance', 'fantasy', 'mystery', 'thriller', 'sci-fi'].includes(genreLower)) {
    return TRIM_SIZE_PRESETS.find(p => p.id === '6x9')!;
  }
  
  // Poetry defaults to smaller size
  if (genreLower === 'poetry') {
    return TRIM_SIZE_PRESETS.find(p => p.id === '5x8')!;
  }
  
  // Nonfiction defaults to larger size
  if (['nonfiction', 'academic', 'biography'].includes(genreLower)) {
    return TRIM_SIZE_PRESETS.find(p => p.id === '7x10')!;
  }
  
  // Default to 6x9
  return TRIM_SIZE_PRESETS.find(p => p.id === '6x9')!;
};

// Calculate automatic margins based on trim size
export const calculateAutoMargins = (trimSize: TrimSize | null, pageCount: number = 0): {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gutter: number;
} => {
  if (!trimSize) {
    // Default margins for eBooks
    return {
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1,
      marginRight: 1,
      gutter: 0,
    };
  }
  
  // Base margins (in inches)
  const baseMargin = 0.75;
  const topMargin = 0.75;
  const bottomMargin = 1; // Extra space for page numbers
  
  // Calculate gutter based on page count
  // More pages = larger gutter needed for binding
  let gutter = 0.25; // Base gutter
  if (pageCount > 200) gutter = 0.375;
  if (pageCount > 400) gutter = 0.5;
  
  // Adjust margins based on trim size
  // Smaller books need smaller margins
  const sizeFactor = Math.min(trimSize.width, trimSize.height) / 6; // Normalize to 6x9
  
  return {
    marginTop: topMargin * sizeFactor,
    marginBottom: bottomMargin * sizeFactor,
    marginLeft: (baseMargin + gutter) * sizeFactor, // Left margin includes gutter
    marginRight: baseMargin * sizeFactor,
    gutter,
  };
};

const initialState: BookState = {
  book: {
    title: '',
    author: '',
    genre: 'fiction',
    content: '',
    template: 'classic',
    pageSize: {
      trimSize: getDefaultTrimSizeForGenre('fiction'),
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
      chapterTitleStyle: 'classic',
      useDropCaps: false,
      useSmallCaps: false,
      chapterHeading: {
        fontFamily: 'Times New Roman',
        align: 'center',
        style: 'normal',
        sizePt: 18,
        widthPercent: 100,
        numberView: 'chapter-number',
        customPrefix: 'Chapter',
        subtitleItalic: true,
        subtitleBold: false,
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
  },
  currentStep: 0,
  isProcessing: false,
};

// Helper function to recalculate chapter numbers
const recalculateChapterNumbers = (chapters: Chapter[]): Chapter[] => {
  let chapterNumber = 1;
  return chapters.map((chapter) => {
    if (chapter.isNumbered && chapter.type === 'chapter') {
      return { ...chapter, chapterNumber: chapterNumber++ };
    }
    return chapter;
  });
};

// Helper to get all chapters from manuscript structure
const getAllChapters = (manuscript: ManuscriptStructure): Chapter[] => {
  const allChapters: Chapter[] = [];
  
  // Front matter
  allChapters.push(...manuscript.frontMatter);
  
  // Parts and their chapters
  manuscript.parts.forEach(part => {
    part.chapterIds.forEach(chapterId => {
      const chapter = manuscript.chapters.find(c => c.id === chapterId);
      if (chapter) allChapters.push(chapter);
    });
  });
  
  // Standalone chapters (not in parts)
  const chaptersInParts = new Set(
    manuscript.parts.flatMap(part => part.chapterIds)
  );
  allChapters.push(
    ...manuscript.chapters.filter(c => !chaptersInParts.has(c.id))
  );
  
  // Back matter
  allChapters.push(...manuscript.backMatter);
  
  return allChapters;
};

const bookReducer = (state: BookState, action: BookAction): BookState => {
  switch (action.type) {
    case 'SET_BOOK':
      return {
        ...state,
        book: { ...state.book, ...action.payload },
      };
    case 'SET_STEP':
      return {
        ...state,
        currentStep: action.payload,
      };
    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload,
      };
    case 'SET_MANUSCRIPT_STRUCTURE':
      return {
        ...state,
        book: {
          ...state.book,
          manuscript: action.payload,
        },
      };
    case 'ADD_CHAPTER': {
      // Add to appropriate section based on type
      const manuscript = { ...state.book.manuscript };
      if (action.payload.type === 'frontMatter') {
        manuscript.frontMatter = [...manuscript.frontMatter, action.payload];
      } else if (action.payload.type === 'backMatter') {
        manuscript.backMatter = [...manuscript.backMatter, action.payload];
      } else {
        manuscript.chapters = recalculateChapterNumbers([...manuscript.chapters, action.payload]);
      }
      
      return {
        ...state,
        book: {
          ...state.book,
          chapters: [...state.book.chapters, action.payload], // Legacy support
          manuscript,
        },
      };
    }
    case 'UPDATE_CHAPTER': {
      const updateInSection = (chapters: Chapter[]) =>
        chapters.map((chapter) =>
          chapter.id === action.payload.id
            ? { ...chapter, ...action.payload.updates }
            : chapter
        );
      
      const manuscript = {
        frontMatter: updateInSection(state.book.manuscript.frontMatter),
        parts: state.book.manuscript.parts,
        chapters: recalculateChapterNumbers(updateInSection(state.book.manuscript.chapters)),
        backMatter: updateInSection(state.book.manuscript.backMatter),
      };
      
      return {
        ...state,
        book: {
          ...state.book,
          chapters: state.book.chapters.map((chapter) =>
            chapter.id === action.payload.id
              ? { ...chapter, ...action.payload.updates }
              : chapter
          ),
          manuscript,
        },
      };
    }
    case 'REMOVE_CHAPTER': {
      const removeFromSection = (chapters: Chapter[]) =>
        chapters.filter((chapter) => chapter.id !== action.payload);
      
      const manuscript = {
        frontMatter: removeFromSection(state.book.manuscript.frontMatter),
        parts: state.book.manuscript.parts.map(part => ({
          ...part,
          chapterIds: part.chapterIds.filter(id => id !== action.payload),
        })),
        chapters: recalculateChapterNumbers(removeFromSection(state.book.manuscript.chapters)),
        backMatter: removeFromSection(state.book.manuscript.backMatter),
      };
      
      return {
        ...state,
        book: {
          ...state.book,
          chapters: state.book.chapters.filter(
            (chapter) => chapter.id !== action.payload
          ),
          manuscript,
        },
      };
    }
    case 'REORDER_CHAPTERS': {
      const { sourceIndex, destinationIndex } = action.payload;
      const allChapters = getAllChapters(state.book.manuscript);
      const [moved] = allChapters.splice(sourceIndex, 1);
      allChapters.splice(destinationIndex, 0, moved);
      
      // Rebuild manuscript structure (simplified - assumes all in chapters section)
      const manuscript = {
        ...state.book.manuscript,
        chapters: recalculateChapterNumbers(allChapters.filter(c => c.type === 'chapter')),
      };
      
      return {
        ...state,
        book: {
          ...state.book,
          manuscript,
        },
      };
    }
    case 'ADD_PART':
      return {
        ...state,
        book: {
          ...state.book,
          manuscript: {
            ...state.book.manuscript,
            parts: [...state.book.manuscript.parts, action.payload],
          },
        },
      };
    case 'UPDATE_PART':
      return {
        ...state,
        book: {
          ...state.book,
          manuscript: {
            ...state.book.manuscript,
            parts: state.book.manuscript.parts.map((part) =>
              part.id === action.payload.id
                ? { ...part, ...action.payload.updates }
                : part
            ),
          },
        },
      };
    case 'REMOVE_PART':
      return {
        ...state,
        book: {
          ...state.book,
          manuscript: {
            ...state.book.manuscript,
            parts: state.book.manuscript.parts.filter(
              (part) => part.id !== action.payload
            ),
          },
        },
      };
    case 'MOVE_CHAPTER_TO_PART': {
      const { chapterId, partId } = action.payload;
      const manuscript = { ...state.book.manuscript };
      
      // Remove chapter from all parts
      manuscript.parts = manuscript.parts.map(part => ({
        ...part,
        chapterIds: part.chapterIds.filter(id => id !== chapterId),
      }));
      
      // Add to target part if specified
      if (partId) {
        manuscript.parts = manuscript.parts.map(part =>
          part.id === partId
            ? { ...part, chapterIds: [...part.chapterIds, chapterId] }
            : part
        );
      }
      
      return {
        ...state,
        book: {
          ...state.book,
          manuscript,
        },
      };
    }
    default:
      return state;
  }
};

const BookContext = createContext<{
  state: BookState;
  dispatch: React.Dispatch<BookAction>;
} | null>(null);

export const BookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(bookReducer, initialState);

  return (
    <BookContext.Provider value={{ state, dispatch }}>
      {children}
    </BookContext.Provider>
  );
};

export const useBook = () => {
  const context = useContext(BookContext);
  if (!context) {
    throw new Error('useBook must be used within a BookProvider');
  }
  return context;
};
