import type { ValidationIssue } from './integrity';

export type ImportFormat = 'docx' | 'txt';

/**
 * Provisional limits (not yet product-approved). The legacy app disagreed with itself:
 * Import.tsx enforced 10 MB while appConfig declared 50 MB.
 */
export const IMPORT_LIMITS = {
  maxBytes: { docx: 50 * 1024 * 1024, txt: 20 * 1024 * 1024 },
  maxWords: 500_000,
  maxSections: 1_000,
} as const;

export function checkImportSize(format: ImportFormat, bytes: number): ValidationIssue | null {
  const limit = IMPORT_LIMITS.maxBytes[format];
  if (bytes <= limit) return null;
  return {
    severity: 'error',
    code: 'file_too_large',
    message: `${format.toUpperCase()} files must be ${Math.round(limit / (1024 * 1024))} MB or smaller.`,
  };
}

export function checkImportVolume(words: number, sections: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (words > IMPORT_LIMITS.maxWords) {
    issues.push({ severity: 'error', code: 'too_many_words', message: `Manuscripts are limited to ${IMPORT_LIMITS.maxWords.toLocaleString('en-US')} words.` });
  }
  if (sections > IMPORT_LIMITS.maxSections) {
    issues.push({ severity: 'error', code: 'too_many_sections', message: `Manuscripts are limited to ${IMPORT_LIMITS.maxSections} sections.` });
  }
  return issues;
}
