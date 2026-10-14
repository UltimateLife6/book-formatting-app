import {
  deserializeManuscript,
  IdSchema,
  MANUSCRIPT_SCHEMA_VERSION,
  type Manuscript,
  ManuscriptSchema,
  manuscriptWordCount,
  type Section,
  SectionSchema,
  serializeManuscript,
} from '@folio-loom/book-model';
import {
  assembleManuscript,
  type BookStructure,
  chunkText,
  hashSection,
  hashStructure,
  type PushPlan,
  type RemoteBookView,
  stableHash,
} from '@folio-loom/sync';
import { z } from 'zod';
import { type DocData, type DocStore, SERVER_TIME } from './docstore';
import { RemoteError, StaleCommitError, toRemoteError } from './errors';

export const SYNC_FORMAT = 1;
/** UTF-16 units per chunk: at most ~600 KB of UTF-8, well under Firestore's 1 MiB document limit. */
export const CHUNK_SIZE = 200_000;
export const MAX_COMMIT_WRITES = 450;
export const MAX_COMMIT_BYTES = 9 * 1024 * 1024;
export const MAX_HEAD_BYTES = 900_000;
export const MAX_SECTIONS = 4000;
export const RECENT_OPS = 20;

export type SnapshotReason = 'initialUpload' | 'periodic' | 'manual' | 'beforeRestore' | 'beforeConflictResolution' | 'beforeImport';
export const SNAPSHOT_REASONS: readonly SnapshotReason[] = ['initialUpload', 'periodic', 'manual', 'beforeRestore', 'beforeConflictResolution', 'beforeImport'];

export interface RemoteHead {
  bookId: string;
  view: RemoteBookView;
  schemaVersion: number;
  title: string;
  wordCount: number;
  updatedAt: string | null;
}

export interface SnapshotMeta {
  id: string;
  reason: SnapshotReason;
  headRevision: number;
  contentHash: string;
  sizeBytes: number;
  wordCount: number;
  sectionCount: number;
  chunkCount: number;
  title: string;
  createdAt: string | null;
}

export interface CommitInput {
  opId: string;
  /** Head revision the plan was computed against; `null` = the book must not exist yet. */
  expectedHead: number | null;
  plan: PushPlan;
  schemaVersion: number;
  title: string;
  wordCount: number;
  /** Required to commit over a soft-deleted head (the author chose to keep the book). */
  undelete?: boolean;
}

export interface CommitResult {
  revision: number;
  structureRevision: number;
  sectionRevisions: Record<string, number>;
  /** The op had already been committed (acknowledgement lost); nothing was written. */
  duplicate: boolean;
}

const StructureSchema = ManuscriptSchema.pick({
  title: true,
  subtitle: true,
  authors: true,
  language: true,
  metadata: true,
  parts: true,
  createdAt: true,
}).extend({ order: z.array(IdSchema) });

const IndexSchema = z.record(z.string(), z.tuple([z.number().int().min(1), z.string().min(1), z.number().int().min(1)]));

export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

const isInt = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min;
const invalid = (detail: string): never => {
  throw new RemoteError('invalid_data', { detail });
};

function parseJson(text: unknown, what: string): unknown {
  if (typeof text !== 'string') invalid(`${what} is not a string`);
  try {
    return JSON.parse(text as string);
  } catch {
    return invalid(`${what} is not valid JSON`);
  }
}

