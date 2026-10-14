/**
 * Codes follow Firestore's where they overlap. `too_large`, `invalid_data`, `unsupported_version`
 * and `wrong_account` are raised by this package before or instead of a server call.
 */
export type RemoteErrorCode =
  | 'unavailable'
  | 'deadline-exceeded'
  | 'aborted'
  | 'resource-exhausted'
  | 'internal'
  | 'cancelled'
  | 'unknown'
  | 'permission-denied'
  | 'unauthenticated'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'already-exists'
  | 'out-of-range'
  | 'unimplemented'
  | 'data-loss'
  | 'too_large'
  | 'invalid_data'
  | 'unsupported_version'
  | 'wrong_account';

const RETRYABLE = new Set<RemoteErrorCode>(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal', 'cancelled', 'unknown']);

const MESSAGES: Partial<Record<RemoteErrorCode, string>> = {
  unavailable: 'Can’t reach the cloud right now. Your changes are saved on this device and will sync when you’re back online.',
  'permission-denied': 'The cloud refused this change. Your work is still saved on this device.',
  unauthenticated: 'You’re signed out. Sign in again to sync; your work is saved on this device.',
  too_large: 'This change is too large to sync in one step. Your work is saved on this device.',
  invalid_data: 'The cloud copy of this manuscript is damaged, so it was not downloaded. Your device copy is unchanged.',
  unsupported_version: 'The cloud copy was saved by a newer version of Folio Loom. Update the app to sync it; nothing was changed.',
  wrong_account: 'A different account is signed in, so sync stopped. Nothing was uploaded.',
};

export class RemoteError extends Error {
  readonly code: RemoteErrorCode;
  readonly detail: string | undefined;

  constructor(code: RemoteErrorCode, options: { message?: string; detail?: string; cause?: unknown } = {}) {
    super(options.message ?? MESSAGES[code] ?? 'Sync failed. Your work is saved on this device and sync will retry.', { cause: options.cause });
    this.name = 'RemoteError';
    this.code = code;
    this.detail = options.detail;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** The server moved on since this device last read it; re-read and merge, never overwrite. */
export class StaleCommitError extends Error {
  constructor(detail: string) {
    super(`The cloud copy changed during sync (${detail}).`);
    this.name = 'StaleCommitError';
  }
}

const CODES = new Set<string>([...RETRYABLE, 'permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition', 'not-found', 'already-exists', 'out-of-range', 'unimplemented', 'data-loss']);

/** Normalizes SDK errors (Firestore `code` strings, possibly prefixed `firestore/`). */
export function toRemoteError(error: unknown): RemoteError | StaleCommitError {
  if (error instanceof RemoteError || error instanceof StaleCommitError) return error;
  const raw = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  const code = raw.replace(/^firestore\//, '');
  const detail = error instanceof Error ? error.message : undefined;
  if (CODES.has(code)) return new RemoteError(code as RemoteErrorCode, { detail, cause: error });
  return new RemoteError('unknown', { detail, cause: error });
}
