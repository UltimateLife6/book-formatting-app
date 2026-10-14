import type { BookMetadata, Manuscript, Part, Section } from '@folio-loom/book-model';
import { stableHash } from './hash';

/** Everything about a book except section content: one sync unit. */
export interface BookStructure {
  title: string;
  subtitle?: string;
  authors: string[];
  language: string;
  metadata: BookMetadata;
  createdAt: string;
  parts: Part[];
  /** Section IDs in reading order. */
  order: string[];
}

export interface UnitVersion {
  revision: number;
  hash: string;
}

/**
 * What this device last saw on the server, per unit. A unit changed locally when its current hash
 * differs from the base hash; it changed remotely when the server revision differs from the base.
 */
export interface SyncBase {
  headRevision: number;
  structure: UnitVersion & { value: BookStructure };
  /** Live sections only. A section missing here was never synced or is deleted on the server. */
  sections: Record<string, UnitVersion>;
}

/** The committed server state of a book, as read from its head document. */
export interface RemoteBookView {
  revision: number;
  structureRevision: number;
  structure: BookStructure;
  /** Live sections (in `structure.order`) with their current revision and hash. */
  sections: Record<string, UnitVersion & { chunkCount: number }>;
  deleted: boolean;
  recentOps: string[];
}

export function structureOf(manuscript: Manuscript): BookStructure {
  const structure: BookStructure = {
    title: manuscript.title,
    authors: manuscript.authors,
    language: manuscript.language,
    metadata: manuscript.metadata,
    createdAt: manuscript.createdAt,
    parts: manuscript.parts,
    order: manuscript.sections.map((section) => section.id),
  };
  if (manuscript.subtitle !== undefined) structure.subtitle = manuscript.subtitle;
  return structure;
}

export const hashStructure = (structure: BookStructure): string => stableHash(structure);
export const hashSection = (section: Section): string => stableHash(section);

export class SyncIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncIntegrityError';
  }
}

/** Rebuilds a manuscript; every ID in `structure.order` must have content. */
export function assembleManuscript(
  id: string,
  schemaVersion: Manuscript['schemaVersion'],
  structure: BookStructure,
  sections: ReadonlyMap<string, Section>,
  updatedAt: string,
): Manuscript {
  const ordered = structure.order.map((sectionId) => {
    const section = sections.get(sectionId);
    if (!section) throw new SyncIntegrityError(`Section ${sectionId} is in the order but has no content.`);
    return section;
  });
  const manuscript: Manuscript = {
    schemaVersion,
    id,
    title: structure.title,
    authors: structure.authors,
    language: structure.language,
    metadata: structure.metadata,
    sections: ordered,
    parts: structure.parts,
    createdAt: structure.createdAt,
    updatedAt,
  };
  if (structure.subtitle !== undefined) manuscript.subtitle = structure.subtitle;
  return manuscript;
}

/** Splits text into chunks of at most `size` UTF-16 units without splitting a surrogate pair. */
export function chunkText(text: string, size: number): string[] {
  if (size < 2) throw new RangeError('chunk size must be at least 2');
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [''];
}
