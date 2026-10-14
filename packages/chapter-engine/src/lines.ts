import { assembleSections, type Boundary } from './assemble';
import { classifyMatterHeading, classifySectionTitle } from './classify';
import {
  cleanHeadingText,
  isPartHeadingLine,
  isStrongChapterHeadingLine,
  isWeakChapterHeadingAt,
} from './patterns';
import type { DetectionResult } from './types';

const isBlank = (line: string | undefined) => line === undefined || line.trim().length === 0;

function strongBoundaries(lines: readonly string[]): Boundary[] {
  const boundaries: Boundary[] = [];
  lines.forEach((line, index) => {
    const title = cleanHeadingText(line);
    if (!title) return;
    if (isPartHeadingLine(title)) {
      boundaries.push({ index, type: 'part', title, signal: 'strongPattern', confidence: 'high' });
    } else if (isStrongChapterHeadingLine(title)) {
      boundaries.push({
        index,
        type: 'section',
        title,
        signal: 'strongPattern',
        confidence: 'high',
        ...classifySectionTitle(title),
      });
    } else if (isBlank(lines[index - 1]) && isBlank(lines[index + 1])) {
      const matter = classifyMatterHeading(title);
      if (matter) {
        boundaries.push({ index, type: 'section', title, signal: 'strongPattern', confidence: 'medium', ...matter });
      }
    }
  });
  return boundaries;
}

function weakBoundaries(lines: readonly string[]): Boundary[] {
  const boundaries: Boundary[] = [];
  lines.forEach((line, index) => {
    if (!isWeakChapterHeadingAt(index, lines)) return;
    const title = cleanHeadingText(line);
    boundaries.push({
      index,
      type: 'section',
      title,
      signal: 'weakPattern',
      confidence: 'low',
      ...classifySectionTitle(title),
    });
  });
  return boundaries;
}

/**
 * Plain-text detection (TXT, paste, Google Docs text). Strong whole-line patterns first; the
 * weak "1." / "One" heuristics only run when no strong heading exists anywhere.
 */
export function detectSectionsInLines(lines: readonly string[]): DetectionResult {
  const hasText = (i: number) => (lines[i]?.trim().length ?? 0) > 0;
  const strong = strongBoundaries(lines);
  // Front/back matter titles alone do not count as chapter structure.
  const hasChapterStructure = strong.some((b) => b.type === 'part' || b.confidence === 'high');
  if (hasChapterStructure) return assembleSections(lines.length, strong, hasText, 'strongPatterns');
  const weak = weakBoundaries(lines);
  if (weak.length > 0) {
    const merged = [...strong, ...weak].sort((a, b) => a.index - b.index);
    return assembleSections(lines.length, merged, hasText, 'weakPatterns');
  }
  if (strong.length > 0) return assembleSections(lines.length, strong, hasText, 'strongPatterns');
  return assembleSections(lines.length, [], hasText, 'none');
}

export function splitLines(raw: string): string[] {
  return raw.replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').split('\n');
}
