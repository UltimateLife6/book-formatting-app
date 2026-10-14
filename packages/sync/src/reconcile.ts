import type { Manuscript, Section } from '@folio-loom/book-model';
import { mergeStructure, weaveOrder, withMembers } from './merge';
import {
  assembleManuscript,
  type BookStructure,
  hashSection,
  hashStructure,
  type RemoteBookView,
  type SyncBase,
  SyncIntegrityError,
  structureOf,
  type UnitVersion,
} from './units';

/**
 * - `edit`: both sides changed the section.
 * - `remoteDeleted`: I edited it, the other device deleted it.
 * - `localDeleted`: I deleted it, the other device edited it.
 * - `structure`: concurrent reorders or different values for the same book field.
 * - `bookDeleted`: the book was deleted elsewhere while this device has unsynced changes.
 */
export type ConflictKind = 'edit' | 'remoteDeleted' | 'localDeleted' | 'structure' | 'bookDeleted';

export interface SyncConflict {
  /** `section:<id>`, `structure` or `book`. */
  id: string;
  kind: ConflictKind;
  sectionId: string | null;
  title: string;
  /** Server revision of the unit when last seen (section, structure or head revision). */
  remoteRevision: number;
  remoteHash: string | null;
  /** The server version, kept so it can be shown and adopted without another read. */
  remoteSection: Section | null;
  remoteStructure: BookStructure | null;
  /** Local version hash when last checked; `null` = deleted locally. */
  localHash: string | null;
  detectedAt: string;
}

export const sectionConflictId = (sectionId: string) => `section:${sectionId}`;

export function emptyBase(structure: BookStructure | null = null): SyncBase {
  return {
    headRevision: 0,
    structure: { revision: 0, hash: '', value: structure ?? (null as unknown as BookStructure) },
    sections: {},
  };
}

const hasBaseStructure = (base: SyncBase) => base.structure.revision > 0;

/** Sections whose server content this device hasn't seen yet. */
export function sectionsToFetch(base: SyncBase | null, remote: RemoteBookView, conflicts: readonly SyncConflict[]): string[] {
  const known = new Map<string, number>();
  for (const [id, entry] of Object.entries(base?.sections ?? {})) known.set(id, entry.revision);
  for (const conflict of conflicts) if (conflict.sectionId) known.set(conflict.sectionId, conflict.remoteRevision);
  return Object.entries(remote.sections)
    .filter(([id, entry]) => known.get(id) !== entry.revision)
    .map(([id]) => id);
}

export interface ReconcileInput {
  base: SyncBase | null;
  local: Manuscript;
  remote: RemoteBookView;
  /** Content for (at least) every ID returned by `sectionsToFetch`. */
  remoteSections: ReadonlyMap<string, Section>;
  conflicts: readonly SyncConflict[];
  now: string;
}

export interface ReconcileResult {
  manuscript: Manuscript;
  /** `manuscript` differs from the local input and must be written locally. */
  changedLocal: boolean;
  base: SyncBase;
  conflicts: SyncConflict[];
}

function remoteContent(input: ReconcileInput, id: string, expected: UnitVersion): Section {
  const section = input.remoteSections.get(id);
  if (!section || hashSection(section) !== expected.hash) {
    throw new SyncIntegrityError(`Server content for section ${id} is missing or does not match its index.`);
  }
  return section;
}

