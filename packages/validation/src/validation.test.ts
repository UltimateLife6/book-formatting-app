import {
  createManuscript,
  createParagraph,
  createPart,
  createSection,
  createSequentialIdGenerator,
  type Manuscript,
} from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import {
  checkImportSize,
  checkImportVolume,
  checkManuscriptPreservesSource,
  checkTextPreservation,
  hasErrors,
  validateManuscriptIntegrity,
} from './index';

function build(): Manuscript {
  const id = createSequentialIdGenerator('v');
  const one = createSection({ kind: 'chapter', title: 'Chapter 1', blocks: [createParagraph('Alpha beta.', id)] }, id);
  const two = createSection({ kind: 'chapter', title: 'Chapter 2', blocks: [createParagraph('Gamma.', id)] }, id);
  return createManuscript({ title: 'T', sections: [one, two], parts: [createPart({ title: 'Part One', sectionIds: [one.id, two.id] }, id)] }, id);
}

describe('validateManuscriptIntegrity', () => {
  it('accepts a well-formed manuscript', () => {
    expect(validateManuscriptIntegrity(build())).toEqual([]);
  });

  it('flags duplicate IDs across sections and blocks', () => {
    const m = build();
    const first = m.sections[0];
    const second = m.sections[1];
    if (!first || !second) throw new Error('fixture');
    const duplicateBlock = { ...second.blocks[0], id: first.blocks[0]?.id ?? '' } as (typeof second.blocks)[number];
    const broken: Manuscript = { ...m, sections: [first, { ...second, blocks: [duplicateBlock] }] };
    const issues = validateManuscriptIntegrity(broken);
    expect(issues.map((i) => i.code)).toContain('duplicate_id');
    expect(hasErrors(issues)).toBe(true);
  });

  it('flags parts that reference missing sections or share sections', () => {
    const m = build();
    const part = m.parts[0];
    if (!part) throw new Error('fixture');
    const broken: Manuscript = {
      ...m,
      parts: [part, { id: 'prt_other', title: 'Part Two', sectionIds: [part.sectionIds[0] ?? '', 'sec_missing'] }],
    };
    const codes = validateManuscriptIntegrity(broken).map((i) => i.code);
    expect(codes).toContain('section_in_multiple_parts');
    expect(codes).toContain('part_unknown_section');
  });

  it('warns when front matter follows a chapter', () => {
    const m = build();
    const id = createSequentialIdGenerator('w');
    const late = createSection({ kind: 'frontMatter', role: 'dedication', title: 'Dedication', numbered: false }, id);
    const issues = validateManuscriptIntegrity({ ...m, sections: [...m.sections, late] });
    expect(issues).toEqual([expect.objectContaining({ code: 'front_matter_out_of_order', severity: 'warning' })]);
  });

  it('reports schema errors without throwing', () => {
    const issues = validateManuscriptIntegrity({ ...build(), language: '' });
    expect(issues[0]).toMatchObject({ severity: 'error', code: 'schema', path: 'language' });
  });
});

describe('text preservation', () => {
  it('ignores whitespace differences but catches dropped words', () => {
    expect(checkTextPreservation('One  two\nthree', 'One two three').ok).toBe(true);
    const report = checkTextPreservation('One two three four', 'One two four');
    expect(report.ok).toBe(false);
    expect(report.firstMismatch?.index).toBe(2);
  });

  it('character mode ignores whitespace placement but catches lost characters', () => {
    expect(checkTextPreservation('line onenext line', 'line one\nnext line', 'characters').ok).toBe(true);
    expect(checkTextPreservation('café au lait', 'caf au lait', 'characters').ok).toBe(false);
  });

  it('compares a manuscript with its source, including titles and part names', () => {
    const report = checkManuscriptPreservesSource('Part One\n\nChapter 1\nAlpha beta.\nChapter 2\nGamma.', build());
    expect(report).toMatchObject({ ok: true, sourceWordCount: 9, resultWordCount: 9 });
  });
});

describe('import limits', () => {
  it('enforces provisional size and volume limits', () => {
    expect(checkImportSize('txt', 1024)).toBeNull();
    expect(checkImportSize('docx', 51 * 1024 * 1024)?.code).toBe('file_too_large');
    expect(checkImportVolume(600_000, 10).map((i) => i.code)).toEqual(['too_many_words']);
  });
});
