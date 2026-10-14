import {
  createManuscript,
  createParagraph,
  createSection,
  createSequentialIdGenerator,
  type Manuscript,
  ManuscriptSchema,
  type Section,
} from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import {
  adoptLandedUnits,
  baseAfterCommit,
  chunkText,
  hashSection,
  hashStructure,
  isCleanAgainstBase,
  planPush,
  type RemoteBookView,
  reconcile,
  resolveConflict,
  type SyncBase,
  type SyncConflict,
  sectionsToFetch,
  structureOf,
  weaveOrder,
} from './index';

const NOW = '2026-10-14T00:00:00.000Z';

function book(): Manuscript {
  const ids = createSequentialIdGenerator('x');
  return createManuscript(
    {
      title: 'Book',
      sections: ['Prologue', 'One', 'Two', 'Three'].map((title) =>
        createSection({ kind: title === 'Prologue' ? 'frontMatter' : 'chapter', title, blocks: [createParagraph(`${title} text`, ids)] }, ids),
      ),
    },
    ids,
  );
}

/** A committed server state for `m`; section revisions default to 1. */
function view(m: Manuscript, revisions: Record<string, number> = {}, structureRevision = 1, revision = 1): RemoteBookView {
  return {
    revision,
    structureRevision,
    structure: structureOf(m),
    sections: Object.fromEntries(
      m.sections.map((s) => [s.id, { revision: revisions[s.id] ?? 1, hash: hashSection(s), chunkCount: 1 }]),
    ),
    deleted: false,
    recentOps: [],
  };
}

function baseOf(remote: RemoteBookView): SyncBase {
  return {
    headRevision: remote.revision,
    structure: { revision: remote.structureRevision, hash: hashStructure(remote.structure), value: remote.structure },
    sections: Object.fromEntries(Object.entries(remote.sections).map(([id, e]) => [id, { revision: e.revision, hash: e.hash }])),
  };
}

const sectionMap = (m: Manuscript) => new Map(m.sections.map((s) => [s.id, s]));
const edit = (m: Manuscript, index: number, text: string): Manuscript => ({
  ...m,
  sections: m.sections.map((s, i) => (i === index ? { ...s, blocks: [createParagraph(text, () => `${s.id}-edit`)] } : s)),
});
const textOf = (s: Section | undefined) =>
  s?.blocks.map((b) => ('runs' in b ? b.runs.map((r) => r.text).join('') : '')).join('\n') ?? '';

function run(base: SyncBase | null, local: Manuscript, remoteBook: Manuscript, remote: RemoteBookView, conflicts: SyncConflict[] = []) {
  return reconcile({ base, local, remote, remoteSections: sectionMap(remoteBook), conflicts, now: NOW });
}

