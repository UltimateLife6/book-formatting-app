import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Manuscript } from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import { StorageError } from './errors';
import { createSqliteDriver } from './sqlite';
import { type LibraryChange, LocalManuscriptStore } from './store';
import { TEST_BACKENDS } from './testing/backends';
import { nodeSqliteConnection } from './testing/nodeSqlite';

const retitle = (manuscript: Manuscript, title: string): Manuscript => ({ ...manuscript, title });

async function codeOf(promise: Promise<unknown>) {
  return promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof StorageError ? error.code : String(error)),
  );
}

describe.each(TEST_BACKENDS)('$name: sync tables', ({ makeDriver }) => {
  async function setup() {
    let n = 0;
    const store = new LocalManuscriptStore(makeDriver(), { createToken: () => `op-${++n}` });
    await store.ready;
    return { store, alice: store.forUser('alice-uid'), bob: store.forUser('bob-uid') };
  }

  it('queues one op per local change in the same transaction, keeping only the newest sync op per book', async () => {
    const { alice } = await setup();
    const book = await alice.create({ title: 'A' });
    expect(await alice.listOutbox()).toMatchObject([{ bookId: book.bookId, kind: 'sync', localRevision: 1, opId: 'op-1' }]);
    await alice.save(book.bookId, retitle(book.manuscript, 'B'), 1);
    await alice.save(book.bookId, retitle(book.manuscript, 'C'), 2);
    const ops = await alice.listOutbox();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'sync', localRevision: 3 });
  });

  it('queues nothing when a save is refused', async () => {
    const { alice } = await setup();
    const book = await alice.create();
    await alice.save(book.bookId, retitle(book.manuscript, 'Newer'), 1);
    const before = await alice.listOutbox();
    expect(await codeOf(alice.save(book.bookId, retitle(book.manuscript, 'Stale'), 1))).toBe('stale_revision');
    expect(await alice.listOutbox()).toEqual(before);
  });

  it('queues a delete only for books that may exist in the cloud', async () => {
    const { alice } = await setup();
    const local = await alice.create({ title: 'Never synced' });
    await alice.confirmDelete((await alice.requestDelete(local.bookId)).token);
    expect(await alice.listOutbox()).toEqual([]);

    const synced = await alice.create({ title: 'Synced' });
    await alice.applySync(synced.bookId, { syncState: '{"v":1}' });
    await alice.confirmDelete((await alice.requestDelete(synced.bookId)).token);
    expect(await alice.listOutbox()).toMatchObject([{ bookId: synced.bookId, kind: 'deleteBook', localRevision: null }]);
    expect(await alice.getSyncState(synced.bookId)).toBe('{"v":1}');
  });

  it('applies merged content, sync state and op cleanup atomically, refusing if the author saved meanwhile', async () => {
    const { alice } = await setup();
    const book = await alice.create({ title: 'Mine' });
    const [op] = await alice.listOutbox();

    await alice.save(book.bookId, retitle(book.manuscript, 'Typed meanwhile'), 1);
    const stale = alice.applySync(book.bookId, {
      expectedRevision: 1,
      content: { manuscript: retitle(book.manuscript, 'From cloud'), reason: 'sync' },
      syncState: 'S1',
      removeOpIds: [op?.opId ?? ''],
      preserve: [{ manuscript: book.manuscript, reason: 'test' }],
    });
    expect(await codeOf(stale)).toBe('stale_revision');
    expect(await alice.getSyncState(book.bookId)).toBeNull();
    expect(await alice.listPreserved()).toEqual([]);
    expect(await alice.listOutbox()).toHaveLength(1);

    const applied = await alice.applySync(book.bookId, {
      expectedRevision: 2,
      content: { manuscript: retitle(book.manuscript, 'From cloud'), reason: 'sync' },
      syncState: 'S2',
      removeAllOps: true,
      markSynced: { localRevision: 3, syncedRevision: 7 },
    });
    expect(applied.localRevision).toBe(3);
    const loaded = await alice.load(book.bookId);
    expect(loaded.ok && loaded.record).toMatchObject({ localRevision: 3, dirty: false, syncedRevision: 7, manuscript: { title: 'From cloud' } });
    expect((await alice.listRevisions(book.bookId))[0]).toMatchObject({ revision: 3, reason: 'sync' });
    expect(await alice.getSyncState(book.bookId)).toBe('S2');
    expect(await alice.listOutbox()).toEqual([]);
  });

  it('marks synced only if the revision still matches', async () => {
    const { alice } = await setup();
    const book = await alice.create();
    await alice.save(book.bookId, retitle(book.manuscript, 'Later'), 1);
    await alice.applySync(book.bookId, { syncState: 'S', markSynced: { localRevision: 1, syncedRevision: 2 } });
    expect((await alice.list())[0]).toMatchObject({ dirty: true, syncedRevision: null });
  });

  it('keeps preserved copies after the book is deleted and restores them as a new manuscript', async () => {
    const { alice } = await setup();
    const book = await alice.create({ title: 'Precious' });
    await alice.applySync(book.bookId, {
      expectedRevision: 1,
      deleteLocal: true,
      syncState: null,
      removeAllOps: true,
      preserve: [{ manuscript: book.manuscript, reason: 'Kept the deletion from another device' }],
    });
    expect(await alice.list()).toEqual([]);
    const [copy] = await alice.listPreserved();
    expect(copy).toMatchObject({ bookId: book.bookId, title: 'Precious', reason: 'Kept the deletion from another device' });
    const restored = await alice.restorePreserved(copy?.id ?? -1);
    expect(restored.bookId).not.toBe(book.bookId);
    expect(restored.manuscript.title).toBe('Precious (recovered)');
    expect(restored.manuscript.sections[0]?.id).not.toBe(book.manuscript.sections[0]?.id);
    expect(restored.manuscript.sections[0]?.blocks).toHaveLength(book.manuscript.sections[0]?.blocks.length ?? -1);
  });

  it('isolates outbox, sync state and preserved copies per account', async () => {
    const { alice, bob } = await setup();
    const book = await alice.create();
    await alice.applySync(book.bookId, { syncState: 'alice-state', preserve: [{ manuscript: book.manuscript, reason: 'r' }] });
    expect(await bob.listOutbox()).toEqual([]);
    expect(await bob.getSyncState(book.bookId)).toBeNull();
    expect(await bob.listSyncStates()).toEqual(new Map());
    expect(await bob.listPreserved()).toEqual([]);
    expect(await codeOf(bob.applySync(book.bookId, { expectedRevision: 1, deleteLocal: true }))).toBe('stale_revision');
    expect(await alice.listSyncStates()).toEqual(new Map([[book.bookId, 'alice-state']]));
  });

  it('reports committed changes with their origin', async () => {
    const { store, alice } = await setup();
    const changes: LibraryChange[] = [];
    store.onChange((change) => changes.push(change));
    const book = await alice.create();
    await alice.applySync(book.bookId, { syncState: 'S' });
    expect(changes).toEqual([
      { ownerUid: 'alice-uid', bookId: book.bookId, origin: 'local' },
      { ownerUid: 'alice-uid', bookId: book.bookId, origin: 'sync' },
    ]);
  });
});

