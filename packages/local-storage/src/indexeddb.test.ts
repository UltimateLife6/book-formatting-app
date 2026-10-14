import type { Manuscript } from '@folio-loom/book-model';
import { stableHash } from '@folio-loom/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageError } from './errors';
import { createIndexedDbDriver, DEFAULT_DATABASE_NAME, INDEXEDDB_MIGRATIONS, type IndexedDbMigration } from './indexeddb';
import { LocalManuscriptStore } from './store';
import { fakeIndexedDb, fakeKeyRange } from './testing/backends';

const retitle = (manuscript: Manuscript, title: string): Manuscript => ({ ...manuscript, title });

async function codeOf(promise: Promise<unknown>) {
  return promise.then(
    () => 'resolved',
    (error: StorageError) => error.code,
  );
}

async function openStore(idb: IDBFactory, migrations?: readonly IndexedDbMigration[]) {
  const store = new LocalManuscriptStore(createIndexedDbDriver({ indexedDB: idb, keyRange: fakeKeyRange, ...(migrations ? { migrations } : {}) }));
  await store.ready;
  return { store, library: store.forUser('alice-uid') };
}

function rawOpen(idb: IDBFactory, version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? idb.open(DEFAULT_DATABASE_NAME) : idb.open(DEFAULT_DATABASE_NAME, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function rawPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function rawGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IndexedDB availability (server rendering, private browsing)', () => {
  it('is unavailable without an IndexedDB implementation, as during server rendering', async () => {
    const original = (globalThis as { indexedDB?: unknown }).indexedDB;
    expect(original).toBeUndefined();
    const store = new LocalManuscriptStore(createIndexedDbDriver());
    expect((await store.ready).state).toMatchObject({ status: 'unavailable' });
    expect(await codeOf(store.forUser('alice-uid').list())).toBe('unavailable');
  });

  it('creating the driver touches nothing until open() is called', () => {
    const open = vi.fn();
    createIndexedDbDriver({ indexedDB: { open } as unknown as IDBFactory });
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a browser that refuses to open storage as unavailable', async () => {
    const refusing = {
      open: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const { store } = await openStore(refusing);
    expect(store.getStatus().state).toMatchObject({ status: 'unavailable' });
  });
});

describe('IndexedDB schema versions and migrations', () => {
  it('creates the v1 stores and ownership index', async () => {
    const idb = fakeIndexedDb();
    const { store } = await openStore(idb);
    expect(store.getStatus().databaseVersion).toBe(1);
    await store.close();
    const db = await rawOpen(idb);
    expect([...db.objectStoreNames].sort()).toEqual(['books', 'contents', 'quarantine', 'revisions']);
    expect([...db.transaction('books').objectStore('books').indexNames]).toEqual(['by_owner']);
    db.close();
  });

  it('refuses a database from a newer version without modifying it', async () => {
    const idb = fakeIndexedDb();
    const future = await rawOpen(idb, 5, (db) => db.createObjectStore('future'));
    future.close();
    const { store, library } = await openStore(idb);
    expect(store.getStatus().state).toMatchObject({ status: 'unsupported_version', found: 5, supported: 1 });
    expect(await codeOf(library.list())).toBe('unsupported_version');
    const check = await rawOpen(idb);
    expect(check.version).toBe(5);
    expect([...check.objectStoreNames]).toEqual(['future']);
    check.close();
  });

  it('upgrades v1 → v2 and keeps manuscripts', async () => {
    const idb = fakeIndexedDb();
    const first = await openStore(idb);
    const book = await first.library.create({ title: 'Survives upgrade' });
    await first.store.close();

    const v2: IndexedDbMigration = {
      version: 2,
      description: 'index books by update time',
      upgrade: (_db, tx) => tx.objectStore('books').createIndex('by_owner_updated', ['ownerUid', 'updatedAt']),
    };
    const upgraded = await openStore(idb, [...INDEXEDDB_MIGRATIONS, v2]);
    expect(upgraded.store.getStatus()).toMatchObject({ state: { status: 'ready' }, databaseVersion: 2 });
    const loaded = await upgraded.library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('Survives upgrade');
  });

  it('rolls back a failing upgrade and keeps the old version and data', async () => {
    const idb = fakeIndexedDb();
    const first = await openStore(idb);
    const book = await first.library.create({ title: 'Must not be lost' });
    await first.store.close();

    const broken: IndexedDbMigration = {
      version: 2,
      description: 'fails',
      upgrade(db) {
        db.createObjectStore('half_done');
        throw new Error('simulated upgrade bug');
      },
    };
    const failed = await openStore(idb, [...INDEXEDDB_MIGRATIONS, broken]);
    expect(failed.store.getStatus().state).toMatchObject({ status: 'migration_failed' });
    expect(failed.store.getStatus().databaseVersion).toBe(1);

    const recovered = await openStore(idb);
    const loaded = await recovered.library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('Must not be lost');
  });

  it('reports blocked while another tab holds the old version, then continues', async () => {
    const idb = fakeIndexedDb();
    await (await openStore(idb)).store.close();
    // An old tab with no versionchange handler keeps the v1 connection open.
    const otherTab = await rawOpen(idb);
    const states: string[] = [];
    const store = new LocalManuscriptStore(
      createIndexedDbDriver({
        indexedDB: idb,
        keyRange: fakeKeyRange,
        migrations: [...INDEXEDDB_MIGRATIONS, { version: 2, description: 'noop', upgrade: () => {} }],
      }),
    );
    store.subscribe(() => states.push(store.getStatus().state.status));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.getStatus().state.status).toBe('blocked');
    otherTab.close();
    expect((await store.ready).state.status).toBe('ready');
    expect(states).toEqual(['blocked', 'ready']);
  });

  it('closes itself when another tab upgrades, and says so', async () => {
    const idb = fakeIndexedDb();
    const { store, library } = await openStore(idb);
    const newer = await rawOpen(idb, 2);
    expect(store.getStatus().state).toMatchObject({ status: 'closed', message: expect.stringMatching(/another tab/) });
    expect(await codeOf(library.list())).toBe('closed');
    newer.close();
  });
});