/**
 * Three-way merge of base, local and committed remote state. Never discards content: a unit
 * changed on both sides becomes a conflict and keeps the local version until the author decides.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const { local, remote } = input;
  const base: SyncBase = input.base ?? emptyBase();
  const newBase: SyncBase = { ...base, sections: { ...base.sections } };
  const existing = new Map(input.conflicts.map((conflict) => [conflict.id, conflict]));
  const conflicts: SyncConflict[] = [];
  const localSections = new Map(local.sections.map((section) => [section.id, section]));
  const merged = new Map(localSections);
  let sectionsChanged = false;

  const ids = new Set<string>([...Object.keys(base.sections), ...localSections.keys(), ...Object.keys(remote.sections)]);
  for (const id of ids) {
    const mine = localSections.get(id);
    const localHash = mine ? hashSection(mine) : null;
    const theirs = remote.sections[id];
    const known = base.sections[id];
    const previous = existing.get(sectionConflictId(id));

    if (previous) {
      if ((theirs?.hash ?? null) === localHash) {
        if (theirs) newBase.sections[id] = { revision: theirs.revision, hash: theirs.hash };
        else delete newBase.sections[id];
        continue;
      }
      const remoteMoved = theirs ? theirs.revision !== previous.remoteRevision || previous.remoteHash !== theirs.hash : previous.remoteHash !== null;
      const remoteSection = theirs ? (remoteMoved ? remoteContent(input, id, theirs) : previous.remoteSection) : null;
      conflicts.push({
        ...previous,
        kind: mine ? (theirs ? 'edit' : 'remoteDeleted') : 'localDeleted',
        title: (mine ?? remoteSection)?.title ?? previous.title,
        remoteRevision: theirs ? theirs.revision : previous.remoteRevision,
        remoteHash: theirs?.hash ?? null,
        remoteSection,
        localHash,
      });
      continue;
    }

    const localChanged = known ? localHash !== known.hash : mine !== undefined;
    const remoteChanged = theirs ? !known || theirs.revision !== known.revision : known !== undefined;
    if (!remoteChanged) continue;
    if (!localChanged) {
      if (theirs) {
        merged.set(id, remoteContent(input, id, theirs));
        newBase.sections[id] = { revision: theirs.revision, hash: theirs.hash };
      } else {
        merged.delete(id);
        delete newBase.sections[id];
      }
      sectionsChanged = true;
      continue;
    }
    if (theirs && localHash === theirs.hash) {
      newBase.sections[id] = { revision: theirs.revision, hash: theirs.hash };
      continue;
    }
    if (!theirs && !mine) {
      delete newBase.sections[id];
      continue;
    }
    const remoteSection = theirs ? remoteContent(input, id, theirs) : null;
    conflicts.push({
      id: sectionConflictId(id),
      kind: mine ? (theirs ? 'edit' : 'remoteDeleted') : 'localDeleted',
      sectionId: id,
      title: (mine ?? remoteSection)?.title ?? 'Untitled section',
      remoteRevision: theirs?.revision ?? known?.revision ?? 0,
      remoteHash: theirs?.hash ?? null,
      remoteSection,
      remoteStructure: null,
      localHash,
      detectedAt: input.now,
    });
  }

  const members = new Set(merged.keys());
  const localStructure = structureOf(local);
  const remoteStructureHash = hashStructure(remote.structure);
  const previousStructure = existing.get('structure');
  let structure: BookStructure;

  if (previousStructure) {
    structure = withMembers(localStructure, remote.structure.order, members);
    if (hashStructure(structure) === remoteStructureHash) {
      newBase.structure = { revision: remote.structureRevision, hash: remoteStructureHash, value: remote.structure };
    } else {
      conflicts.push({
        ...previousStructure,
        title: structure.title,
        remoteRevision: remote.structureRevision,
        remoteHash: remoteStructureHash,
        remoteStructure: remote.structure,
        localHash: hashStructure(structure),
      });
    }
  } else if (hasBaseStructure(base) && remote.structureRevision === base.structure.revision) {
    structure = withMembers(localStructure, remote.structure.order, members);
  } else {
    const result = mergeStructure(hasBaseStructure(base) ? base.structure.value : null, localStructure, remote.structure, members);
    structure = result.structure;
    const unchangedLocally = hasBaseStructure(base) && hashStructure(localStructure) === base.structure.hash;
    if (result.conflict && !unchangedLocally) {
      structure = withMembers(localStructure, remote.structure.order, members);
      conflicts.push({
        id: 'structure',
        kind: 'structure',
        sectionId: null,
        title: structure.title,
        remoteRevision: remote.structureRevision,
        remoteHash: remoteStructureHash,
        remoteSection: null,
        remoteStructure: remote.structure,
        localHash: hashStructure(structure),
        detectedAt: input.now,
      });
    } else {
      if (unchangedLocally) structure = withMembers(remote.structure, localStructure.order, members);
      newBase.structure = { revision: remote.structureRevision, hash: remoteStructureHash, value: remote.structure };
    }
  }

  newBase.headRevision = remote.revision;
  const structureChanged = hashStructure(structure) !== hashStructure(localStructure);
  const changedLocal = sectionsChanged || structureChanged;
  const manuscript = changedLocal ? assembleManuscript(local.id, local.schemaVersion, structure, merged, local.updatedAt) : local;
  return { manuscript, changedLocal, base: newBase, conflicts };
}

export interface SectionWrite {
  id: string;
  /** `null` writes a tombstone. */
  section: Section | null;
  hash: string | null;
  /** Server revision this write replaces (`null`: no live section on the server). */
  expectedRevision: number | null;
}

export interface PushPlan {
  structure: BookStructure;
  structureHash: string;
  structureChanged: boolean;
  sections: SectionWrite[];
  /** Section IDs in `structure.order` that are not written and must keep their server entry. */
  unchanged: string[];
}

/**
 * The commit this device should make: every unit that differs from the base, isn't in conflict,
 * and whose server version still equals the base. `remote === null` means a first upload.
 */
