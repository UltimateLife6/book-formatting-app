import type { DetectionConfidence, DetectionSignal, SectionKind, SectionRole } from '@folio-loom/book-model';
import type { DetectedPart, DetectedSection, DetectionResult, DetectionStrategy } from './types';

export const OPENING_TITLE = 'Opening';
export const FALLBACK_TITLE = 'Manuscript';

export interface Boundary {
  index: number;
  type: 'section' | 'part';
  title: string;
  signal: DetectionSignal;
  confidence: DetectionConfidence;
  kind?: SectionKind;
  role?: SectionRole;
  numbered?: boolean;
}

/**
 * Turn sorted boundaries into contiguous section ranges that cover every unit exactly once,
 * so no source text can fall between sections.
 */
export function assembleSections(
  unitCount: number,
  boundaries: readonly Boundary[],
  hasText: (index: number) => boolean,
  strategy: DetectionStrategy,
): DetectionResult {
  const rangeHasText = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (hasText(i)) return true;
    return false;
  };

  if (boundaries.length === 0) {
    return {
      sections: [
        {
          title: FALLBACK_TITLE,
          kind: 'chapter',
          role: 'chapter',
          numbered: true,
          signal: 'fallback',
          confidence: 'low',
          headingIndex: null,
          bodyStart: 0,
          bodyEnd: unitCount,
        },
      ],
      parts: [],
      strategy: 'none',
      needsReview: true,
    };
  }

  const sections: DetectedSection[] = [];
  const parts: DetectedPart[] = [];
  const first = boundaries[0];
  if (first && rangeHasText(0, first.index)) {
    sections.push({
      title: OPENING_TITLE,
      kind: 'frontMatter',
      role: 'other',
      numbered: false,
      signal: 'opening',
      confidence: 'low',
      headingIndex: null,
      bodyStart: 0,
      bodyEnd: first.index,
    });
  }

  boundaries.forEach((boundary, i) => {
    const bodyStart = boundary.index + 1;
    const bodyEnd = boundaries[i + 1]?.index ?? unitCount;
    if (boundary.type === 'part') {
      parts.push({
        title: boundary.title,
        headingIndex: boundary.index,
        signal: boundary.signal,
        firstSectionIndex: sections.length,
      });
      if (rangeHasText(bodyStart, bodyEnd)) {
        // Text between a part heading and the next chapter (e.g. a part epigraph) keeps its own
        // untitled section so it is never lost.
        sections.push({
          title: '',
          kind: 'chapter',
          role: 'other',
          numbered: false,
          signal: 'opening',
          confidence: 'low',
          headingIndex: null,
          bodyStart,
          bodyEnd,
        });
      }
      return;
    }
    sections.push({
      title: boundary.title,
      kind: boundary.kind ?? 'chapter',
      role: boundary.role ?? 'chapter',
      numbered: boundary.numbered ?? true,
      signal: boundary.signal,
      confidence: boundary.confidence,
      headingIndex: boundary.index,
      bodyStart,
      bodyEnd,
    });
  });

  const needsReview =
    strategy === 'weakPatterns' || sections.some((section) => section.confidence !== 'high');
  return { sections, parts, strategy, needsReview };
}