describe('IndexedDB transactional writes and failures', () => {
  it('aborts the whole write on a conflicting content row', async () => {
    const idb = fakeIndexedDb();
    const { library, store } = await openStore(idb);
    const book = await library.create({ title: 'Safe' });
    const db = await rawOpen(idb);
    await rawPut(db, 'contents', { ownerUid: 'alice-uid', bookId: book.bookId, revision: 2, content: 'leftover' });

    expect(await codeOf(library.save(book.bookId, retitle(book.manuscript, 'Next'), 1))).toBe('write_failed');
    expect(store.getStatus().lastError?.code).toBe('write_failed');
    expect(await rawGet(db, 'books', ['alice-uid', book.bookId])).toMatchObject({ localRevision: 1, title: 'Safe' });
    expect(await rawGet(db, 'revisions', ['alice-uid', book.bookId, 2])).toBeUndefined();
    db.close();
  });

  it('maps QuotaExceededError to quota_exceeded and keeps the previous version', async () => {
    const idb = fakeIndexedDb();
    const { library, store } = await openStore(idb);
    const book = await library.create({ title: 'Before quota' });
    const db = await rawOpen(idb);
    const storeProto = Object.getPrototypeOf(db.transaction('contents').objectStore('contents')) as IDBObjectStore;
    db.close();
    const originalAdd = storeProto.add;
    vi.spyOn(storeProto, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'contents') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return originalAdd.apply(this, args);
    });

    expect(await codeOf(library.save(book.bookId, retitle(book.manuscript, 'After quota'), 1))).toBe('quota_exceeded');
    expect(store.getStatus().lastError?.message).toMatch(/out of storage space/);
    vi.restoreAllMocks();
    const loaded = await library.load(book.bookId);
    expect(loaded.ok && loaded.record).toMatchObject({ localRevision: 1, manuscript: { title: 'Before quota' } });
  });

  it('keeps committed data across a new connection without a clean close (reopen after a crash)', async () => {
    const idb = fakeIndexedDb();
    const first = await openStore(idb);
    const book = await first.library.create({ title: 'v1' });
    await first.library.save(book.bookId, retitle(book.manuscript, 'v2'), 1);
    const second = await openStore(idb);
    const loaded = await second.library.load(book.bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('v2');
  });
});

describe('IndexedDB corrupt and unsupported records', () => {
  async function seeded() {
    const idb = fakeIndexedDb();
    const ctx = await openStore(idb);
    const book = await ctx.library.create({ title: 'Good v1' });
    await ctx.library.save(book.bookId, retitle(book.manuscript, 'Good v2'), 1);
    const db = await rawOpen(idb);
    return { ...ctx, book, db };
  }

  it('reports unparseable content as corrupt and restores while quarantining the damaged copy', async () => {
    const { library, book, db } = await seeded();
    const broken = '{"schemaVersion":1,"id":"trunc';
    await rawPut(db, 'contents', { ownerUid: 'alice-uid', bookId: book.bookId, revision: 2, content: broken });
    const row = await rawGet<Record<string, unknown>>(db, 'books', ['alice-uid', book.bookId]);
    await rawPut(db, 'books', { ...row, checksum: stableHash(broken) });

    const loaded = await library.load(book.bookId);
    expect(loaded).toMatchObject({ ok: false, reason: 'corrupt' });
    const restored = await library.restoreRevision(book.bookId, 1);
    expect(restored).toMatchObject({ localRevision: 3, manuscript: { title: 'Good v1' } });
    expect(await library.listQuarantine(book.bookId)).toMatchObject([{ revision: 2, content: broken }]);
    db.close();
  });

  it('lists a damaged book row as unreadable rather than dropping it', async () => {
    const { library, book, db } = await seeded();
    const row = await rawGet<Record<string, unknown>>(db, 'books', ['alice-uid', book.bookId]);
    await rawPut(db, 'books', { ...row, dirty: 'maybe', title: 7 });
    expect(await library.list()).toMatchObject([{ bookId: book.bookId, health: 'unreadable', title: 'Unreadable manuscript' }]);
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'corrupt' });
    db.close();
  });

  it('refuses to open or overwrite a record from a future manuscript schema', async () => {
    const { library, book, db } = await seeded();
    const row = await rawGet<Record<string, unknown>>(db, 'books', ['alice-uid', book.bookId]);
    await rawPut(db, 'books', { ...row, schemaVersion: 42 });
    expect(await library.load(book.bookId)).toMatchObject({ ok: false, reason: 'unsupported_version' });
    expect(await codeOf(library.save(book.bookId, book.manuscript, 2))).toBe('unsupported_version');
    db.close();
  });

  it('deleting removes revisions, contents and quarantine for that book only', async () => {
    const { library, store, book, db } = await seeded();
    const other = await library.create({ title: 'Other' });
    const bob = store.forUser('bob-uid');
    await bob.create({ manuscript: { ...book.manuscript, title: 'Bob same id' } });
    const request = await library.requestDelete(book.bookId);
    await library.confirmDelete(request.token);
    expect(await rawGet(db, 'contents', ['alice-uid', book.bookId, 2])).toBeUndefined();
    expect((await library.list()).map((s) => s.bookId)).toEqual([other.bookId]);
    expect((await bob.list()).map((s) => s.bookId)).toEqual([book.bookId]);
    db.close();
  });
});
