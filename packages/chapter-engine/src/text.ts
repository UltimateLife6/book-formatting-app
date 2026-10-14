import type { DetectionConfidence, DetectionSignal, SectionKind, SectionRole } from '@folio-loom/book-model';
import { detectSectionsInLines, splitLines } from './lines';

export interface ChapterDraft {
  title: string;
  body: string;
  kind: SectionKind;
  role: SectionRole;
  numbered: boolean;
  signal: DetectionSignal;
  confidence: DetectionConfidence;
}

/**
 * Convenience wrapper with the legacy `detectManuscriptChapters` shape: raw text in, titled
 * bodies out (body lines joined with "\n", outer blank lines trimmed). Part headings are not
 * returned here; use `detectSectionsInLines` for full structure.
 */
export function detectChaptersInText(raw: string): ChapterDraft[] {
  const lines = splitLines(raw);
  const { sections } = detectSectionsInLines(lines);
  return sections.map((section) => ({
    title: section.title,
    body: lines
      .slice(section.bodyStart, section.bodyEnd)
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, ''),
    kind: section.kind,
    role: section.role,
    numbered: section.numbered,
    signal: section.signal,
    confidence: section.confidence,
  }));
}
