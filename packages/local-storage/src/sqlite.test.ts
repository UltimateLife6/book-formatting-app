import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Manuscript } from '@folio-loom/book-model';
import { stableHash } from '@folio-loom/sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageError } from './errors';
import { createSqliteDriver, SQLITE_MIGRATIONS, type SqliteMigration } from './sqlite';
import { LocalManuscriptStore } from './store';
import { importFixture } from './testing/fixtures';
import { type NodeSqliteHooks, nodeSqliteConnection } from './testing/nodeSqlite';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'folio-sqlite-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const dbPath = () => join(dir, 'folio.db');

async function openStore(options: { path?: string; migrations?: readonly SqliteMigration[]; hooks?: NodeSqliteHooks; keepRevisions?: number } = {}) {
  const connection = nodeSqliteConnection(options.path ?? dbPath(), options.hooks);
  const driver = createSqliteDriver(async () => connection, options.migrations ? { migrations: options.migrations } : {});
  const store = new LocalManuscriptStore(driver, options.keepRevisions ? { keepRevisions: options.keepRevisions } : {});
  await store.ready;
  return { store, raw: connection.raw, library: store.forUser('alice-uid') };
}

const retitle = (manuscript: Manuscript, title: string): Manuscript => ({ ...manuscript, title });

async function codeOf(promise: Promise<unknown>) {
  return promise.then(
    () => 'resolved',
    (error: StorageError) => error.code,
  );
}

