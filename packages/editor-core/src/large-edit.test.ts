import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manuscriptWordCount, runsToPlainText } from '@folio-loom/book-model';
import { importTxt } from '@folio-loom/import-engine';
import { describe, expect, it } from 'vitest';
import { insertTextAt, moveSection, updateManuscriptMeta } from './index';

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '../../../qa/fixtures/very-large-manuscript.txt');

describe('large manuscript editing performance', () => {
  it('opens, edits one paragraph, and reorders without rewriting the whole book text', () => {
    const manuscript = importTxt(readFileSync(fixture, 'utf8')).manuscript;
    expect(manuscriptWordCount(manuscript)).toBeGreaterThan(200_000);

    const section = manuscript.sections[5] ?? manuscript.sections[0];
    if (!section) throw new Error('fixture');
    const block = section.blocks.find((b) => b.type === 'paragraph');
    if (!block || block.type !== 'paragraph') throw new Error('need a paragraph');

    const before = structuredClone(manuscript.sections.map((s) => s.id));
    const t0 = performance.now();
    const { manuscript: edited } = insertTextAt(manuscript, { sectionId: section.id, blockId: block.id, offset: 0 }, 'EDIT ');
    const editMs = performance.now() - t0;

    // Unrelated sections keep the same object identity (structural sharing).
    expect(edited.sections.every((s, i) => (s.id === section.id ? true : s === manuscript.sections[i]))).toBe(true);
    const editedBlock = edited.sections.find((s) => s.id === section.id)?.blocks.find((b) => b.id === block.id);
    expect(editedBlock?.type === 'paragraph' && runsToPlainText(editedBlock.runs).startsWith('EDIT ')).toBe(true);

    const t1 = performance.now();
    const moved = moveSection(edited, section.id, Math.min(edited.sections.length - 1, 1));
    const moveMs = performance.now() - t1;
    expect(moved.sections.map((s) => s.id)).not.toEqual(before);
    expect(moved.sections).toHaveLength(manuscript.sections.length);

    const titled = updateManuscriptMeta(moved, { title: 'Performance check' });
    expect(titled.title).toBe('Performance check');

    console.info(`[large-edit] insertTextAt ${editMs.toFixed(1)} ms, moveSection ${moveMs.toFixed(1)} ms, ${manuscript.sections.length} sections`);
    expect(editMs).toBeLessThan(100);
    expect(moveMs).toBeLessThan(50);
  });
});