export function planPush(
  base: SyncBase | null,
  manuscript: Manuscript,
  remote: RemoteBookView | null,
  conflicts: readonly SyncConflict[],
  options: { force?: boolean } = {},
): PushPlan | null {
  const known: SyncBase = remote ? (base ?? emptyBase()) : emptyBase();
  const conflicted = new Set(conflicts.map((conflict) => conflict.sectionId).filter((id): id is string => id !== null));
  const structureConflict = conflicts.some((conflict) => conflict.kind === 'structure');
  const remoteSections = remote?.sections ?? {};
  const localStructure = structureOf(manuscript);
  const structurePushable =
    !structureConflict && (!remote || (hasBaseStructure(known) && known.structure.revision === remote.structureRevision));
  const localSections = new Map(manuscript.sections.map((section) => [section.id, section]));

  const members = new Set<string>();
  const writes: SectionWrite[] = [];
  const ids = new Set<string>([...Object.keys(known.sections), ...localSections.keys(), ...Object.keys(remoteSections)]);
  for (const id of ids) {
    const theirs = remoteSections[id];
    const mine = localSections.get(id);
    const was = known.sections[id];
    const remoteMatchesBase = theirs ? was?.revision === theirs.revision : was === undefined;
    const membershipChange = (mine !== undefined) !== (theirs !== undefined);
    const pushable = !conflicted.has(id) && remoteMatchesBase && (structurePushable || !membershipChange);
    if (!pushable) {
      if (theirs) members.add(id);
      continue;
    }
    if (mine) members.add(id);
    const hash = mine ? hashSection(mine) : null;
    if (mine && hash !== was?.hash) writes.push({ id, section: mine, hash, expectedRevision: theirs?.revision ?? null });
    if (!mine && was) writes.push({ id, section: null, hash: null, expectedRevision: theirs?.revision ?? null });
  }

  const source = structurePushable || !remote ? localStructure : remote.structure;
  const other = source === localStructure ? (remote?.structure.order ?? []) : localStructure.order;
  const structure = withMembers(source, other, members);
  const structureHash = hashStructure(structure);
  const structureChanged = !remote || structureHash !== hashStructure(remote.structure);
  if (!structureChanged && writes.length === 0 && !options.force) return null;
  const written = new Set(writes.map((write) => write.id));
  return { structure, structureHash, structureChanged, sections: writes, unchanged: structure.order.filter((id) => !written.has(id)) };
}

/** Base after `plan` committed as head `revision` with the given new section revisions. */
export function baseAfterCommit(
  base: SyncBase | null,
  plan: PushPlan,
  commit: { revision: number; structureRevision: number; sectionRevisions: Record<string, number> },
): SyncBase {
  const next: SyncBase = {
    headRevision: commit.revision,
    structure: { revision: commit.structureRevision, hash: plan.structureHash, value: plan.structure },
    sections: { ...(base?.sections ?? {}) },
  };
  for (const write of plan.sections) {
    const revision = commit.sectionRevisions[write.id];
    if (write.section && write.hash && revision !== undefined) next.sections[write.id] = { revision, hash: write.hash };
    else delete next.sections[write.id];
  }
  return next;
}

/**
 * After a commit whose acknowledgement may have been lost: adopt server units that equal what
 * was pushed, so this device doesn't mistake its own write for someone else's.
 */
export function adoptLandedUnits(
  base: SyncBase | null,
  pushed: { structureHash: string | null; sections: Record<string, string | null> },
  remote: RemoteBookView,
): SyncBase {
  const next: SyncBase = base ? { ...base, sections: { ...base.sections } } : emptyBase();
  for (const [id, hash] of Object.entries(pushed.sections)) {
    const theirs = remote.sections[id];
    if (hash !== null && theirs?.hash === hash) next.sections[id] = { revision: theirs.revision, hash };
    if (hash === null && !theirs) delete next.sections[id];
  }
  if (pushed.structureHash && hashStructure(remote.structure) === pushed.structureHash) {
    next.structure = { revision: remote.structureRevision, hash: pushed.structureHash, value: remote.structure };
  }
  return next;
}

/** True when nothing local differs from the base (and nothing is in conflict). */
export function isCleanAgainstBase(base: SyncBase | null, manuscript: Manuscript, conflicts: readonly SyncConflict[]): boolean {
  if (!base || conflicts.length > 0 || !hasBaseStructure(base)) return false;
  if (hashStructure(structureOf(manuscript)) !== base.structure.hash) return false;
  if (manuscript.sections.length !== Object.keys(base.sections).length) return false;
  return manuscript.sections.every((section) => base.sections[section.id]?.hash === hashSection(section));
}

export { weaveOrder };
