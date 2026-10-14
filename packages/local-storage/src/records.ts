import type { BookRow, RevisionRow } from './driver';
import type { ManuscriptSummary, QuarantinedContent, RevisionReason, RevisionSummary } from './types';

const REASONS: readonly RevisionReason[] = ['create', 'edit', 'restore'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
const isText = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** Returns the row if every field has the expected type, otherwise `null`. */
export function readBookRow(raw: unknown): BookRow | null {
  if (!isRecord(raw)) return null;
  const { ownerUid, bookId, title, wordCount, schemaVersion, localRevision, checksum, dirty, syncedRevision, createdAt, updatedAt } = raw;
  if (
    !isText(ownerUid) ||
    !isText(bookId) ||
    !isText(title) ||
    !isCount(wordCount) ||
    !isRevision(schemaVersion) ||
    !isRevision(localRevision) ||
    !isText(checksum) ||
    typeof dirty !== 'boolean' ||
    !(syncedRevision === null || isCount(syncedRevision)) ||
    !isText(createdAt) ||
    !isText(updatedAt)
  ) {
    return null;
  }
  return { ownerUid, bookId, title, wordCount, schemaVersion, localRevision, checksum, dirty, syncedRevision, createdAt, updatedAt };
}

export function toSummary(row: BookRow): ManuscriptSummary {
  return { ...row, health: 'ok' };
}

/** Damaged rows are still listed so the author can see them and recover or delete them. */
export function unreadableSummary(raw: unknown, ownerUid: string): ManuscriptSummary {
  const record = isRecord(raw) ? raw : {};
  const text = (value: unknown, fallback: string) => (isText(value) ? value : fallback);
  return {
    bookId: text(record.bookId, ''),
    ownerUid,
    title: text(record.title, 'Unreadable manuscript'),
    wordCount: isCount(record.wordCount) ? record.wordCount : 0,
    localRevision: isRevision(record.localRevision) ? record.localRevision : 0,
    dirty: record.dirty === true,
    syncedRevision: isCount(record.syncedRevision) ? record.syncedRevision : null,
    schemaVersion: isRevision(record.schemaVersion) ? record.schemaVersion : 0,
    createdAt: text(record.createdAt, ''),
    updatedAt: text(record.updatedAt, ''),
    health: 'unreadable',
  };
}

export function readRevisionRow(raw: unknown): RevisionRow | null {
  if (!isRecord(raw)) return null;
  const { ownerUid, bookId, revision, schemaVersion, checksum, wordCount, reason, savedAt } = raw;
  if (
    !isText(ownerUid) ||
    !isText(bookId) ||
    !isRevision(revision) ||
    !isRevision(schemaVersion) ||
    !isText(checksum) ||
    !isCount(wordCount) ||
    !REASONS.includes(reason as RevisionReason) ||
    !isText(savedAt)
  ) {
    return null;
  }
  return { ownerUid, bookId, revision, schemaVersion, checksum, wordCount, reason: reason as RevisionReason, savedAt };
}

export function toRevisionSummary(row: RevisionRow): RevisionSummary {
  const { ownerUid: _owner, ...summary } = row;
  return summary;
}

export function readQuarantine(raw: unknown): QuarantinedContent | null {
  if (!isRecord(raw)) return null;
  const { id, bookId, revision, reason, capturedAt, content } = raw;
  if (!isCount(id) || !isText(bookId) || !(revision === null || isCount(revision)) || !isText(reason) || !isText(capturedAt)) return null;
  return { id, bookId, revision, reason, capturedAt, content: isText(content) ? content : null };
}
