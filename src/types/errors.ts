export enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_PROCESSING = 'FILE_PROCESSING',
  EXPORT = 'EXPORT',
  AUTHENTICATION = 'AUTHENTICATION',
  PERMISSION = 'PERMISSION',
  UNKNOWN = 'UNKNOWN'
}

export interface AppError {
  type: ErrorType;
  message: string;
  code?: string;
  details?: any;
  timestamp: Date;
  userMessage: string;
  retryable: boolean;
}

export class CustomError extends Error {
  public type: ErrorType;
  public code?: string;
  public details?: any;
  public userMessage: string;
  public retryable: boolean;
  public timestamp: Date;

  constructor(
    type: ErrorType,
    message: string,
    userMessage: string,
    retryable: boolean = false,
    code?: string,
    details?: any
  ) {
    super(message);
    this.name = 'CustomError';
    this.type = type;
    this.userMessage = userMessage;
    this.retryable = retryable;
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }
}

export const createError = (
  type: ErrorType,
  message: string,
  userMessage: string,
  retryable: boolean = false,
  code?: string,
  details?: any
): AppError => ({
  type,
  message,
  userMessage,
  retryable,
  code,
  details,
  timestamp: new Date()
});

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof CustomError) {
    return error.userMessage;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred. Please try again.';
};

export const isRetryableError = (error: unknown): boolean => {
  if (error instanceof CustomError) {
    return error.retryable;
  }
  
  // Network errors are typically retryable
  if (error instanceof Error && error.message.includes('network')) {
    return true;
  }
  
  return false;
};