describe('reconcile', () => {
  it('merges edits to different sections without conflict', () => {
    const original = book();
    const base = baseOf(view(original));
    const mine = edit(original, 1, 'mine');
    const theirs = edit(original, 2, 'theirs');
    const remote = view(theirs, { [theirs.sections[2]?.id as string]: 2 }, 1, 2);
    const result = run(base, mine, theirs, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.changedLocal).toBe(true);
    expect(textOf(result.manuscript.sections[1])).toBe('mine');
    expect(textOf(result.manuscript.sections[2])).toBe('theirs');
    const plan = planPush(result.base, result.manuscript, remote, result.conflicts);
    expect(plan?.sections.map((w) => w.id)).toEqual([mine.sections[1]?.id]);
    expect(plan?.structureChanged).toBe(false);
    expect(ManuscriptSchema.safeParse(result.manuscript).success).toBe(true);
  });

  it('only fetches sections whose server revision is unknown', () => {
    const original = book();
    const base = baseOf(view(original));
    const id = original.sections[3]?.id as string;
    expect(sectionsToFetch(base, view(original, { [id]: 4 }), [])).toEqual([id]);
    expect(sectionsToFetch(null, view(original), [])).toHaveLength(4);
  });

  it('records a conflict for the same section and keeps the local text', () => {
    const original = book();
    const base = baseOf(view(original));
    const mine = edit(original, 1, 'mine');
    const theirs = edit(original, 1, 'theirs');
    const id = original.sections[1]?.id as string;
    const result = run(base, mine, theirs, view(theirs, { [id]: 2 }, 1, 2));
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ kind: 'edit', sectionId: id, remoteRevision: 2 });
    expect(textOf(result.conflicts[0]?.remoteSection ?? undefined)).toBe('theirs');
    expect(textOf(result.manuscript.sections[1])).toBe('mine');
    expect(result.base.sections[id]?.revision).toBe(1);
    expect(planPush(result.base, result.manuscript, view(theirs, { [id]: 2 }, 1, 2), result.conflicts)).toBeNull();
  });

  it('converges identical edits made on two devices', () => {
    const original = book();
    const same = edit(original, 1, 'same');
    const id = original.sections[1]?.id as string;
    const result = run(baseOf(view(original)), same, same, view(same, { [id]: 2 }, 1, 2));
    expect(result.conflicts).toEqual([]);
    expect(result.base.sections[id]?.revision).toBe(2);
  });

  it('detects delete-versus-edit in both directions', () => {
    const original = book();
    const base = baseOf(view(original));
    const id = original.sections[2]?.id as string;
    const deleted = { ...original, sections: original.sections.filter((s) => s.id !== id) };
    const edited = edit(original, 2, 'edited');

    const iEdited = run(base, edited, deleted, view(deleted, {}, 2, 2));
    expect(iEdited.conflicts).toMatchObject([{ kind: 'remoteDeleted', sectionId: id, remoteSection: null }]);
    expect(iEdited.manuscript.sections.map((s) => s.id)).toContain(id);

    const iDeleted = run(base, deleted, edited, view(edited, { [id]: 2 }, 1, 2));
    expect(iDeleted.conflicts).toMatchObject([{ kind: 'localDeleted', sectionId: id }]);
    expect(textOf(iDeleted.conflicts[0]?.remoteSection ?? undefined)).toBe('edited');
    expect(iDeleted.manuscript.sections.map((s) => s.id)).not.toContain(id);
  });

  it('applies a remote deletion when the section is unchanged locally', () => {
    const original = book();
    const id = original.sections[2]?.id as string;
    const deleted = { ...original, sections: original.sections.filter((s) => s.id !== id) };
    const result = run(baseOf(view(original)), original, deleted, view(deleted, {}, 2, 2));
    expect(result.conflicts).toEqual([]);
    expect(result.manuscript.sections.map((s) => s.id)).toEqual(deleted.sections.map((s) => s.id));
    expect(result.base.sections[id]).toBeUndefined();
  });

  it('keeps a local reorder and a remote edit together', () => {
    const original = book();
    const [a, b, c, d] = original.sections as [Section, Section, Section, Section];
    const reordered = { ...original, sections: [a, c, b, d] };
    const theirs = edit(original, 1, 'theirs');
    const remote = view(theirs, { [b.id]: 2 }, 1, 2);
    const result = run(baseOf(view(original)), reordered, theirs, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.manuscript.sections.map((s) => s.id)).toEqual([a.id, c.id, b.id, d.id]);
    expect(textOf(result.manuscript.sections[2])).toBe('theirs');
    const plan = planPush(result.base, result.manuscript, remote, []);
    expect(plan?.structureChanged).toBe(true);
    expect(plan?.sections).toEqual([]);
  });

  it('places sections added on both devices without losing either', () => {
    const original = book();
    const ids = createSequentialIdGenerator('n');
    const mineNew = createSection({ kind: 'chapter', title: 'Mine', blocks: [createParagraph('m', ids)] }, ids);
    const theirsNew = createSection({ kind: 'chapter', title: 'Theirs', blocks: [createParagraph('t', ids)] }, ids);
    const mine = { ...original, sections: [...original.sections.slice(0, 2), mineNew, ...original.sections.slice(2)] };
    const theirs = { ...original, sections: [...original.sections, theirsNew] };
    const result = run(baseOf(view(original)), mine, theirs, view(theirs, {}, 2, 2));
    expect(result.conflicts).toEqual([]);
    expect(result.manuscript.sections.map((s) => s.title)).toEqual(['Prologue', 'One', 'Mine', 'Two', 'Three', 'Theirs']);
  });

  it('raises a structure conflict for concurrent different reorders but keeps every section', () => {
    const original = book();
    const [a, b, c, d] = original.sections as [Section, Section, Section, Section];
    const mine = { ...original, sections: [a, c, b, d] };
    const theirs = { ...original, sections: [a, b, d, c] };
    const result = run(baseOf(view(original)), mine, theirs, view(theirs, {}, 2, 2));
    expect(result.conflicts.map((x) => x.kind)).toEqual(['structure']);
    expect(result.manuscript).toBe(mine);
    expect(planPush(result.base, mine, view(theirs, {}, 2, 2), result.conflicts)).toBeNull();
  });

  it('merges book details per field and conflicts on the same field', () => {
    const original = book();
    const base = baseOf(view(original));
    const titled = { ...original, title: 'New title' };
    const subtitled = { ...original, subtitle: 'A subtitle' };
    const merged = run(base, titled, subtitled, view(subtitled, {}, 2, 2));
    expect(merged.conflicts).toEqual([]);
    expect(merged.manuscript).toMatchObject({ title: 'New title', subtitle: 'A subtitle' });

    const other = { ...original, title: 'Other title' };
    expect(run(base, titled, other, view(other, {}, 2, 2)).conflicts.map((x) => x.kind)).toEqual(['structure']);
  });

  it('refreshes an open conflict when the server changes again, and clears it when versions match', () => {
    const original = book();
    const id = original.sections[1]?.id as string;
    const mine = edit(original, 1, 'mine');
    const theirs = edit(original, 1, 'theirs');
    const first = run(baseOf(view(original)), mine, theirs, view(theirs, { [id]: 2 }, 1, 2));
    const again = edit(original, 1, 'theirs again');
    const second = run(first.base, mine, again, view(again, { [id]: 3 }, 1, 3), first.conflicts);
    expect(second.conflicts[0]).toMatchObject({ remoteRevision: 3, detectedAt: NOW });
    expect(textOf(second.conflicts[0]?.remoteSection ?? undefined)).toBe('theirs again');
    const cleared = run(second.base, again, again, view(again, { [id]: 3 }, 1, 3), second.conflicts);
    expect(cleared.conflicts).toEqual([]);
    expect(cleared.base.sections[id]?.revision).toBe(3);
  });

  it('refuses server content that does not match the index', () => {
    const original = book();
    const theirs = edit(original, 1, 'theirs');
    const remote = view(theirs, { [original.sections[1]?.id as string]: 2 }, 1, 2);
    expect(() => run(baseOf(view(original)), original, original, remote)).toThrow(/does not match/);
  });
});

