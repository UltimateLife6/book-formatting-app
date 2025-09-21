// Security utilities and best practices
import { CustomError, ErrorType } from '../types/errors';

// XSS Prevention
export const sanitizeHTML = (html: string): string => {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
};

// CSRF Token generation
export const generateCSRFToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Input sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/data:/gi, '') // Remove data: protocols
    .replace(/vbscript:/gi, '') // Remove vbscript: protocols
    .replace(/\s+/g, ' '); // Normalize whitespace
};

// File type validation
export const validateFileType = (file: File, allowedMimeTypes: string[]): boolean => {
  return allowedMimeTypes.includes(file.type);
};

// File size validation
export const validateFileSize = (file: File, maxSizeBytes: number): boolean => {
  return file.size <= maxSizeBytes;
};

// Secure file name validation
export const validateFileName = (fileName: string): CustomError | null => {
  // Check for path traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid file name',
      'File name contains invalid characters',
      false,
      'INVALID_FILE_NAME',
      { fileName }
    );
  }
  
  // Check for reserved names
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  const nameWithoutExt = fileName.split('.')[0].toUpperCase();
  
  if (reservedNames.includes(nameWithoutExt)) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Reserved file name',
      'File name is reserved and cannot be used',
      false,
      'RESERVED_FILE_NAME',
      { fileName }
    );
  }
  
  // Check length
  if (fileName.length > 255) {
    return new CustomError(
      ErrorType.VALIDATION,
      'File name too long',
      'File name must be less than 255 characters',
      false,
      'FILE_NAME_TOO_LONG',
      { fileName, maxLength: 255 }
    );
  }
  
  return null;
};

// Content Security Policy headers
export const getCSPHeaders = (): Record<string, string> => {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
};

// Rate limiting (client-side)
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}
  
  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
  
  getRemainingRequests(key: string): number {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - validRequests.length);
  }
}

// Password strength checker
export const checkPasswordStrength = (password: string): {
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;
  
  if (password.length >= 8) score += 1;
  else feedback.push('Use at least 8 characters');
  
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');
  
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');
  
  if (/\d/.test(password)) score += 1;
  else feedback.push('Add numbers');
  
  if (/[^a-zA-Z\d]/.test(password)) score += 1;
  else feedback.push('Add special characters');
  
  if (password.length >= 12) score += 1;
  
  return { score, feedback };
};

// Secure random string generation
export const generateSecureRandomString = (length: number): string => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => charset[byte % charset.length]).join('');
};

// URL validation with security checks
export const validateSecureURL = (url: string): CustomError | null => {
  try {
    const urlObj = new URL(url);
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return new CustomError(
        ErrorType.VALIDATION,
        'Invalid protocol',
        'Only HTTP and HTTPS URLs are allowed',
        false,
        'INVALID_PROTOCOL',
        { url, protocol: urlObj.protocol }
      );
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /file:/i,
      /ftp:/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url)) {
        return new CustomError(
          ErrorType.VALIDATION,
          'Suspicious URL pattern',
          'URL contains potentially dangerous content',
          false,
          'SUSPICIOUS_URL',
          { url }
        );
      }
    }
    
    return null;
  } catch {
    return new CustomError(
      ErrorType.VALIDATION,
      'Invalid URL format',
      'Please enter a valid URL',
      false,
      'INVALID_URL_FORMAT',
      { url }
    );
  }
};

// Content validation for user-generated content
export const validateUserContent = (content: string): CustomError | null => {
  // Check for potential XSS
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];
  
  for (const pattern of xssPatterns) {
    if (pattern.test(content)) {
      return new CustomError(
        ErrorType.VALIDATION,
        'Potentially dangerous content detected',
        'Content contains potentially unsafe elements',
        false,
        'DANGEROUS_CONTENT',
        { content: content.substring(0, 100) }
      );
    }
  }
  
  // Check content length
  if (content.length > 10000) {
    return new CustomError(
      ErrorType.VALIDATION,
      'Content too long',
      'Content must be less than 10,000 characters',
      false,
      'CONTENT_TOO_LONG',
      { maxLength: 10000, actualLength: content.length }
    );
  }
  
  return null;
};
