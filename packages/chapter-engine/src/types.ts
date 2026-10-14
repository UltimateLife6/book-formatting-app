import type { DetectionConfidence, DetectionSignal, SectionKind, SectionRole } from '@folio-loom/book-model';

export interface DetectedSection {
  /** Exact heading text (whitespace collapsed), or a synthetic title for opening/fallback sections. */
  title: string;
  kind: SectionKind;
  role: SectionRole;
  numbered: boolean;
  signal: DetectionSignal;
  confidence: DetectionConfidence;
  /** Index of the unit that supplied the title; null when the title is synthetic. */
  headingIndex: number | null;
  /** Body units are `[bodyStart, bodyEnd)`. */
  bodyStart: number;
  bodyEnd: number;
}

export interface DetectedPart {
  title: string;
  headingIndex: number;
  signal: DetectionSignal;
  /** Index into `sections` of the first section that follows this part heading. */
  firstSectionIndex: number;
}

export type DetectionStrategy = 'headings' | 'strongPatterns' | 'weakPatterns' | 'none';

export interface DetectionResult {
  sections: DetectedSection[];
  parts: DetectedPart[];
  strategy: DetectionStrategy;
  /** True when any boundary is uncertain and the author should confirm the outline. */
  needsReview: boolean;
}

/** A structured paragraph (e.g. from DOCX). `headingLevel` is 1–6 for Word heading styles. */
export interface DetectionUnit {
  text: string;
  headingLevel?: number | null;
}