describe('planPush', () => {
  it('uploads everything the first time and nothing when clean', () => {
    const original = book();
    const plan = planPush(null, original, null, []);
    expect(plan?.sections).toHaveLength(4);
    expect(plan?.structure.order).toEqual(original.sections.map((s) => s.id));
    const remote = view(original);
    expect(planPush(baseOf(remote), original, remote, [])).toBeNull();
    expect(isCleanAgainstBase(baseOf(remote), original, [])).toBe(true);
  });

  it('writes tombstones for deleted sections and new revisions after commit', () => {
    const original = book();
    const remote = view(original);
    const id = original.sections[3]?.id as string;
    const without = { ...original, sections: original.sections.slice(0, 3) };
    const plan = planPush(baseOf(remote), without, remote, []);
    expect(plan?.sections).toEqual([{ id, section: null, hash: null, expectedRevision: 1 }]);
    if (!plan) throw new Error('expected a plan');
    const next = baseAfterCommit(baseOf(remote), plan, { revision: 2, structureRevision: 2, sectionRevisions: { [id]: 2 } });
    expect(next.sections[id]).toBeUndefined();
    expect(isCleanAgainstBase(next, without, [])).toBe(true);
  });

  it('defers structural changes when the server structure moved (open editor)', () => {
    const original = book();
    const base = baseOf(view(original));
    const ids = createSequentialIdGenerator('n');
    const added = createSection({ kind: 'chapter', title: 'New', blocks: [] }, ids);
    const mine = edit({ ...original, sections: [...original.sections, added] }, 1, 'mine');
    const theirs = { ...original, title: 'Renamed elsewhere' };
    const plan = planPush(base, mine, view(theirs, {}, 2, 2), []);
    expect(plan?.sections.map((w) => w.id)).toEqual([original.sections[1]?.id]);
    expect(plan?.structure.title).toBe('Renamed elsewhere');
    expect(plan?.structure.order).not.toContain(added.id);
  });

  it('adopts units that landed even if the acknowledgement was lost', () => {
    const original = book();
    const mine = edit(original, 1, 'mine');
    const id = original.sections[1]?.id as string;
    const remote = view(mine, { [id]: 2 }, 1, 2);
    const adopted = adoptLandedUnits(baseOf(view(original)), { structureHash: null, sections: { [id]: hashSection(mine.sections[1] as Section) } }, remote);
    expect(adopted.sections[id]?.revision).toBe(2);
    const later = edit(mine, 1, 'typed after push');
    expect(run(adopted, later, mine, remote).conflicts).toEqual([]);
  });
});

