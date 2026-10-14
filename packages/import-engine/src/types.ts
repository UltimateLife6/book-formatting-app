import type { IdGenerator, Manuscript } from '@folio-loom/book-model';
import type { DetectionStrategy } from '@folio-loom/chapter-engine';
import type { TextPreservationReport } from '@folio-loom/validation';

export type ImportSourceFormat = 'txt' | 'docx' | 'legacy';

export type ImportWarningCode =
  | 'tables_flattened'
  | 'footnotes_omitted'
  | 'images_omitted'
  | 'links_unlinked'
  | 'comments_omitted'
  | 'empty_part'
  | 'text_not_preserved'
  | 'chapters_need_review';

export interface ImportWarning {
  code: ImportWarningCode;
  message: string;
}

export interface ImportReport {
  format: ImportSourceFormat;
  strategy: DetectionStrategy | 'legacy';
  needsReview: boolean;
  sectionCount: number;
  chapterCount: number;
  partCount: number;
  blockCount: number;
  preservation: TextPreservationReport;
  warnings: ImportWarning[];
}

export interface ImportResult {
  manuscript: Manuscript;
  report: ImportReport;
}

export interface ImportOptions {
  title?: string;
  authors?: string[];
  language?: string;
  idGen?: IdGenerator;
  now?: Date;
}
