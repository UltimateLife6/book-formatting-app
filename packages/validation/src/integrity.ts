import { type Manuscript, ManuscriptSchema } from '@folio-loom/book-model';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  path?: string;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/**
 * Checks the schema plus cross-references the schema cannot express. Errors mean the manuscript
 * must not be saved or synced; warnings are surfaced to the author.
 */
export function validateManuscriptIntegrity(manuscript: Manuscript): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const schema = ManuscriptSchema.safeParse(manuscript);
  if (!schema.success) {
    for (const issue of schema.error.issues) {
      issues.push({
        severity: 'error',
        code: 'schema',
        message: issue.message,
        path: issue.path.map((segment) => String(segment)).join('.'),
      });
    }
    return issues;
  }

  const seen = new Map<string, string>();
  const claim = (id: string, path: string) => {
    const previous = seen.get(id);
    if (previous) {
      issues.push({ severity: 'error', code: 'duplicate_id', message: `ID "${id}" is used by ${previous} and ${path}.`, path });
    } else {
      seen.set(id, path);
    }
  };

  claim(manuscript.id, 'manuscript');
  manuscript.sections.forEach((section, s) => {
    claim(section.id, `sections.${s}`);
    section.blocks.forEach((block, b) => {
      claim(block.id, `sections.${s}.blocks.${b}`);
    });
  });
  manuscript.parts.forEach((part, p) => {
    claim(part.id, `parts.${p}`);
  });

  const sectionsById = new Map(manuscript.sections.map((section) => [section.id, section]));
  const partBySection = new Map<string, string>();
  manuscript.parts.forEach((part, p) => {
    part.sectionIds.forEach((sectionId, i) => {
      const path = `parts.${p}.sectionIds.${i}`;
      const section = sectionsById.get(sectionId);
      if (!section) {
        issues.push({ severity: 'error', code: 'part_unknown_section', message: `Part "${part.title}" references a missing section.`, path });
        return;
      }
      const owner = partBySection.get(sectionId);
      if (owner) {
        issues.push({ severity: 'error', code: 'section_in_multiple_parts', message: `Section "${section.title}" belongs to more than one part.`, path });
      }
      partBySection.set(sectionId, part.id);
      if (section.kind !== 'chapter') {
        issues.push({ severity: 'warning', code: 'part_contains_matter', message: `Part "${part.title}" contains front/back matter "${section.title}".`, path });
      }
    });
  });

  if (manuscript.sections.length === 0) {
    issues.push({ severity: 'warning', code: 'empty_manuscript', message: 'The manuscript has no sections.' });
  }

  let seenChapter = false;
  let seenBackMatter = false;
  manuscript.sections.forEach((section, s) => {
    const path = `sections.${s}`;
    if (section.kind === 'chapter') {
      if (seenBackMatter) {
        issues.push({ severity: 'warning', code: 'chapter_after_back_matter', message: `"${section.title}" comes after back matter.`, path });
      }
      seenChapter = true;
    } else if (section.kind === 'frontMatter' && seenChapter) {
      issues.push({ severity: 'warning', code: 'front_matter_out_of_order', message: `Front matter "${section.title}" comes after a chapter.`, path });
    } else if (section.kind === 'backMatter') {
      seenBackMatter = true;
    }
    if (section.title.trim().length === 0 && section.kind !== 'chapter') {
      issues.push({ severity: 'warning', code: 'untitled_section', message: 'A front/back matter section has no title.', path });
    }
  });

  return issues;
}