describe('SQLite schema versioning and migrations', () => {
  it('creates the v1 schema with owner/book indexes on a fresh database', async () => {
    const { raw } = await openStore();
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    const indexes = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    expect(indexes.map((row) => row.name)).toEqual(['books_by_owner_updated', 'quarantine_by_owner_book']);
    expect(raw.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
  });

  it('refuses a database from a newer app version and leaves it untouched', async () => {
    const seed = nodeSqliteConnection(dbPath()).raw;
    seed.exec('CREATE TABLE future_thing (x TEXT); INSERT INTO future_thing VALUES (\'keep\'); PRAGMA user_version = 7;');
    seed.close();

    const { store, raw, library } = await openStore();
    expect(store.getStatus().state).toMatchObject({ status: 'unsupported_version', found: 7, supported: 1 });
    expect(raw.prepare('SELECT x FROM future_thing').get()).toEqual({ x: 'keep' });
    expect(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'books'").get()).toEqual({ n: 0 });
    expect(await codeOf(library.list())).toBe('unsupported_version');
  });

  it('upgrades v1 → v2 in a transaction and keeps every manuscript', async () => {
    const first = await openStore();
    const book = await first.library.create({ title: 'Survives upgrade' });
    await first.store.close();

    const v2: SqliteMigration = {
      version: 2,
      description: 'add pinned flag',
      up: (tx) => tx.exec('ALTER TABLE books ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0'),
    };
    const upgraded = await openStore({ migrations: [...SQLITE_MIGRATIONS, v2] });
    expect(upgraded.store.getStatus()).toMatchObject({ state: { status: 'ready' }, databaseVersion: 2 });
    const loaded = await upgraded.library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('Survives upgrade');
    expect(upgraded.raw.prepare('SELECT pinned FROM books').get()).toEqual({ pinned: 0 });
  });

  it('rolls back a failing migration, stays on the old version, and blocks access instead of resetting', async () => {
    const first = await openStore();
    const book = await first.library.create({ title: 'Must not be lost' });
    await first.store.close();

    const broken: SqliteMigration = {
      version: 2,
      description: 'fails halfway',
      async up(tx) {
        await tx.exec('CREATE TABLE half_done (x TEXT)');
        await tx.exec('ALTER TABLE books ADD COLUMN pinned INTEGER');
        throw new Error('simulated crash during migration');
      },
    };
    const failed = await openStore({ migrations: [...SQLITE_MIGRATIONS, broken] });
    expect(failed.store.getStatus()).toMatchObject({ state: { status: 'migration_failed' }, databaseVersion: 1 });
    expect(failed.raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    expect(failed.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'half_done'").get()).toEqual({ n: 0 });
    expect(await codeOf(failed.library.list())).toBe('unavailable');
    await failed.store.close();

    const recovered = await openStore();
    const loaded = await recovered.library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('Must not be lost');
  });

  it('rejects gapped migration lists at construction', () => {
    const [v1] = SQLITE_MIGRATIONS;
    if (!v1) throw new Error('missing v1 migration');
    expect(() => createSqliteDriver(async () => nodeSqliteConnection(':memory:'), { migrations: [{ ...v1, version: 2 }] })).toThrow(
      /numbered 1..n/,
    );
  });

  it('reports an unopenable database as unavailable', async () => {
    const store = new LocalManuscriptStore(
      createSqliteDriver(async () => {
        throw new Error('unable to open database file');
      }),
    );
    expect((await store.ready).state.status).toBe('unavailable');
    expect(await codeOf(store.forUser('alice-uid').list())).toBe('unavailable');
  });
});

describe('SQLite interrupted writes and crash recovery', () => {
  it('rolls back the whole save when a statement fails mid-transaction', async () => {
    let failOn: string | null = null;
    const { store, library } = await openStore({
      hooks: {
        beforeStatement: (sql) => {
          if (failOn && sql.startsWith(failOn)) throw new Error('simulated I/O error');
        },
      },
    });
    const book = await library.create({ title: 'Before' });
    failOn = 'DELETE FROM revisions';
    expect(await codeOf(library.save(book.bookId, retitle(book.manuscript, 'After'), 1))).toBe('write_failed');
    expect(store.getStatus().lastError?.code).toBe('write_failed');

    failOn = null;
    const loaded = await library.load(book.bookId);
    expect(loaded.ok && loaded.record).toMatchObject({ localRevision: 1, manuscript: { title: 'Before' } });
    expect((await library.listRevisions(book.bookId)).map((r) => r.revision)).toEqual([1]);
    await library.save(book.bookId, retitle(book.manuscript, 'After'), 1);
    expect(store.getStatus().lastError).toBeNull();
  });

  it('aborts on a conflicting revision row instead of overwriting it', async () => {
    const { raw, library } = await openStore();
    const book = await library.create({ title: 'Safe' });
    raw.exec(
      `INSERT INTO revisions (owner_uid, book_id, revision, schema_version, checksum, word_count, reason, saved_at, content)
       VALUES ('alice-uid', '${book.bookId}', 2, 1, 'x', 0, 'edit', 'now', 'leftover')`,
    );
    expect(await codeOf(library.save(book.bookId, retitle(book.manuscript, 'Next'), 1))).toBe('write_failed');
    expect(raw.prepare('SELECT local_revision, title FROM books').get()).toEqual({ local_revision: 1, title: 'Safe' });
    expect(raw.prepare('SELECT content FROM revisions WHERE revision = 2').get()).toEqual({ content: 'leftover' });
  });

  it('keeps the last committed state when the app dies mid-transaction', async () => {
    const first = await openStore();
    const book = await first.library.create({ title: 'Committed' });
    // Simulate a process kill: a write transaction is open and never committed or closed cleanly.
    first.raw.exec('BEGIN IMMEDIATE');
    first.raw.exec("UPDATE books SET title = 'Half written', local_revision = 99");
    first.raw.close();

    const reopened = await openStore();
    const loaded = await reopened.library.load(book.bookId);
    expect(loaded.ok && loaded.record).toMatchObject({ localRevision: 1, manuscript: { title: 'Committed' } });
  });

  it('a committed save is visible after reopening without a clean shutdown', async () => {
    const first = await openStore();
    const book = await first.library.create({ title: 'v1' });
    await first.library.save(book.bookId, retitle(book.manuscript, 'v2'), 1);
    // No close(): a second connection stands in for the next app launch.
    const second = await openStore();
    const loaded = await second.library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('v2');
  });

  it('maps a full disk to quota_exceeded and keeps the previous version', async () => {
    const { store, raw, library } = await openStore();
    const book = await library.create({ title: 'Small' });
    const pages = (raw.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
    raw.exec(`PRAGMA max_page_count = ${pages + 2}`);
    const big = importFixture('large-novel');
    expect(await codeOf(library.save(book.bookId, { ...big, id: book.bookId }, 1))).toBe('quota_exceeded');
    expect(store.getStatus().lastError?.code).toBe('quota_exceeded');
    const loaded = await library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('Small');
  });
});

describe('SQLite corrupt and unsupported records', () => {
  async function seeded() {
    const ctx = await openStore();
    const book = await ctx.library.create({ title: 'Good v1' });
    await ctx.library.save(book.bookId, retitle(book.manuscript, 'Good v2'), 1);
    return { ...ctx, book };
  }

  it('reports unparseable content as corrupt, lists restorable revisions, and restores without losing the damaged copy', async () => {
    const { raw, library, book } = await seeded();
    const broken = '{"schemaVersion":1,"id":"trunc';
    raw.exec(`UPDATE revisions SET content = '${broken}' WHERE revision = 2`);
    // Matching checksum, so the parser (not the checksum) is what catches it.
    raw.prepare('UPDATE books SET checksum = ?').run(stableHash(broken));

    const loaded = await library.load(book.bookId);
    expect(loaded).toMatchObject({ ok: false, reason: 'corrupt', message: expect.not.stringMatching(/checksum/) });
    if (loaded.ok || loaded.reason === 'not_found') throw new Error('expected corrupt');
    expect(loaded.revisions.map((r) => r.revision)).toEqual([2, 1]);
    expect((await library.list())[0]).toMatchObject({ bookId: book.bookId, health: 'ok' });

    const restored = await library.restoreRevision(book.bookId, 1);
    expect(restored).toMatchObject({ localRevision: 3, manuscript: { title: 'Good v1' } });
    const quarantine = await library.listQuarantine(book.bookId);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]).toMatchObject({ revision: 2, reason: 'replaced by restore', content: '{"schemaVersion":1,"id":"trunc' });
    const reloaded = await library.load(book.bookId);
    expect(reloaded.ok && reloaded.record.manuscript.title).toBe('Good v1');
  });

  it('detects altered-but-parseable content through the checksum', async () => {
    const { raw, library, book } = await seeded();
    raw.exec(`UPDATE revisions SET content = replace(content, 'Good v2', 'Evil v2') WHERE revision = 2`);
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'corrupt', message: expect.stringMatching(/checksum/) });
  });

  it('reports missing current content as corrupt', async () => {
    const { raw, library, book } = await seeded();
    raw.exec('DELETE FROM revisions WHERE revision = 2');
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'corrupt', message: expect.stringMatching(/missing/) });
  });

  it('opens nothing from a future manuscript schema and refuses to overwrite it', async () => {
    const { raw, library, book } = await seeded();
    raw.exec('UPDATE books SET schema_version = 99');
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'unsupported_version' });
    expect(await codeOf(library.save(book.bookId, book.manuscript, 2))).toBe('unsupported_version');
    expect(await codeOf(library.restoreRevision(book.bookId, 1))).toBe('unsupported_version');
    expect(raw.prepare('SELECT local_revision FROM books').get()).toEqual({ local_revision: 2 });
  });

  it('refuses to restore over intact content written by a newer manuscript schema', async () => {
    const { raw, library, book } = await seeded();
    const future = JSON.stringify({ schemaVersion: 99, id: book.bookId, title: 'From the future' });
    raw.prepare('UPDATE revisions SET content = ? WHERE revision = 2').run(future);
    raw.prepare('UPDATE books SET checksum = ?').run(stableHash(future));
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'unsupported_version' });
    expect(await codeOf(library.restoreRevision(book.bookId, 1))).toBe('unsupported_version');
    expect(raw.prepare('SELECT content FROM revisions WHERE revision = 2').get()).toEqual({ content: future });
    expect(await library.listQuarantine(book.bookId)).toEqual([]);
  });

  it('lists a damaged index row as unreadable instead of hiding it', async () => {
    const { raw, library, book } = await seeded();
    raw.exec("UPDATE books SET word_count = 'lots'");
    const [summary] = await library.list();
    expect(summary).toMatchObject({ bookId: book.bookId, health: 'unreadable', title: 'Good v2' });
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'corrupt' });
    const restored = await library.restoreRevision(book.bookId, 2);
    expect(restored.manuscript.title).toBe('Good v2');
    expect((await library.list())[0]?.health).toBe('ok');
  });

  it('does not throw StorageError subclasses for normal not-found loads', async () => {
    const { library } = await seeded();
    expect(await library.load('bk_missing')).toEqual({ ok: false, reason: 'not_found' });
    expect(new StorageError('not_found').message).toMatch(/not on this device/);
  });
});
