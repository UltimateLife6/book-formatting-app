import {
  type Block,
  createId,
  createManuscript,
  createPart,
  createSection,
  type IdGenerator,
  type Manuscript,
  type Part,
  type Section,
} from '@folio-loom/book-model';
import type { DetectionResult } from '@folio-loom/chapter-engine';
import type { ImportOptions, ImportWarning } from './types';

export interface AssembledManuscript {
  manuscript: Manuscript;
  warnings: ImportWarning[];
}

/**
 * Build a manuscript from detected ranges. `blocksFor(start, end)` converts source units in
 * `[start, end)` to blocks. Parts own the sections between their heading and the next part
 * heading, except trailing back matter, which stays outside the part.
 */
export function assembleManuscript(
  detection: DetectionResult,
  blocksFor: (start: number, end: number) => Block[],
  options: ImportOptions,
): AssembledManuscript {
  const idGen: IdGenerator = options.idGen ?? createId;
  const warnings: ImportWarning[] = [];

  const sections: Section[] = detection.sections.map((detected) =>
    createSection(
      {
        kind: detected.kind,
        role: detected.role,
        title: detected.title,
        numbered: detected.numbered,
        blocks: blocksFor(detected.bodyStart, detected.bodyEnd),
        detection: { signal: detected.signal, confidence: detected.confidence },
      },
      idGen,
    ),
  );

  const insertedBefore = new Map<number, Section[]>();
  const parts: Part[] = [];
  detection.parts.forEach((detectedPart, k) => {
    const start = detectedPart.firstSectionIndex;
    let end = detection.parts[k + 1]?.firstSectionIndex ?? sections.length;
    while (end > start && sections[end - 1]?.kind === 'backMatter') end -= 1;

    const members = sections.slice(start, end);
    if (members.length === 0) {
      // A part heading with nothing after it must still keep its text.
      const placeholder = createSection(
        {
          kind: 'chapter',
          role: 'other',
          title: detectedPart.title,
          numbered: false,
          detection: { signal: detectedPart.signal, confidence: 'low' },
        },
        idGen,
      );
      insertedBefore.set(start, [...(insertedBefore.get(start) ?? []), placeholder]);
      warnings.push({
        code: 'empty_part',
        message: `"${detectedPart.title}" looks like a part heading but has no chapters; it was kept as a section.`,
      });
      return;
    }
    parts.push(createPart({ title: detectedPart.title, sectionIds: members.map((section) => section.id) }, idGen));
  });

  const ordered: Section[] = [];
  for (let i = 0; i <= sections.length; i++) {
    ordered.push(...(insertedBefore.get(i) ?? []));
    const section = sections[i];
    if (section) ordered.push(section);
  }

  const manuscript = createManuscript(
    {
      title: options.title ?? '',
      authors: options.authors ?? [],
      language: options.language ?? 'en',
      sections: ordered,
      parts,
      ...(options.now ? { now: options.now } : {}),
    },
    idGen,
  );
  return { manuscript, warnings };
}
