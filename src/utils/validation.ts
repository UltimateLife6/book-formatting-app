// Input validation and sanitization utilities
import { CustomError, ErrorType } from '../types/errors';

// Text sanitization
export const sanitizeText = (text: string): string => {
  return text
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags completely
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/\s+/g, ' '); // Normalize whitespace
};

// Email validation
export const validateEmail = (email: string): CustomError | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid email format',
      'Please enter a valid email address',
      false,
      'INVALID_EMAIL',
      { email }
    );
  }
  return null;
};

// Password validation
export const validatePassword = (password: string): CustomError | null => {
  if (password.length < 8) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Password too short',
      'Password must be at least 8 characters long',
      false,
      'PASSWORD_TOO_SHORT',
      { minLength: 8, actualLength: password.length }
    );
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Password missing lowercase letter',
      'Password must contain at least one lowercase letter',
      false,
      'PASSWORD_MISSING_LOWERCASE'
    );
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Password missing uppercase letter',
      'Password must contain at least one uppercase letter',
      false,
      'PASSWORD_MISSING_UPPERCASE'
    );
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Password missing number',
      'Password must contain at least one number',
      false,
      'PASSWORD_MISSING_NUMBER'
    );
  }
  
  return null;
};

// Book title validation
export const validateBookTitle = (title: string): CustomError | null => {
  const sanitized = sanitizeText(title);
  
  if (!sanitized || sanitized.length === 0) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Book title is required',
      'Please enter a book title',
      false,
      'TITLE_REQUIRED'
    );
  }
  
  if (sanitized.length < 1) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Book title too short',
      'Book title must be at least 1 character long',
      false,
      'TITLE_TOO_SHORT',
      { minLength: 1, actualLength: sanitized.length }
    );
  }
  
  if (sanitized.length > 200) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Book title too long',
      'Book title must be less than 200 characters',
      false,
      'TITLE_TOO_LONG',
      { maxLength: 200, actualLength: sanitized.length }
    );
  }
  
  return null;
};

// Author name validation
export const validateAuthorName = (name: string): CustomError | null => {
  const sanitized = sanitizeText(name);
  
  if (!sanitized || sanitized.length === 0) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Author name is required',
      'Please enter an author name',
      false,
      'AUTHOR_REQUIRED'
    );
  }
  
  if (sanitized.length < 2) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Author name too short',
      'Author name must be at least 2 characters long',
      false,
      'AUTHOR_TOO_SHORT',
      { minLength: 2, actualLength: sanitized.length }
    );
  }
  
  if (sanitized.length > 100) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Author name too long',
      'Author name must be less than 100 characters',
      false,
      'AUTHOR_TOO_LONG',
      { maxLength: 100, actualLength: sanitized.length }
    );
  }
  
  // Check for valid characters (letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\s\-']+$/.test(sanitized)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid author name format',
      'Author name can only contain letters, spaces, hyphens, and apostrophes',
      false,
      'AUTHOR_INVALID_CHARS'
    );
  }
  
  return null;
};

// ISBN validation
export const validateISBN = (isbn: string): CustomError | null => {
  if (!isbn || isbn.trim().length === 0) {
    return null; // ISBN is optional
  }
  
  const cleaned = isbn.replace(/[-\s]/g, '');
  
  // Check for ISBN-10 or ISBN-13
  if (cleaned.length === 10) {
    return validateISBN10(cleaned);
  } else if (cleaned.length === 13) {
    return validateISBN13(cleaned);
  } else {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid ISBN length',
      'ISBN must be 10 or 13 digits long',
      false,
      'ISBN_INVALID_LENGTH',
      { length: cleaned.length }
    );
  }
};

const validateISBN10 = (isbn: string): CustomError | null => {
  if (!/^\d{9}[\dX]$/.test(isbn)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid ISBN-10 format',
      'ISBN-10 must be 9 digits followed by a digit or X',
      false,
      'ISBN10_INVALID_FORMAT'
    );
  }
  
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(isbn[i]) * (10 - i);
  }
  const checkDigit = isbn[9] === 'X' ? 10 : parseInt(isbn[9]);
  const remainder = (sum + checkDigit) % 11;
  
  if (remainder !== 0) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid ISBN-10 check digit',
      'The ISBN-10 check digit is incorrect',
      false,
      'ISBN10_INVALID_CHECK'
    );
  }
  
  return null;
};

const validateISBN13 = (isbn: string): CustomError | null => {
  if (!/^\d{13}$/.test(isbn)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid ISBN-13 format',
      'ISBN-13 must be 13 digits',
      false,
      'ISBN13_INVALID_FORMAT'
    );
  }
  
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  if (parseInt(isbn[12]) !== checkDigit) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid ISBN-13 check digit',
      'The ISBN-13 check digit is incorrect',
      false,
      'ISBN13_INVALID_CHECK'
    );
  }
  
  return null;
};

// URL validation
export const validateURL = (url: string): CustomError | null => {
  if (!url || url.trim().length === 0) {
    return null; // URL is optional
  }
  
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return new CustomError(
        ErrorType.VALIDATION,
        'Invalid URL protocol',
        'URL must use http or https protocol',
        false,
        'INVALID_URL_PROTOCOL',
        { url }
      );
    }
    return null;
  } catch {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid URL format',
      'Please enter a valid URL',
      false,
      'INVALID_URL',
      { url }
    );
  }
};

// Form validation helper
export const validateForm = (data: Record<string, any>, rules: Record<string, (value: any) => CustomError | null>): CustomError | null => {
  for (const [field, validator] of Object.entries(rules)) {
    const error = validator(data[field]);
    if (error) {
      return error;
    }
  }
  return null;
};
