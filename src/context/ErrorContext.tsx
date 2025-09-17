import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CustomError } from '../types/errors';
import ErrorToast from '../components/ErrorToast';

interface ErrorContextType {
  showError: (error: CustomError) => void;
  clearError: () => void;
  currentError: CustomError | null;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [currentError, setCurrentError] = useState<CustomError | null>(null);

  const showError = useCallback((error: CustomError) => {
    setCurrentError(error);
  }, []);

  const clearError = useCallback(() => {
    setCurrentError(null);
  }, []);

  const handleRetry = useCallback(() => {
    // This would be implemented based on the specific error type
    // For now, we'll just clear the error
    clearError();
  }, [clearError]);

  return (
    <ErrorContext.Provider value={{ showError, clearError, currentError }}>
      {children}
      <ErrorToast
        error={currentError}
        onClose={clearError}
        onRetry={currentError?.retryable ? handleRetry : undefined}
      />
    </ErrorContext.Provider>
  );
};

export const useError = (): ErrorContextType => {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};