describe('resolveConflict', () => {
  function editConflict() {
    const original = book();
    const id = original.sections[1]?.id as string;
    const mine = edit(original, 1, 'mine');
    const theirs = edit(original, 1, 'theirs');
    const remote = view(theirs, { [id]: 2 }, 1, 2);
    const result = run(baseOf(view(original)), mine, theirs, remote);
    const conflict = result.conflicts[0] as SyncConflict;
    const expected = { remoteRevision: conflict.remoteRevision, localHash: conflict.localHash };
    return { id, mine, result, conflict, expected, remote };
  }

  it('keep mine pushes my version against the server revision', () => {
    const { id, result, conflict, expected, remote } = editConflict();
    const resolved = resolveConflict({ manuscript: result.manuscript, base: result.base, conflicts: result.conflicts, conflictId: conflict.id, choice: 'mine', expected });
    if (!resolved.ok) throw new Error(resolved.message);
    expect(resolved.conflicts).toEqual([]);
    const plan = planPush(resolved.base, resolved.manuscript, remote, resolved.conflicts);
    expect(plan?.sections).toMatchObject([{ id, expectedRevision: 2 }]);
  });

  it('keep theirs preserves my version first', () => {
    const { result, conflict, expected, mine, remote } = editConflict();
    const resolved = resolveConflict({ manuscript: result.manuscript, base: result.base, conflicts: result.conflicts, conflictId: conflict.id, choice: 'theirs', expected });
    if (!resolved.ok) throw new Error(resolved.message);
    expect(textOf(resolved.manuscript.sections[1])).toBe('theirs');
    expect(resolved.preserve[0]?.manuscript).toEqual(mine);
    expect(planPush(resolved.base, resolved.manuscript, remote, [])).toBeNull();
  });

  it('keep both adds my version as a new section with fresh IDs', () => {
    const { result, conflict, expected } = editConflict();
    const resolved = resolveConflict({
      manuscript: result.manuscript,
      base: result.base,
      conflicts: result.conflicts,
      conflictId: conflict.id,
      choice: 'both',
      expected,
      idGen: createSequentialIdGenerator('copy'),
    });
    if (!resolved.ok) throw new Error(resolved.message);
    const titles = resolved.manuscript.sections.map((s) => s.title);
    expect(titles).toEqual(['Prologue', 'One', 'One (my version)', 'Two', 'Three']);
    expect(textOf(resolved.manuscript.sections[1])).toBe('theirs');
    expect(textOf(resolved.manuscript.sections[2])).toBe('mine');
    const allIds = resolved.manuscript.sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)]);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(ManuscriptSchema.safeParse(resolved.manuscript).success).toBe(true);
  });

  it('refuses when either version changed since it was shown, and is retry-safe', () => {
    const { result, conflict, expected } = editConflict();
    const stale = resolveConflict({ manuscript: result.manuscript, base: result.base, conflicts: result.conflicts, conflictId: conflict.id, choice: 'mine', expected: { ...expected, remoteRevision: 1 } });
    expect(stale).toMatchObject({ ok: false, reason: 'changed' });
    const typed = edit(result.manuscript, 1, 'typed meanwhile');
    expect(resolveConflict({ manuscript: typed, base: result.base, conflicts: result.conflicts, conflictId: conflict.id, choice: 'mine', expected })).toMatchObject({ ok: false, reason: 'changed' });
    expect(resolveConflict({ manuscript: result.manuscript, base: result.base, conflicts: [], conflictId: conflict.id, choice: 'mine', expected })).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('resolves delete-versus-edit without losing text', () => {
    const original = book();
    const base = baseOf(view(original));
    const id = original.sections[2]?.id as string;
    const deleted = { ...original, sections: original.sections.filter((s) => s.id !== id) };
    const edited = edit(original, 2, 'edited');
    const remote = view(edited, { [id]: 2 }, 1, 2);
    const r = run(base, deleted, edited, remote);
    const c = r.conflicts[0] as SyncConflict;
    const expected = { remoteRevision: c.remoteRevision, localHash: c.localHash };
    const theirs = resolveConflict({ manuscript: r.manuscript, base: r.base, conflicts: r.conflicts, conflictId: c.id, choice: 'theirs', expected });
    if (!theirs.ok) throw new Error(theirs.message);
    expect(theirs.manuscript.sections.map((s) => s.id)).toEqual(original.sections.map((s) => s.id));
    const mine = resolveConflict({ manuscript: r.manuscript, base: r.base, conflicts: r.conflicts, conflictId: c.id, choice: 'mine', expected });
    if (!mine.ok) throw new Error(mine.message);
    expect(textOf(mine.preserve[0]?.manuscript.sections.find((s) => s.id === id))).toBe('edited');
    expect(planPush(mine.base, mine.manuscript, remote, [])?.sections).toMatchObject([{ id, section: null, expectedRevision: 2 }]);
  });

  it('keep theirs on a structure conflict keeps every local section', () => {
    const original = book();
    const [a, b, c, d] = original.sections as [Section, Section, Section, Section];
    const ids = createSequentialIdGenerator('n');
    const extra = createSection({ kind: 'chapter', title: 'Extra', blocks: [] }, ids);
    const mine = { ...original, sections: [a, c, b, d, extra] };
    const theirsBook = { ...original, sections: [a, b, d, c] };
    const remote = view(theirsBook, {}, 2, 2);
    const r = run(baseOf(view(original)), mine, theirsBook, remote);
    const conflict = r.conflicts[0] as SyncConflict;
    const resolved = resolveConflict({
      manuscript: r.manuscript,
      base: r.base,
      conflicts: r.conflicts,
      conflictId: 'structure',
      choice: 'theirs',
      expected: { remoteRevision: conflict.remoteRevision, localHash: conflict.localHash },
    });
    if (!resolved.ok) throw new Error(resolved.message);
    expect(resolved.manuscript.sections.map((s) => s.id)).toEqual([a.id, b.id, d.id, extra.id, c.id]);
    expect(resolveConflict({ manuscript: r.manuscript, base: r.base, conflicts: r.conflicts, conflictId: 'structure', choice: 'both', expected: { remoteRevision: 2, localHash: conflict.localHash } })).toMatchObject({ ok: false, reason: 'not_applicable' });
  });
});

describe('helpers', () => {
  it('chunks text without splitting surrogate pairs and reassembles exactly', () => {
    const text = `${'a'.repeat(9)}😀${'b'.repeat(10)}`;
    const chunks = chunkText(text, 10);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
    expect(chunks[0]).toBe('a'.repeat(9));
    expect(chunkText('', 10)).toEqual(['']);
  });

  it('weaves orders deterministically', () => {
    expect(weaveOrder(['a', 'c'], ['a', 'b', 'c', 'd'], new Set(['a', 'b', 'c', 'd']))).toEqual(['a', 'b', 'c', 'd']);
    expect(weaveOrder(['c', 'a'], ['x', 'a'], new Set(['a', 'c', 'x']))).toEqual(['x', 'c', 'a']);
  });
});
