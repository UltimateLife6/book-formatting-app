import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deserializeManuscript, type ParagraphBlock, serializeManuscript } from '@folio-loom/book-model';
import { hasErrors, validateManuscriptIntegrity } from '@folio-loom/validation';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { describe, expect, it } from 'vitest';
import { importDocx } from './docx';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../qa/fixtures/${name}`, import.meta.url)));

describe('importDocx with QA fixtures', () => {
  it('small-manuscript.docx yields the five Heading 1 chapters with exact titles', async () => {
    const { manuscript, report } = await importDocx(fixture('small-manuscript.docx'));
    expect(report.strategy).toBe('headings');
    expect(manuscript.sections.map((s) => s.title)).toEqual([
      'Chapter 1',
      'CHAPTER 2',
      'Chapter 3: The Turning Road',
      'CHAPTER 4 — A Quiet Signal',
      'Chapter 5',
    ]);
    expect(manuscript.sections.every((s) => s.kind === 'chapter' && s.numbered)).toBe(true);
    expect(report.needsReview).toBe(false);
    expect(report.preservation.ok).toBe(true);
  });

  it.each([
    ['medium-manuscript.docx', 25],
    ['large-novel.docx', 40],
    ['very-large-manuscript.docx', 70],
  ])('%s yields %i chapters with no text lost', async (name, chapters) => {
    const started = performance.now();
    const { manuscript, report } = await importDocx(fixture(name));
    const elapsed = performance.now() - started;
    expect(report.chapterCount).toBe(chapters);
    expect(report.preservation.ok).toBe(true);
    expect(hasErrors(validateManuscriptIntegrity(manuscript))).toBe(false);
    expect(deserializeManuscript(serializeManuscript(manuscript))).toEqual({ ok: true, manuscript, migratedFrom: null });
    expect(elapsed).toBeLessThan(20000);
  });
});

describe('importDocx formatting', () => {
  it('keeps inline marks, soft breaks, alignment, subheadings, scene breaks, and table text', async () => {
    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Chapter 1')] }),
            new Paragraph({
              children: [
                new TextRun('Plain '),
                new TextRun({ text: 'italic', italics: true }),
                new TextRun(' and '),
                new TextRun({ text: 'bold', bold: true }),
                new TextRun({ text: 'second line', break: 1 }),
                new TextRun({ text: '2', superScript: true }),
              ],
            }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('* * *')] }),
            new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('A Letter')] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Centered verse')] }),
            new Paragraph({
              children: [
                new TextRun('Visit '),
                new ExternalHyperlink({ link: 'https://example.com', children: [new TextRun('our site')] }),
                new TextRun('.'),
              ],
            }),
            new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Cell text')] })] })] }),
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Chapter 2')] }),
            new Paragraph('Último capítulo — “quoted”.'),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(document);
    const { manuscript, report } = await importDocx(new Uint8Array(buffer));

    expect(report.preservation.ok).toBe(true);
    expect(manuscript.sections.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2']);
    const blocks = manuscript.sections[0]?.blocks ?? [];
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'sceneBreak', 'heading', 'paragraph', 'paragraph', 'paragraph']);
    expect((blocks[0] as ParagraphBlock).runs).toEqual([
      { text: 'Plain ' },
      { text: 'italic', marks: ['italic'] },
      { text: ' and ' },
      { text: 'bold', marks: ['bold'] },
      { text: '\nsecond line' },
      { text: '2', marks: ['superscript'] },
    ]);
    expect(blocks[2]).toMatchObject({ type: 'heading', level: 2 });
    expect(blocks[3]).toMatchObject({ align: 'center' });
    expect(blocks[5]).toMatchObject({ runs: [{ text: 'Cell text' }] });
    expect(report.warnings.map((w) => w.code).sort()).toEqual(['links_unlinked', 'tables_flattened']);
    expect(manuscript.sections[1]?.blocks[0]).toMatchObject({ runs: [{ text: 'Último capítulo — “quoted”.' }] });
  });
});
