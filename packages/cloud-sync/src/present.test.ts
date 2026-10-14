import { createManuscript, createParagraph, createSection } from '@folio-loom/book-model';
import { structureOf, type SyncConflict } from '@folio-loom/sync';
import { describe, expect, it } from 'vitest';
import type { ConflictView } from './engine';
import { conflictOptions, conflictSides } from './present';

const mine = createSection({ kind: 'chapter', title: 'One', blocks: [createParagraph('My words.')] });
const theirs = { ...mine, blocks: [createParagraph('Their words.')] };
const manuscript = createManuscript({ title: 'Book', sections: [mine] });

function view(kind: SyncConflict['kind'], overrides: Partial<ConflictView> = {}): ConflictView {
  const conflict: SyncConflict = {
    id: `${kind}:x`,
    kind,
    sectionId: mine.id,
    title: 'One',
    remoteRevision: 2,
    remoteHash: 'h',
    remoteSection: theirs,
    remoteStructure: null,
    localHash: 'l',
    detectedAt: '2026-10-14T00:00:00.000Z',
  };
  return { conflict, mine, theirs, expected: { remoteRevision: 2, localHash: 'l' }, sectionTitles: { [mine.id]: 'One' }, ...overrides };
}

describe('conflict presentation', () => {
  it('labels both section versions by origin and never mixes them up', () => {
    const sides = conflictSides(view('edit'));
    expect(sides.mine.label).toMatch(/this device/);
    expect(sides.mine.text).toContain('My words.');
    expect(sides.theirs.label).toMatch(/other device/i);
    expect(sides.theirs.text).toContain('Their words.');
  });

  it('shows deletions explicitly', () => {
    expect(conflictSides(view('remoteDeleted', { theirs: null })).theirs.text).toBe('(deleted)');
    expect(conflictSides(view('localDeleted', { mine: null })).mine.text).toBe('(deleted)');
    expect(conflictSides(view('bookDeleted', { mine: manuscript, theirs: null })).theirs.text).toBe('(book deleted)');
  });

  it('lists section orders with titles for structure conflicts', () => {
    const structure = structureOf(manuscript);
    const sides = conflictSides(view('structure', { mine: structure, theirs: { ...structure, title: 'Renamed', order: [...structure.order, 'unknown'] } }));
    expect(sides.mine.text).toContain('1. One');
    expect(sides.theirs.text).toContain('Title: Renamed');
    expect(sides.theirs.text).toContain('2. (a section from another device)');
  });

  it('offers only the choices that make sense for each kind', () => {
    expect(conflictOptions('edit').map((o) => o.label)).toEqual(['Keep mine', 'Keep theirs', 'Keep both']);
    expect(conflictOptions('structure').map((o) => o.choice)).toEqual(['mine', 'theirs']);
    expect(conflictOptions('bookDeleted').every((o) => o.hint.length > 0)).toBe(true);
  });
});
