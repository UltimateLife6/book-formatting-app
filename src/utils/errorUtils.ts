import { CustomError, ErrorType } from '../types/errors';

// File validation errors
export const validateFileType = (file: File, allowedTypes: string[]): CustomError | null => {
  if (!allowedTypes.includes(file.type)) {
    return new CustomError(
      ErrorType.FILE_UPLOAD,
      `Invalid file type: ${file.type}`,
      `Please upload a file with one of these formats: ${allowedTypes.join(', ')}`,
      false,
      'INVALID_FILE_TYPE',
      { fileName: file.name, fileType: file.type, allowedTypes }
    );
  }
  return null;
};

export const validateFileSize = (file: File, maxSizeMB: number): CustomError | null => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return new CustomError(
      ErrorType.FILE_UPLOAD,
      `File too large: ${file.size} bytes`,
      `File size must be less than ${maxSizeMB}MB`,
      false,
      'FILE_TOO_LARGE',
      { fileName: file.name, fileSize: file.size, maxSize: maxSizeBytes }
    );
  }
  return null;
};

// Network error handling
export const handleNetworkError = (error: any): CustomError => {
  if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
    return new CustomError(
      ErrorType.NETWORK,
      error.message || 'Network error occurred',
      'Unable to connect to the server. Please check your internet connection and try again.',
      true,
      'NETWORK_ERROR'
    );
  }

  if (error.response?.status === 404) {
    return new CustomError(
      ErrorType.NETWORK,
      'Resource not found',
      'The requested resource was not found. Please try again.',
      false,
      'NOT_FOUND',
      { status: 404 }
    );
  }

  if (error.response?.status === 403) {
    return new CustomError(
      ErrorType.PERMISSION,
      'Access denied',
      'You do not have permission to perform this action.',
      false,
      'FORBIDDEN',
      { status: 403 }
    );
  }

  if (error.response?.status === 401) {
    return new CustomError(
      ErrorType.AUTHENTICATION,
      'Authentication required',
      'Please log in to continue.',
      false,
      'UNAUTHORIZED',
      { status: 401 }
    );
  }

  if (error.response?.status >= 500) {
    return new CustomError(
      ErrorType.NETWORK,
      'Server error',
      'The server is experiencing issues. Please try again later.',
      true,
      'SERVER_ERROR',
      { status: error.response.status }
    );
  }

  return new CustomError(
    ErrorType.NETWORK,
    error.message || 'Unknown network error',
    'An error occurred while communicating with the server. Please try again.',
    true,
    'UNKNOWN_NETWORK_ERROR'
  );
};

// File processing errors
export const handleFileProcessingError = (error: any, fileName?: string): CustomError => {
  if (error.message?.includes('corrupted') || error.message?.includes('invalid')) {
    return new CustomError(
      ErrorType.FILE_PROCESSING,
      error.message,
      'The file appears to be corrupted or in an invalid format. Please try a different file.',
      false,
      'CORRUPTED_FILE',
      { fileName }
    );
  }

  if (error.message?.includes('password') || error.message?.includes('encrypted')) {
    return new CustomError(
      ErrorType.FILE_PROCESSING,
      error.message,
      'This file is password protected. Please remove the password and try again.',
      false,
      'PASSWORD_PROTECTED',
      { fileName }
    );
  }

  return new CustomError(
    ErrorType.FILE_PROCESSING,
    error.message || 'File processing failed',
    'Unable to process the file. Please check the file format and try again.',
    false,
    'PROCESSING_ERROR',
    { fileName }
  );
};

// Export errors
export const handleExportError = (error: any, format: string): CustomError => {
  if (error.message?.includes('memory') || error.message?.includes('too large')) {
    return new CustomError(
      ErrorType.EXPORT,
      error.message,
      'The document is too large to export. Please try reducing the content or splitting it into smaller sections.',
      false,
      'EXPORT_TOO_LARGE',
      { format }
    );
  }

  if (error.message?.includes('timeout')) {
    return new CustomError(
      ErrorType.EXPORT,
      error.message,
      'Export is taking too long. Please try again with a smaller document.',
      true,
      'EXPORT_TIMEOUT',
      { format }
    );
  }

  return new CustomError(
    ErrorType.EXPORT,
    error.message || 'Export failed',
    `Unable to export as ${format.toUpperCase()}. Please try again.`,
    true,
    'EXPORT_ERROR',
    { format }
  );
};

// Validation errors
export const validateRequired = (value: any, fieldName: string): CustomError | null => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return new CustomError(
      ErrorType.VALIDATION,
      `${fieldName} is required`,
      `${fieldName} is required`,
      false,
      'REQUIRED_FIELD',
      { field: fieldName }
    );
  }
  return null;
};

export const validateEmail = (email: string): CustomError | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid email format',
      'Please enter a valid email address',
      false,
      'INVALID_EMAIL',
      { field: 'email' }
    );
  }
  return null;
};

export const validateNumber = (value: any, fieldName: string, min?: number, max?: number): CustomError | null => {
  const num = Number(value);
  if (isNaN(num)) {
    return new CustomError(
      ErrorType.VALIDATION,
      `${fieldName} must be a number`,
      `${fieldName} must be a valid number`,
      false,
      'INVALID_NUMBER',
      { field: fieldName }
    );
  }

  if (min !== undefined && num < min) {
    return new CustomError(
      ErrorType.VALIDATION,
      `${fieldName} must be at least ${min}`,
      `${fieldName} must be at least ${min}`,
      false,
      'NUMBER_TOO_SMALL',
      { field: fieldName, min }
    );
  }

  if (max !== undefined && num > max) {
    return new CustomError(
      ErrorType.VALIDATION,
      `${fieldName} must be at most ${max}`,
      `${fieldName} must be at most ${max}`,
      false,
      'NUMBER_TOO_LARGE',
      { field: fieldName, max }
    );
  }

  return null;
};
