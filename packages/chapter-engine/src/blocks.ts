import { assembleSections, type Boundary } from './assemble';
import { classifySectionTitle } from './classify';
import { detectSectionsInLines } from './lines';
import { cleanHeadingText, isPartHeadingLine, isStrongChapterHeadingLine } from './patterns';
import type { DetectedSection, DetectionResult, DetectionUnit } from './types';

function headingLevelOf(unit: DetectionUnit | undefined): number | null {
  const level = unit?.headingLevel;
  return typeof level === 'number' && level >= 1 && level <= 6 ? level : null;
}

/**
 * Pick the heading level that marks chapters. Part headings ("Part One") never count.
 * Two or more H1s → H1. A lone H1 (book title) above two or more H2s → H2.
 */
export function pickChapterHeadingLevel(units: readonly DetectionUnit[]): number | null {
  const counts = new Map<number, number>();
  for (const unit of units) {
    const level = headingLevelOf(unit);
    const text = cleanHeadingText(unit.text);
    if (level === null || !text || isPartHeadingLine(text)) continue;
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const h1 = counts.get(1) ?? 0;
  const h2 = counts.get(2) ?? 0;
  if (h1 >= 2) return 1;
  if (h2 >= 2) return 2;
  if (h1 === 1) return 1;
  return Math.min(...counts.keys());
}

function headingBoundaries(units: readonly DetectionUnit[], chapterLevel: number): Boundary[] {
  const boundaries: Boundary[] = [];
  let seenChapterHeading = false;
  units.forEach((unit, index) => {
    const title = cleanHeadingText(unit.text);
    if (!title) return;
    const level = headingLevelOf(unit);

    if (level !== null && level <= chapterLevel) {
      if (isPartHeadingLine(title)) {
        boundaries.push({ index, type: 'part', title, signal: 'heading', confidence: 'high' });
        return;
      }
      if (level < chapterLevel) {
        if (!seenChapterHeading && boundaries.length === 0) {
          // A lone higher-level heading before any chapter is usually the book title.
          boundaries.push({
            index,
            type: 'section',
            title,
            signal: 'heading',
            confidence: 'medium',
            kind: 'frontMatter',
            role: 'titlePage',
            numbered: false,
          });
        } else {
          boundaries.push({ index, type: 'part', title, signal: 'heading', confidence: 'medium' });
        }
        return;
      }
      seenChapterHeading = true;
      boundaries.push({
        index,
        type: 'section',
        title,
        signal: 'heading',
        confidence: 'high',
        ...classifySectionTitle(title),
      });
      return;
    }

    if (level === null) {
      // Priority 2: strong text patterns in Normal paragraphs (headings are authoritative and
      // never produce a second boundary for the same unit).
      if (isPartHeadingLine(title)) {
        boundaries.push({ index, type: 'part', title, signal: 'strongPattern', confidence: 'medium' });
      } else if (isStrongChapterHeadingLine(title)) {
        boundaries.push({
          index,
          type: 'section',
          title,
          signal: 'strongPattern',
          confidence: 'medium',
          ...classifySectionTitle(title),
        });
      }
    }
  });
  return boundaries;
}

function mapInterleavedRange(section: DetectedSection): DetectedSection {
  return {
    ...section,
    headingIndex: section.headingIndex === null ? null : section.headingIndex / 2,
    bodyStart: Math.ceil(section.bodyStart / 2),
    bodyEnd: Math.ceil(section.bodyEnd / 2),
  };
}

/**
 * Structured detection (DOCX). Priority: Word heading styles → strong text patterns → weak
 * heuristics (only when the document has no usable headings or strong patterns).
 */
export function detectSectionsInBlocks(units: readonly DetectionUnit[]): DetectionResult {
  const chapterLevel = pickChapterHeadingLevel(units);
  if (chapterLevel !== null) {
    const hasText = (i: number) => cleanHeadingText(units[i]?.text ?? '').length > 0;
    return assembleSections(units.length, headingBoundaries(units, chapterLevel), hasText, 'headings');
  }

  // No heading styles: reuse the plain-text rules. Each unit becomes one line followed by a blank
  // line, matching how Word paragraphs are separated, then indexes are mapped back to units.
  const lines = units.flatMap((unit) => [cleanHeadingText(unit.text), '']);
  const result = detectSectionsInLines(lines);
  return {
    ...result,
    sections: result.sections.map(mapInterleavedRange),
    parts: result.parts.map((part) => ({ ...part, headingIndex: part.headingIndex / 2 })),
  };
}
