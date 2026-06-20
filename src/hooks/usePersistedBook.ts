import { useEffect, useRef } from 'react';
import type { BookState } from '../context/BookContext';
import { saveBook } from '../lib/storage/bookStorage';

const AUTOSAVE_DEBOUNCE_MS = 750;

/**
 * Debounced auto-save with flush on tab hide / page unload so reload rarely loses edits.
 */
export function usePersistedBook(state: BookState): void {
  const skipFirstSave = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const persistSnapshot = (bookState: BookState) => {
    saveBook({
      book: bookState.book,
      currentStep: bookState.currentStep,
    });
  };

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      persistSnapshot(stateRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [state]);

  useEffect(() => {
    const flush = () => persistSnapshot(stateRef.current);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };

    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
