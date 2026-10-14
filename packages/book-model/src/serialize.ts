import { MANUSCRIPT_SCHEMA_VERSION, ManuscriptSchema } from './schema';
import type { Manuscript } from './types';

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseManuscriptResult =
  | { ok: true; manuscript: Manuscript; migratedFrom: number | null }
  | {
      ok: false;
      error: 'invalid_json' | 'not_an_object' | 'missing_version' | 'unsupported_version' | 'invalid_document';
      message: string;
      issues: SchemaIssue[];
    };

type RawDocument = Record<string, unknown>;

/**
 * `migrations[n]` upgrades a version-n document to version n+1. Migrations must be pure and
 * lossless; anything that cannot be represented must be preserved explicitly, not dropped.
 */
const migrations: Readonly<Record<number, (doc: RawDocument) => RawDocument>> = {};

export class ManuscriptValidationError extends Error {
  readonly issues: SchemaIssue[];

  constructor(message: string, issues: SchemaIssue[]) {
    super(message);
    this.name = 'ManuscriptValidationError';
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is RawDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }));
}

export function parseManuscript(input: unknown): ParseManuscriptResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'not_an_object', message: 'Manuscript must be a JSON object.', issues: [] };
  }
  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, error: 'missing_version', message: 'Manuscript has no integer schemaVersion.', issues: [] };
  }
  if (version > MANUSCRIPT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'unsupported_version',
      message: `Manuscript schema v${version} is newer than this app supports (v${MANUSCRIPT_SCHEMA_VERSION}). Update the app; the document was not modified.`,
      issues: [],
    };
  }

  let doc: RawDocument = input;
  let current = version;
  while (current < MANUSCRIPT_SCHEMA_VERSION) {
    const migrate = migrations[current];
    if (!migrate) {
      return {
        ok: false,
        error: 'unsupported_version',
        message: `No migration registered from schema v${current}.`,
        issues: [],
      };
    }
    doc = migrate(doc);
    current += 1;
  }

  const result = ManuscriptSchema.safeParse(doc);
  if (!result.success) {
    return {
      ok: false,
      error: 'invalid_document',
      message: 'Manuscript does not match the canonical schema.',
      issues: toIssues(result.error),
    };
  }
  return { ok: true, manuscript: result.data, migratedFrom: version === MANUSCRIPT_SCHEMA_VERSION ? null : version };
}

export function deserializeManuscript(json: string): ParseManuscriptResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: 'invalid_json',
      message: error instanceof Error ? error.message : 'Invalid JSON.',
      issues: [],
    };
  }
  return parseManuscript(parsed);
}

/** Validates before serializing so an invalid in-memory model is never persisted. */
export function serializeManuscript(manuscript: Manuscript): string {
  const result = ManuscriptSchema.safeParse(manuscript);
  if (!result.success) {
    throw new ManuscriptValidationError('Refusing to serialize an invalid manuscript.', toIssues(result.error));
  }
  return JSON.stringify(result.data);
}
