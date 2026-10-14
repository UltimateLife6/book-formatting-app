import { createId, type IdGenerator, type Manuscript, type Section } from '@folio-loom/book-model';
import { weaveOrder, withMembers } from './merge';
import type { SyncConflict } from './reconcile';
import { assembleManuscript, type BookStructure, hashSection, hashStructure, type SyncBase, structureOf } from './units';

export type ConflictChoice = 'mine' | 'theirs' | 'both';

export interface ResolutionInput {
  manuscript: Manuscript;
  base: SyncBase;
  conflicts: readonly SyncConflict[];
  conflictId: string;
  choice: ConflictChoice;
  /** The versions the author saw; resolution is refused if either changed since. */
  expected: { remoteRevision: number; localHash: string | null };
  idGen?: IdGenerator;
}

export type ResolutionResult =
  | {
      ok: true;
      manuscript: Manuscript;
      base: SyncBase;
      conflicts: SyncConflict[];
      /** Whole-book copies to preserve locally, in the same transaction, before applying. */
      preserve: { manuscript: Manuscript; reason: string }[];
      /** Book-level: re-publish a book deleted elsewhere, or delete the local copy. */
      undelete?: boolean;
      deleteLocal?: boolean;
    }
  | { ok: false; reason: 'not_found' | 'changed' | 'not_applicable'; message: string };

export const CHOICES_BY_KIND: Record<SyncConflict['kind'], readonly ConflictChoice[]> = {
  edit: ['mine', 'theirs', 'both'],
  remoteDeleted: ['mine', 'theirs', 'both'],
  localDeleted: ['mine', 'theirs', 'both'],
  structure: ['mine', 'theirs'],
  bookDeleted: ['mine', 'theirs'],
};

/** Current local hash of the unit a conflict is about (`null` = absent locally). */
export function localHashFor(manuscript: Manuscript, conflict: SyncConflict): string | null {
  if (conflict.kind === 'structure') return hashStructure(structureOf(manuscript));
  if (conflict.kind === 'bookDeleted') return null;
  const section = manuscript.sections.find((entry) => entry.id === conflict.sectionId);
  return section ? hashSection(section) : null;
}

function copyOf(section: Section, idGen: IdGenerator): Section {
  return {
    ...section,
    id: idGen('sec'),
    title: section.title ? `${section.title} (my version)` : 'My version',
    blocks: section.blocks.map((block) => ({ ...block, id: idGen('blk') })),
  };
}

function rebuild(manuscript: Manuscript, structure: BookStructure, sections: Map<string, Section>): Manuscript {
  return assembleManuscript(manuscript.id, manuscript.schemaVersion, structure, sections, manuscript.updatedAt);
}

/** Inserts `id` where the other side has it, relative to its neighbours. */
function placeLike(order: readonly string[], remoteOrder: readonly string[], id: string): string[] {
  return weaveOrder(order, remoteOrder, new Set([...order, id]));
}

/**
 * Applies the author's choice. Pure: the caller stores the result atomically (with any preserved
 * copies), then pushes through the normal compare-and-set path, so if the server changed again
 * meanwhile a new conflict is raised instead of overwriting it.
 */
