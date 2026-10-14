import type { Manuscript } from '@folio-loom/book-model';
import type { TextPreservationReport } from '@folio-loom/validation';
import type { ImportReport, ImportSourceFormat, ImportWarning } from './types';

export function buildReport(input: {
  format: ImportSourceFormat;
  strategy: ImportReport['strategy'];
  needsReview: boolean;
  manuscript: Manuscript;
  preservation: TextPreservationReport;
  warnings: ImportWarning[];
}): ImportReport {
  const { manuscript, preservation } = input;
  const warnings = [...input.warnings];
  if (!preservation.ok) {
    warnings.unshift({
      code: 'text_not_preserved',
      message: `Imported text differs from the source near "${preservation.firstMismatch?.expected ?? ''}". Do not save this import.`,
    });
  }
  if (input.needsReview) {
    warnings.push({ code: 'chapters_need_review', message: 'Some chapter breaks are uncertain. Please review the outline.' });
  }
  return {
    format: input.format,
    strategy: input.strategy,
    needsReview: input.needsReview,
    sectionCount: manuscript.sections.length,
    chapterCount: manuscript.sections.filter((section) => section.kind === 'chapter').length,
    partCount: manuscript.parts.length,
    blockCount: manuscript.sections.reduce((total, section) => total + section.blocks.length, 0),
    preservation,
    warnings,
  };
}
