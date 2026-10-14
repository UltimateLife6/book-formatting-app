export type StorageErrorCode =
  | 'not_ready'
  | 'closed'
  | 'not_found'
  /** The stored revision moved on (another tab or window saved); the write was refused, nothing overwritten. */
  | 'stale_revision'
  | 'invalid_manuscript'
  | 'invalid_owner'
  | 'quota_exceeded'
  | 'unavailable'
  | 'unsupported_version'
  | 'corrupt_record'
  | 'confirmation_required'
  | 'write_failed'
  | 'read_failed';

const MESSAGES: Record<StorageErrorCode, string> = {
  not_ready: 'Local storage is not ready yet.',
  closed: 'This library was closed (you may have signed out). Reopen the manuscript to continue.',
  not_found: 'That manuscript is not on this device.',
  stale_revision: 'This manuscript was saved from another window. Reload it before making more changes; nothing was overwritten.',
  invalid_manuscript: 'The manuscript has invalid content and was not saved.',
  invalid_owner: 'No signed-in account for local storage.',
  quota_exceeded: 'Your device or browser is out of storage space, so the manuscript could not be saved. Free up space and retry.',
  unavailable: 'Local storage is unavailable in this browser or device.',
  unsupported_version: 'This manuscript was saved by a newer version of Folio Loom. Update the app to open it; it was not modified.',
  corrupt_record: 'This manuscript record is damaged. Earlier saved versions may be restorable.',
  confirmation_required: 'Please confirm the deletion again; the request expired or the manuscript changed.',
  write_failed: 'The manuscript could not be saved. Your changes are still open; retry to save them.',
  read_failed: 'The manuscript could not be read from local storage.',
};

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  /** Underlying engine message, for diagnostics only. */
  readonly detail: string | undefined;

  constructor(code: StorageErrorCode, options: { message?: string; detail?: string; cause?: unknown } = {}) {
    super(options.message ?? MESSAGES[code], { cause: options.cause });
    this.name = 'StorageError';
    this.code = code;
    this.detail = options.detail;
  }
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' ? error.name : '';
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

/** Maps engine errors (DOMException names, SQLite messages) to a stable code; never throws. */
export function toStorageError(error: unknown, fallback: StorageErrorCode = 'write_failed'): StorageError {
  if (error instanceof StorageError) return error;
  const name = errorName(error);
  const text = errorText(error);
  if (name === 'QuotaExceededError' || /SQLITE_FULL|database or disk is full|quota/i.test(text)) {
    return new StorageError('quota_exceeded', { detail: text || name, cause: error });
  }
  if (/SQLITE_CORRUPT|SQLITE_NOTADB|malformed|not a database/i.test(text)) {
    return new StorageError('corrupt_record', {
      message: 'The local database file is damaged. Nothing was deleted; contact support before reinstalling.',
      detail: text,
      cause: error,
    });
  }
  return new StorageError(fallback, { detail: text || name || undefined, cause: error });
}