describe('outbox durability', () => {
  it('survives closing and reopening the database (app restart)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'folio-outbox-'));
    try {
      const path = join(dir, 'folio.db');
      const first = new LocalManuscriptStore(createSqliteDriver(async () => nodeSqliteConnection(path)));
      await first.ready;
      const book = await first.forUser('alice-uid').create({ title: 'Offline' });
      await first.forUser('alice-uid').applySync(book.bookId, { syncState: 'pending-state' });
      await first.close();

      const second = new LocalManuscriptStore(createSqliteDriver(async () => nodeSqliteConnection(path)));
      await second.ready;
      const alice = second.forUser('alice-uid');
      expect(await alice.listOutbox()).toMatchObject([{ bookId: book.bookId, kind: 'sync', localRevision: 1 }]);
      expect(await alice.getSyncState(book.bookId)).toBe('pending-state');
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.each(TEST_BACKENDS)('$name: queued sync decisions', ({ makeDriver }) => {
  it('queues an upload and marks the book dirty with or without new content', async () => {
    const store = new LocalManuscriptStore(makeDriver());
    await store.ready;
    const alice = store.forUser('alice-uid');
    const book = await alice.create({ title: 'A' });
    await alice.applySync(book.bookId, { syncState: 'S', removeAllOps: true, markSynced: { localRevision: 1, syncedRevision: 1 } });
    expect((await alice.list())[0]?.dirty).toBe(false);
    await alice.applySync(book.bookId, { expectedRevision: 1, syncState: 'S2', queue: true });
    expect((await alice.list())[0]?.dirty).toBe(true);
    expect(await alice.listOutbox()).toMatchObject([{ kind: 'sync', localRevision: 1 }]);
    await alice.applySync(book.bookId, { expectedRevision: 1, content: { manuscript: retitle(book.manuscript, 'B'), reason: 'conflict' }, queue: true });
    expect(await alice.listOutbox()).toMatchObject([{ kind: 'sync', localRevision: 2 }]);
    expect((await alice.list())[0]).toMatchObject({ dirty: true, localRevision: 2 });
  });
});
