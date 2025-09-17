import { useCallback } from 'react';
import { CustomError, ErrorType, getErrorMessage } from '../types/errors';

interface ErrorHandlerOptions {
  showToast?: boolean;
  logError?: boolean;
  fallbackMessage?: string;
}

export const useErrorHandler = () => {
  const handleError = useCallback((
    error: unknown,
    options: ErrorHandlerOptions = {}
  ): CustomError => {
    const {
      showToast = true,
      logError = true,
      fallbackMessage = 'An unexpected error occurred'
    } = options;

    let customError: CustomError;

    if (error instanceof CustomError) {
      customError = error;
    } else if (error instanceof Error) {
      // Convert generic errors to CustomError
      customError = new CustomError(
        ErrorType.UNKNOWN,
        error.message,
        getErrorMessage(error),
        false
      );
    } else {
      // Handle unknown error types
      customError = new CustomError(
        ErrorType.UNKNOWN,
        String(error),
        fallbackMessage,
        false
      );
    }

    // Log error if enabled
    if (logError) {
      console.error('Error handled:', {
        type: customError.type,
        message: customError.message,
        userMessage: customError.userMessage,
        details: customError.details,
        timestamp: customError.timestamp,
      });
    }

    // Show toast notification if enabled
    if (showToast) {
      // You can integrate with a toast library here
      // For now, we'll use a simple alert in development
      if (process.env.NODE_ENV === 'development') {
        alert(`Error: ${customError.userMessage}`);
      }
    }

    return customError;
  }, []);

  const createNetworkError = useCallback((
    message: string,
    userMessage: string = 'Network error. Please check your connection and try again.',
    retryable: boolean = true
  ) => {
    return new CustomError(ErrorType.NETWORK, message, userMessage, retryable);
  }, []);

  const createValidationError = useCallback((
    message: string,
    userMessage: string,
    field?: string
  ) => {
    return new CustomError(
      ErrorType.VALIDATION,
      message,
      userMessage,
      false,
      'VALIDATION_ERROR',
      { field }
    );
  }, []);

  const createFileUploadError = useCallback((
    message: string,
    userMessage: string,
    fileName?: string
  ) => {
    return new CustomError(
      ErrorType.FILE_UPLOAD,
      message,
      userMessage,
      false,
      'FILE_UPLOAD_ERROR',
      { fileName }
    );
  }, []);

  const createFileProcessingError = useCallback((
    message: string,
    userMessage: string,
    fileName?: string
  ) => {
    return new CustomError(
      ErrorType.FILE_PROCESSING,
      message,
      userMessage,
      false,
      'FILE_PROCESSING_ERROR',
      { fileName }
    );
  }, []);

  const createExportError = useCallback((
    message: string,
    userMessage: string,
    format?: string
  ) => {
    return new CustomError(
      ErrorType.EXPORT,
      message,
      userMessage,
      false,
      'EXPORT_ERROR',
      { format }
    );
  }, []);

  return {
    handleError,
    createNetworkError,
    createValidationError,
    createFileUploadError,
    createFileProcessingError,
    createExportError,
  };
};
