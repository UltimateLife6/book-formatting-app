// Unit tests for validation utilities
import {
  sanitizeText,
  validateEmail,
  validatePassword,
  validateBookTitle,
  validateAuthorName,
  validateISBN,
  validateURL,
} from '../validation';

describe('Validation Utilities', () => {
  describe('sanitizeText', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('alert("xss")');
    });

    it('should remove javascript: protocols', () => {
      expect(sanitizeText('javascript:alert("xss")')).toBe('alert("xss")');
    });

    it('should normalize whitespace', () => {
      expect(sanitizeText('  multiple   spaces  ')).toBe('multiple spaces');
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBeNull();
      expect(validateEmail('user.name+tag@domain.co.uk')).toBeNull();
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).not.toBeNull();
      expect(validateEmail('@domain.com')).not.toBeNull();
      expect(validateEmail('user@')).not.toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should accept strong passwords', () => {
      expect(validatePassword('Password123')).toBeNull();
      expect(validatePassword('MyStr0ng!Pass')).toBeNull();
    });

    it('should reject weak passwords', () => {
      expect(validatePassword('short')).not.toBeNull();
      expect(validatePassword('nouppercase123')).not.toBeNull();
      expect(validatePassword('NOLOWERCASE123')).not.toBeNull();
      expect(validatePassword('NoNumbers')).not.toBeNull();
    });
  });

  describe('validateBookTitle', () => {
    it('should accept valid book titles', () => {
      expect(validateBookTitle('The Great Gatsby')).toBeNull();
      expect(validateBookTitle('A')).toBeNull(); // Minimum length
    });

    it('should reject invalid book titles', () => {
      expect(validateBookTitle('')).not.toBeNull();
      expect(validateBookTitle('A'.repeat(201))).not.toBeNull();
    });
  });

  describe('validateAuthorName', () => {
    it('should accept valid author names', () => {
      expect(validateAuthorName('John Doe')).toBeNull();
      expect(validateAuthorName('Mary-Jane O\'Connor')).toBeNull();
    });

    it('should reject invalid author names', () => {
      expect(validateAuthorName('')).not.toBeNull();
      expect(validateAuthorName('John123')).not.toBeNull();
      expect(validateAuthorName('A'.repeat(101))).not.toBeNull();
    });
  });

  describe('validateISBN', () => {
    it('should accept valid ISBN-10', () => {
      expect(validateISBN('0-306-40615-2')).toBeNull();
      expect(validateISBN('0306406152')).toBeNull();
    });

    it('should accept valid ISBN-13', () => {
      expect(validateISBN('978-0-306-40615-7')).toBeNull();
      expect(validateISBN('9780306406157')).toBeNull();
    });

    it('should reject invalid ISBNs', () => {
      expect(validateISBN('123456789')).not.toBeNull(); // Too short
      expect(validateISBN('12345678901234')).not.toBeNull(); // Too long
      expect(validateISBN('0-306-40615-1')).not.toBeNull(); // Invalid check digit
    });

    it('should accept empty ISBN as optional', () => {
      expect(validateISBN('')).toBeNull();
    });
  });

  describe('validateURL', () => {
    it('should accept valid URLs', () => {
      expect(validateURL('https://example.com')).toBeNull();
      expect(validateURL('http://localhost:3000')).toBeNull();
    });

    it('should reject invalid URLs', () => {
      expect(validateURL('not-a-url')).not.toBeNull();
      expect(validateURL('invalid-protocol://example.com')).not.toBeNull();
    });

    it('should accept empty URL as optional', () => {
      expect(validateURL('')).toBeNull();
    });
  });
});