export function resolveConflict(input: ResolutionInput): ResolutionResult {
  const { manuscript, base, choice } = input;
  const idGen = input.idGen ?? createId;
  const conflict = input.conflicts.find((entry) => entry.id === input.conflictId);
  if (!conflict) return { ok: false, reason: 'not_found', message: 'This conflict was already resolved.' };
  if (!CHOICES_BY_KIND[conflict.kind].includes(choice)) {
    return { ok: false, reason: 'not_applicable', message: `"${choice}" is not available for this conflict.` };
  }
  if (conflict.remoteRevision !== input.expected.remoteRevision || localHashFor(manuscript, conflict) !== input.expected.localHash) {
    return { ok: false, reason: 'changed', message: 'One of the versions changed while you were looking. Review the updated versions and choose again.' };
  }
  const conflicts = input.conflicts.filter((entry) => entry.id !== conflict.id);
  const nextBase: SyncBase = { ...base, sections: { ...base.sections } };
  const sections = new Map(manuscript.sections.map((section) => [section.id, section]));
  const structure = structureOf(manuscript);
  const preserveMine = (reason: string) => [{ manuscript, reason }];
  const done = (next: Manuscript, preserve: { manuscript: Manuscript; reason: string }[] = []) =>
    ({ ok: true, manuscript: next, base: nextBase, conflicts, preserve }) as const;

  if (conflict.kind === 'bookDeleted') {
    if (choice === 'mine') return { ...done(manuscript), undelete: true };
    return { ...done(manuscript, preserveMine('Kept the deletion from another device')), deleteLocal: true };
  }

  if (conflict.kind === 'structure') {
    const remote = conflict.remoteStructure;
    if (!remote || conflict.remoteHash === null) return { ok: false, reason: 'not_applicable', message: 'The server structure is missing.' };
    nextBase.structure = { revision: conflict.remoteRevision, hash: conflict.remoteHash, value: remote };
    const adopted = rebuild(manuscript, withMembers(remote, structure.order, new Set(sections.keys())), sections);
    if (choice === 'mine') return done(manuscript, [{ manuscript: adopted, reason: 'The other device’s book order and details, replaced by yours' }]);
    return done(adopted, preserveMine('Replaced by the other device’s book order and details'));
  }

  const id = conflict.sectionId as string;
  const mine = sections.get(id) ?? null;
  const theirs = conflict.remoteSection;
  const adoptTheirs = () => {
    if (theirs && conflict.remoteHash) {
      sections.set(id, theirs);
      nextBase.sections[id] = { revision: conflict.remoteRevision, hash: conflict.remoteHash };
    }
  };

  if (conflict.kind === 'edit') {
    if (!mine || !theirs || !conflict.remoteHash) return { ok: false, reason: 'not_applicable', message: 'One version is missing.' };
    if (choice === 'mine') {
      nextBase.sections[id] = { revision: conflict.remoteRevision, hash: conflict.remoteHash };
      const withTheirs = rebuild(manuscript, structure, new Map(sections).set(id, theirs));
      return done(manuscript, [{ manuscript: withTheirs, reason: `The other device’s version of “${theirs.title}”, replaced by yours` }]);
    }
    adoptTheirs();
    if (choice === 'theirs') return done(rebuild(manuscript, structure, sections), preserveMine(`Replaced “${mine.title}” with the other device’s version`));
    const copy = copyOf(mine, idGen);
    sections.set(copy.id, copy);
    const order = [...structure.order];
    order.splice(order.indexOf(id) + 1, 0, copy.id);
    const parts = structure.parts.map((part) => (part.sectionIds.includes(id) ? { ...part, sectionIds: [...part.sectionIds, copy.id] } : part));
    return done(rebuild(manuscript, withMembers({ ...structure, order, parts }, [], new Set(order)), sections));
  }

  if (conflict.kind === 'remoteDeleted') {
    if (!mine) return { ok: false, reason: 'not_applicable', message: 'Your version is missing.' };
    delete nextBase.sections[id];
    if (choice === 'mine') return done(manuscript);
    if (choice === 'theirs') {
      sections.delete(id);
      const order = structure.order.filter((entry) => entry !== id);
      return done(rebuild(manuscript, withMembers(structure, [], new Set(order)), sections), preserveMine(`Removed “${mine.title}” (deleted on another device)`));
    }
    const copy = copyOf(mine, idGen);
    sections.delete(id);
    sections.set(copy.id, copy);
    const order = structure.order.map((entry) => (entry === id ? copy.id : entry));
    const parts = structure.parts.map((part) => ({ ...part, sectionIds: part.sectionIds.map((entry) => (entry === id ? copy.id : entry)) }));
    return done(rebuild(manuscript, withMembers({ ...structure, order, parts }, [], new Set(order)), sections));
  }

  // localDeleted: I deleted it, the other device edited it.
  if (!theirs || !conflict.remoteHash) return { ok: false, reason: 'not_applicable', message: 'The other device’s version is missing.' };
  const remoteOrder = conflict.remoteStructure?.order ?? base.structure.value?.order ?? [];
  const withTheirs = new Map(sections).set(id, theirs);
  const restored = rebuild(manuscript, withMembers({ ...structure, order: placeLike(structure.order, remoteOrder, id) }, [], new Set([...sections.keys(), id])), withTheirs);
  nextBase.sections[id] = { revision: conflict.remoteRevision, hash: conflict.remoteHash };
  if (choice === 'mine') return done(manuscript, [{ manuscript: restored, reason: `Deleted “${theirs.title}” although it was edited on another device` }]);
  return done(restored);
}