function newId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const random = cryptoLike?.randomUUID ? cryptoLike.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}-${random}`;
}

/**
 * The sync protocol over a `DocStore`, bound to one account. Every call first checks that the SDK
 * is still signed in as that account, so a switched session can never write under the wrong UID
 * (the security rules enforce the same on the server).
 */
export class RemoteBooks {
  private readonly chunkSize: number;

  constructor(
    private readonly store: DocStore,
    readonly uid: string,
    options: { chunkSize?: number } = {},
  ) {
    this.chunkSize = options.chunkSize ?? CHUNK_SIZE;
  }

  private assertAccount() {
    const current = this.store.currentUid();
    if (current !== this.uid) throw new RemoteError(current ? 'wrong_account' : 'unauthenticated');
  }

  private async guard<T>(task: () => Promise<T>): Promise<T> {
    this.assertAccount();
    try {
      return await task();
    } catch (error) {
      throw toRemoteError(error);
    }
  }

  private books = () => `users/${this.uid}/manuscripts`;
  private headPath = (bookId: string) => `${this.books()}/${bookId}`;
  private sectionPath = (bookId: string, sectionId: string) => `${this.headPath(bookId)}/sections/${sectionId}`;
  private chunkPath = (bookId: string, sectionId: string, index: number) => `${this.sectionPath(bookId, sectionId)}/chunks/${index}`;
  private snapshotPath = (bookId: string, snapshotId: string) => `${this.headPath(bookId)}/snapshots/${snapshotId}`;

  parseHead(bookId: string, data: DocData): RemoteHead {
    if (data.ownerId !== this.uid) invalid('head owner mismatch');
    if (!isInt(data.syncFormat, 1)) invalid('missing syncFormat');
    if ((data.syncFormat as number) > SYNC_FORMAT || (isInt(data.schemaVersion, 1) && data.schemaVersion > MANUSCRIPT_SCHEMA_VERSION)) {
      throw new RemoteError('unsupported_version', { detail: `syncFormat ${String(data.syncFormat)}, schema ${String(data.schemaVersion)}` });
    }
    if (!isInt(data.schemaVersion, 1) || !isInt(data.revision, 1) || !isInt(data.structureRevision, 1)) invalid('bad head revision fields');
    const structure = StructureSchema.safeParse(parseJson(data.structure, 'structure'));
    if (!structure.success) invalid('structure does not match the schema');
    const index = IndexSchema.safeParse(parseJson(data.sectionIndex, 'sectionIndex'));
    if (!index.success) invalid('sectionIndex is malformed');
    const order = structure.data?.order ?? [];
    const entries = index.data ?? {};
    if (new Set(order).size !== order.length || order.length !== Object.keys(entries).length || order.some((id) => !entries[id])) {
      invalid('section order and index disagree');
    }
    const recentOps = Array.isArray(data.recentOps) ? data.recentOps.filter((op): op is string => typeof op === 'string') : [];
    return {
      bookId,
      schemaVersion: data.schemaVersion as number,
      title: typeof data.title === 'string' ? data.title : '',
      wordCount: isInt(data.wordCount) ? data.wordCount : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      view: {
        revision: data.revision as number,
        structureRevision: data.structureRevision as number,
        structure: structure.data as BookStructure,
        sections: Object.fromEntries(Object.entries(entries).map(([id, [revision, hash, chunkCount]]) => [id, { revision, hash, chunkCount }])),
        deleted: data.deleted === true,
        recentOps,
      },
    };
  }

  async readHead(bookId: string): Promise<RemoteHead | null> {
    return this.guard(async () => {
      const data = await this.store.get(this.headPath(bookId));
      return data ? this.parseHead(bookId, data) : null;
    });
  }

  /** Every book head in the account; damaged or newer-format heads are reported, not hidden. */
  async listHeads(): Promise<{ bookId: string; head: RemoteHead | null; error: RemoteError | null }[]> {
    return this.guard(async () => {
      const docs = await this.store.list(this.books());
      return docs.map(({ id, data }) => {
        try {
          return { bookId: id, head: this.parseHead(id, data), error: null };
        } catch (error) {
          return { bookId: id, head: null, error: toRemoteError(error) as RemoteError };
        }
      });
    });
  }

  private async readSection(bookId: string, id: string, expected: { revision: number; hash: string; chunkCount: number }): Promise<Section> {
    const doc = await this.store.get(this.sectionPath(bookId, id));
    if (!doc || doc.deleted === true || doc.revision !== expected.revision) {
      throw new RemoteError('aborted', { detail: `section ${id} changed while reading` });
    }
    if (doc.ownerId !== this.uid || doc.manuscriptId !== bookId || doc.sectionId !== id || doc.chunkCount !== expected.chunkCount || typeof doc.content !== 'string') {
      invalid(`section ${id} has inconsistent metadata`);
    }
    const parts = [doc.content as string];
    const chunks = await Promise.all(
      Array.from({ length: expected.chunkCount - 1 }, (_, i) => this.store.get(this.chunkPath(bookId, id, i + 1))),
    );
    chunks.forEach((chunk, i) => {
      if (!chunk || chunk.revision !== expected.revision || chunk.index !== i + 1 || typeof chunk.data !== 'string') {
        throw new RemoteError('aborted', { detail: `chunk ${i + 1} of section ${id} is missing or from another revision` });
      }
      parts.push(chunk.data);
    });
    const parsed = SectionSchema.safeParse(parseJson(parts.join(''), `section ${id}`));
    if (!parsed.success) invalid(`section ${id} does not match the schema`);
    const section = parsed.data as Section;
    if (section.id !== id || hashSection(section) !== expected.hash) invalid(`section ${id} content does not match its hash`);
    return section;
  }

  /** Server content for `ids`, verified against `view` (revision, chunk count and hash). */
  async readSections(bookId: string, ids: readonly string[], view: RemoteBookView): Promise<Map<string, Section>> {
    return this.guard(async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const expected = view.sections[id];
          if (!expected) throw new RemoteError('aborted', { detail: `section ${id} is not in the head index` });
          return [id, await this.readSection(bookId, id, expected)] as const;
        }),
      );
      return new Map(entries);
    });
  }

  /** Full download of a committed, live book. */
  async readBook(bookId: string): Promise<{ head: RemoteHead; manuscript: Manuscript } | null> {
    const head = await this.readHead(bookId);
    if (!head || head.view.deleted) return null;
    const sections = await this.readSections(bookId, head.view.structure.order, head.view);
    const manuscript = assembleManuscript(
      bookId,
      head.schemaVersion as Manuscript['schemaVersion'],
      head.view.structure,
      sections,
      head.updatedAt ?? new Date().toISOString(),
    );
    const valid = ManuscriptSchema.safeParse(manuscript);
    if (!valid.success) invalid('assembled manuscript does not match the schema');
    return { head, manuscript };
  }

  private prepare(plan: PushPlan) {
    return plan.sections.map((write) => {
      const chunks = write.section ? chunkText(JSON.stringify(write.section), this.chunkSize) : [];
      return { write, chunks, bytes: chunks.reduce((sum, chunk) => sum + utf8Length(chunk) + 512, 512) };
    });
  }

  /** Size and write-count check before anything is sent; throws `too_large` (permanent). */
  checkCommitSize(plan: PushPlan, view: RemoteBookView | null) {
    if (plan.structure.order.length > MAX_SECTIONS) throw new RemoteError('too_large', { detail: `${plan.structure.order.length} sections` });
    const prepared = this.prepare(plan);
    let writes = 1;
    let bytes = utf8Length(JSON.stringify(plan.structure)) + plan.structure.order.length * 48 + 2048;
    if (bytes > MAX_HEAD_BYTES) throw new RemoteError('too_large', { detail: 'book structure exceeds one document' });
    for (const { write, chunks, bytes: size } of prepared) {
      const previous = view?.sections[write.id]?.chunkCount ?? 1;
      writes += Math.max(chunks.length, 1) + Math.max(previous - chunks.length, 0);
      bytes += size;
    }
    if (writes > MAX_COMMIT_WRITES || bytes > MAX_COMMIT_BYTES) {
      throw new RemoteError('too_large', { detail: `${writes} writes, ${bytes} bytes` });
    }
    return { writes, bytes };
  }

  /**
   * One atomic transaction: compare-and-set on the head revision and on every written section's
   * revision, then write sections (with chunks) and the new head together. Readers therefore see
   * either the previous commit or this one, never a mix.
   */
  async commit(bookId: string, input: CommitInput): Promise<CommitResult> {
    const prepared = this.prepare(input.plan);
    return this.guard(() =>
      this.store.transaction(async (tx) => {
        const headPath = this.headPath(bookId);
        const [head, ...docs] = await Promise.all([tx.get(headPath), ...prepared.map(({ write }) => tx.get(this.sectionPath(bookId, write.id)))]);
        const recentOps = Array.isArray(head?.recentOps) ? (head.recentOps as unknown[]).filter((op): op is string => typeof op === 'string') : [];
        if (head && recentOps.includes(input.opId)) {
          return { revision: Number(head.revision), structureRevision: Number(head.structureRevision), sectionRevisions: {}, duplicate: true };
        }
        if (input.expectedHead === null ? head !== null : head?.revision !== input.expectedHead) {
          throw new StaleCommitError(`head is at ${head ? String(head.revision) : 'nothing'}, expected ${String(input.expectedHead)}`);
        }
        const current = head ? this.parseHead(bookId, head) : null;
        if (current?.view.deleted && !input.undelete) throw new StaleCommitError('the book was deleted on another device');
        const sectionRevisions: Record<string, number> = {};
        const written: Record<string, [number, string, number]> = {};

        prepared.forEach(({ write, chunks }, i) => {
          const doc = docs[i] ?? null;
          const live = doc !== null && doc.deleted !== true;
          const matches = write.expectedRevision === null ? !live : live && doc.revision === write.expectedRevision;
          if (!matches) throw new StaleCommitError(`section ${write.id} moved`);
          const revision = (doc ? Number(doc.revision) : 0) + 1;
          const previousChunks = live ? Number(doc.chunkCount) || 1 : 0;
          const base = { ownerId: this.uid, manuscriptId: bookId, sectionId: write.id, revision, commitRevision: (current?.view.revision ?? 0) + 1, updatedAt: SERVER_TIME };
          if (write.section && write.hash) {
            tx.set(this.sectionPath(bookId, write.id), { ...base, contentHash: write.hash, deleted: false, chunkCount: chunks.length, content: chunks[0] ?? '' });
            chunks.slice(1).forEach((data, k) => {
              tx.set(this.chunkPath(bookId, write.id, k + 1), { ownerId: this.uid, manuscriptId: bookId, sectionId: write.id, revision, index: k + 1, data });
            });
            for (let k = chunks.length; k < previousChunks; k++) tx.delete(this.chunkPath(bookId, write.id, k));
            written[write.id] = [revision, write.hash, chunks.length];
          } else {
            tx.set(this.sectionPath(bookId, write.id), { ...base, contentHash: '', deleted: true, chunkCount: 0, content: '' });
            for (let k = 1; k < previousChunks; k++) tx.delete(this.chunkPath(bookId, write.id, k));
          }
          sectionRevisions[write.id] = revision;
        });

        const index: Record<string, [number, string, number]> = {};
        for (const id of input.plan.structure.order) {
          const kept = current?.view.sections[id];
          const entry = written[id] ?? (kept ? ([kept.revision, kept.hash, kept.chunkCount] as [number, string, number]) : undefined);
          if (!entry) throw new StaleCommitError(`section ${id} has no committed content`);
          index[id] = entry;
        }
        const revision = (current?.view.revision ?? 0) + 1;
        const structureRevision = current ? current.view.structureRevision + (input.plan.structureChanged ? 1 : 0) : 1;
        tx.set(headPath, {
          ownerId: this.uid,
          syncFormat: SYNC_FORMAT,
          schemaVersion: input.schemaVersion,
          revision,
          structureRevision,
          structure: JSON.stringify(input.plan.structure),
          sectionIndex: JSON.stringify(index),
          title: input.title.slice(0, 500),
          wordCount: input.wordCount,
          contentHash: stableHash({ structure: hashStructure(input.plan.structure), index }),
          deleted: false,
          lastOpId: input.opId,
          recentOps: [...recentOps, input.opId].slice(-RECENT_OPS),
          createdAt: typeof head?.createdAt === 'string' ? head.createdAt : input.plan.structure.createdAt,
          updatedAt: SERVER_TIME,
        });
        return { revision, structureRevision, sectionRevisions, duplicate: false };
      }),
    );
  }

  /** Soft delete (heads can't be hard-deleted by clients), only if nobody committed since `expectedHead`. */
  async softDelete(bookId: string, expectedHead: number, opId: string): Promise<'deleted' | 'gone' | 'moved'> {
    return this.guard(() =>
      this.store.transaction(async (tx) => {
        const head = await tx.get(this.headPath(bookId));
        if (!head || head.deleted === true) return 'gone' as const;
        if (head.revision !== expectedHead) return 'moved' as const;
        const recentOps = Array.isArray(head.recentOps) ? (head.recentOps as unknown[]).filter((op): op is string => typeof op === 'string') : [];
        tx.set(this.headPath(bookId), {
          ...head,
          revision: Number(head.revision) + 1,
          deleted: true,
          lastOpId: opId,
          recentOps: [...recentOps, opId].slice(-RECENT_OPS),
          updatedAt: SERVER_TIME,
        });
        return 'deleted' as const;
      }),
    );
  }

  /** Whole-manuscript snapshot written in one batch: it exists completely or not at all. */
  async createSnapshot(bookId: string, reason: SnapshotReason, manuscript: Manuscript, headRevision: number): Promise<SnapshotMeta> {
    const content = serializeManuscript(manuscript);
    const chunks = chunkText(content, this.chunkSize);
    const sizeBytes = utf8Length(content);
    if (chunks.length + 1 > MAX_COMMIT_WRITES || sizeBytes + chunks.length * 512 > MAX_COMMIT_BYTES) {
      throw new RemoteError('too_large', { detail: `snapshot of ${sizeBytes} bytes` });
    }
    const id = newId();
    const meta = {
      reason,
      headRevision,
      contentHash: stableHash(content),
      sizeBytes,
      wordCount: manuscriptWordCount(manuscript),
      sectionCount: manuscript.sections.length,
      chunkCount: chunks.length,
      title: manuscript.title.slice(0, 500),
    };
    await this.guard(() =>
      this.store.batch([
        {
          type: 'set',
          path: this.snapshotPath(bookId, id),
          data: { ownerId: this.uid, manuscriptId: bookId, schemaVersion: manuscript.schemaVersion, ...meta, createdAt: SERVER_TIME },
        },
        ...chunks.map((data, index) => ({
          type: 'set' as const,
          path: `${this.snapshotPath(bookId, id)}/chunks/${index}`,
          data: { ownerId: this.uid, manuscriptId: bookId, snapshotId: id, index, data },
        })),
      ]),
    );
    return { id, ...meta, createdAt: null };
  }

  private parseSnapshot(id: string, data: DocData): SnapshotMeta | null {
    if (!SNAPSHOT_REASONS.includes(data.reason as SnapshotReason) || !isInt(data.chunkCount, 1) || typeof data.contentHash !== 'string') return null;
    return {
      id,
      reason: data.reason as SnapshotReason,
      headRevision: isInt(data.headRevision) ? data.headRevision : 0,
      contentHash: data.contentHash,
      sizeBytes: isInt(data.sizeBytes) ? data.sizeBytes : 0,
      wordCount: isInt(data.wordCount) ? data.wordCount : 0,
      sectionCount: isInt(data.sectionCount) ? data.sectionCount : 0,
      chunkCount: data.chunkCount,
      title: typeof data.title === 'string' ? data.title : '',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : null,
    };
  }

  /** Newest first. Legacy (M1-A) snapshot records without inline content are skipped. */
  async listSnapshots(bookId: string): Promise<SnapshotMeta[]> {
    return this.guard(async () => {
      const docs = await this.store.list(`${this.headPath(bookId)}/snapshots`);
      return docs
        .map(({ id, data }) => this.parseSnapshot(id, data))
        .filter((meta): meta is SnapshotMeta => meta !== null)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id));
    });
  }

  async readSnapshot(bookId: string, snapshotId: string): Promise<{ meta: SnapshotMeta; manuscript: Manuscript }> {
    return this.guard(async () => {
      const data = await this.store.get(this.snapshotPath(bookId, snapshotId));
      const meta = data ? this.parseSnapshot(snapshotId, data) : null;
      if (!meta) throw new RemoteError('not-found', { message: 'That snapshot no longer exists.' });
      const chunks = await Promise.all(Array.from({ length: meta.chunkCount }, (_, i) => this.store.get(`${this.snapshotPath(bookId, snapshotId)}/chunks/${i}`)));
      const content = chunks
        .map((chunk, i) => {
          if (!chunk || chunk.index !== i || typeof chunk.data !== 'string') invalid(`snapshot chunk ${i} is missing`);
          return chunk?.data as string;
        })
        .join('');
      if (stableHash(content) !== meta.contentHash) invalid('snapshot content does not match its hash');
      const parsed = deserializeManuscript(content);
      if (!parsed.ok) {
        throw new RemoteError(parsed.error === 'unsupported_version' ? 'unsupported_version' : 'invalid_data', { detail: parsed.message });
      }
      if (parsed.manuscript.id !== bookId) invalid('snapshot belongs to another manuscript');
      return { meta, manuscript: parsed.manuscript };
    });
  }

  async deleteSnapshot(bookId: string, snapshotId: string, chunkCount: number): Promise<void> {
    await this.guard(() =>
      this.store.batch([
        ...Array.from({ length: chunkCount }, (_, i) => ({ type: 'delete' as const, path: `${this.snapshotPath(bookId, snapshotId)}/chunks/${i}` })),
        { type: 'delete', path: this.snapshotPath(bookId, snapshotId) },
      ]),
    );
  }
}
