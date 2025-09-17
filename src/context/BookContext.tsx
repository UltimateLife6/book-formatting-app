import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export interface BookData {
  title: string;
  author: string;
  genre: string;
  content: string;
  template: string;
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
  };
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  pageNumber?: number;
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
  | { type: 'REMOVE_CHAPTER'; payload: string };

const initialState: BookState = {
  book: {
    title: '',
    author: '',
    genre: 'fiction',
    content: '',
    template: 'classic',
    metadata: {},
    formatting: {
      fontSize: 12,
      lineHeight: 1.5,
      fontFamily: 'Times New Roman',
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1,
      marginRight: 1,
    },
    chapters: [],
  },
  currentStep: 0,
  isProcessing: false,
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
    case 'ADD_CHAPTER':
      return {
        ...state,
        book: {
          ...state.book,
          chapters: [...state.book.chapters, action.payload],
        },
      };
    case 'UPDATE_CHAPTER':
      return {
        ...state,
        book: {
          ...state.book,
          chapters: state.book.chapters.map((chapter) =>
            chapter.id === action.payload.id
              ? { ...chapter, ...action.payload.updates }
              : chapter
          ),
        },
      };
    case 'REMOVE_CHAPTER':
      return {
        ...state,
        book: {
          ...state.book,
          chapters: state.book.chapters.filter(
            (chapter) => chapter.id !== action.payload
          ),
        },
      };
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
