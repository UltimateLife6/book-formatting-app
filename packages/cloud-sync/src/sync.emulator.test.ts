import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManuscript, createParagraph, createSection, type Manuscript, manuscriptToPlainText, manuscriptWordCount } from '@folio-loom/book-model';
import { LocalManuscriptStore, type StorageDriver } from '@folio-loom/local-storage';
import { createIndexedDbDriver } from '@folio-loom/local-storage/indexeddb';
import { createSqliteDriver } from '@folio-loom/local-storage/sqlite';
import { fakeIndexedDb, fakeKeyRange, importFixture, nodeSqliteConnection } from '@folio-loom/local-storage/testing';
import { deleteApp, type FirebaseApp, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  disableNetwork,
  doc,
  enableNetwork,
  type Firestore,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { authEmulatorUrl, demoAppOptions, emulators, uniqueEmail } from '../../../firebase/tests/env';
import { SyncEngine } from './engine';
import { createFirestoreDocStore } from './firestore';
import { RemoteBooks } from './remote';

const PASSWORD = 'correct horse battery';
let dir: string;
const cleanups: (() => Promise<unknown>)[] = [];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'folio-sync-emu-'));
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Client {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  uid: string;
  store: LocalManuscriptStore;
  library: ReturnType<LocalManuscriptStore['forUser']>;
  remote: RemoteBooks;
  engine: SyncEngine;
}

/** An independent device: its own Firebase app/session, Firestore client and local database. */
async function client(name: string, email: string, options: { create?: boolean; backend: 'sqlite' | 'indexeddb' }): Promise<Client> {
  const app = initializeApp(demoAppOptions, `sync-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, emulators.firestore.host, emulators.firestore.port);
  const credential = options.create ? await createUserWithEmailAndPassword(auth, email, PASSWORD) : await signInWithEmailAndPassword(auth, email, PASSWORD);
  const uid = credential.user.uid;
  const driver: StorageDriver =
    options.backend === 'sqlite'
      ? createSqliteDriver(async () => nodeSqliteConnection(join(dir, `${name}-${Date.now()}.db`)))
      : createIndexedDbDriver({ indexedDB: fakeIndexedDb(), keyRange: fakeKeyRange });
  const store = new LocalManuscriptStore(driver);
  await store.ready;
  const library = store.forUser(uid);
  const remote = new RemoteBooks(createFirestoreDocStore(db, auth, { timeoutMs: 20_000 }), uid);
  const engine = new SyncEngine({ store, library, remote, autoSchedule: false });
  engine.start();
  cleanups.push(async () => {
    await engine.stop();
    await store.close();
    await deleteApp(app);
  });
  return { app, auth, db, uid, store, library, remote, engine };
}

async function pair() {
  const email = uniqueEmail('sync');
  const a = await client('a', email, { create: true, backend: 'sqlite' });
  const b = await client('b', email, { backend: 'indexeddb' });
  return { a, b, email };
}

function book(title = 'Emulator book'): Manuscript {
  return createManuscript({
    title,
    sections: ['Front', 'One', 'Two', 'Three'].map((t) =>
      createSection({ kind: t === 'Front' ? 'frontMatter' : 'chapter', title: t, blocks: [createParagraph(`${t} original text.`)] }),
    ),
  });
}

const setText = (m: Manuscript, index: number, text: string): Manuscript => ({
  ...m,
  sections: m.sections.map((s, i) => (i === index ? { ...s, blocks: [createParagraph(text)] } : s)),
});

async function load(c: Client, bookId: string) {
  const loaded = await c.library.load(bookId);
  if (!loaded.ok) throw new Error(`not loadable: ${loaded.reason}`);
  return loaded.record;
}

async function edit(c: Client, bookId: string, change: (m: Manuscript) => Manuscript) {
  const record = await load(c, bookId);
  await c.library.save(bookId, change(record.manuscript), record.localRevision);
}

const sectionText = (m: Manuscript, title: string) => {
  const section = m.sections.find((s) => s.title === title);
  return section ? manuscriptToPlainText({ ...m, sections: [section] }) : null;
};

async function statusOf(c: Client, bookId: string) {
  await c.engine.refreshStatuses();
  return c.engine.getSnapshot().books.get(bookId)?.kind;
}

describe('cloud sync against the Firestore emulator (two independent clients)', () => {
  it('uploads, downloads on a second device, and merges independent edits', async () => {
    const { a, b } = await pair();
    const created = await a.library.create({ manuscript: book() });
    await a.engine.syncAll();
    expect(await statusOf(a, created.bookId)).toBe('synced');
    await b.engine.syncAll();
    expect((await load(b, created.bookId)).manuscript.sections).toEqual(created.manuscript.sections);

    await edit(a, created.bookId, (m) => setText(m, 1, 'A edited One.'));
    await edit(b, created.bookId, (m) => setText(m, 3, 'B edited Three.'));
    await a.engine.syncAll();
    await b.engine.syncAll();
    await a.engine.syncAll();
    for (const c of [a, b]) {
      const m = (await load(c, created.bookId)).manuscript;
      expect(sectionText(m, 'One')).toContain('A edited One.');
      expect(sectionText(m, 'Three')).toContain('B edited Three.');
      expect(await statusOf(c, created.bookId)).toBe('synced');
    }
  });

  it('ACCEPTANCE: one device offline, same section edited on both, everything recoverable and explicit', async () => {
    const { a, b } = await pair();
    const { bookId } = await a.library.create({ manuscript: book() });
    await a.engine.syncAll();
    await b.engine.syncAll();

    await disableNetwork(b.db);
    await edit(b, bookId, (m) => setText(setText(m, 1, 'B offline version.'), 2, 'B offline chapter two.'));
    await b.engine.syncBook(bookId);
    expect(await statusOf(b, bookId)).toBe('offline');
    expect(await b.library.listOutbox()).toHaveLength(1);

    await edit(a, bookId, (m) => setText(m, 1, 'A online version.'));
    await a.engine.syncAll();

    await enableNetwork(b.db);
    await b.engine.syncAll();
    expect(await statusOf(b, bookId)).toBe('conflict');
    const [view] = await b.engine.getConflicts(bookId);
    expect(JSON.stringify(view?.mine)).toContain('B offline version.');
    expect(JSON.stringify(view?.theirs)).toContain('A online version.');
    if (!view) throw new Error('expected a conflict');

    await a.engine.syncAll();
    expect(sectionText((await load(a, bookId)).manuscript, 'Two')).toContain('B offline chapter two.');

    await b.engine.resolveConflict(bookId, view.conflict.id, 'both', view.expected);
    await b.engine.syncAll();
    await a.engine.syncAll();
    for (const c of [a, b]) {
      const text = manuscriptToPlainText((await load(c, bookId)).manuscript);
      for (const expected of ['A online version.', 'B offline version.', 'B offline chapter two.']) expect(text).toContain(expected);
      expect(await statusOf(c, bookId)).toBe('synced');
    }
  });

  it('server rules reject stale or skipped revisions and hard deletes even from a modified client', async () => {
    const { a } = await pair();
    const { bookId } = await a.library.create({ manuscript: book() });
    await a.engine.syncAll();
    const headRef = doc(a.db, `users/${a.uid}/manuscripts/${bookId}`);
    const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (e: { code: string }) => e.code);
    expect(await code(updateDoc(headRef, { revision: 1, title: 'stale', updatedAt: serverTimestamp() }))).toBe('permission-denied');
    expect(await code(updateDoc(headRef, { revision: 3, title: 'skip', updatedAt: serverTimestamp() }))).toBe('permission-denied');
    expect(await code(deleteDoc(headRef))).toBe('permission-denied');
    const [sectionId] = (await a.remote.readHead(bookId))?.view.structure.order ?? [];
    expect(await code(deleteDoc(doc(a.db, `users/${a.uid}/manuscripts/${bookId}/sections/${sectionId}`)))).toBe('permission-denied');
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(1);
  });

  it('isolates accounts: another user can neither read nor write, and the engine refuses a mismatched session', async () => {
    const { a } = await pair();
    const { bookId } = await a.library.create({ manuscript: book('Private') });
    await a.engine.syncAll();
    const other = await client('other', uniqueEmail('other'), { create: true, backend: 'sqlite' });
    const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (e: { code: string }) => e.code);
    expect(await code(getDoc(doc(other.db, `users/${a.uid}/manuscripts/${bookId}`)))).toBe('permission-denied');
    expect(await code(updateDoc(doc(other.db, `users/${a.uid}/manuscripts/${bookId}`), { revision: 2, updatedAt: serverTimestamp() }))).toBe('permission-denied');
    const forged = new RemoteBooks(createFirestoreDocStore(other.db, other.auth), a.uid);
    await expect(forged.readHead(bookId)).rejects.toMatchObject({ code: 'wrong_account' });
    await other.engine.syncAll();
    expect(await other.library.list()).toEqual([]);
  });

  it('pauses on sign-out without uploading, and resumes after signing back in', async () => {
    const { a, email } = await pair();
    const { bookId } = await a.library.create({ manuscript: book('Signed out') });
    await signOut(a.auth);
    await a.engine.syncAll();
    expect(a.engine.getSnapshot().paused).toBe('signedOut');
    expect(await a.library.listOutbox()).toHaveLength(1);
    await a.engine.stop();
    await signInWithEmailAndPassword(a.auth, email, PASSWORD);
    const resumed = new SyncEngine({ store: a.store, library: a.library, remote: a.remote, autoSchedule: false });
    resumed.start();
    await resumed.syncAll();
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(1);
    await resumed.stop();
  });

  it('creates, lists and restores snapshots; the restore reaches the other device', async () => {
    const { a, b } = await pair();
    const { bookId } = await a.library.create({ manuscript: book() });
    await a.engine.syncAll();
    await edit(a, bookId, (m) => setText(m, 1, 'Second draft.'));
    await a.engine.syncAll();
    const snapshots = await a.engine.listSnapshots(bookId);
    expect(snapshots.map((s) => s.reason)).toEqual(['initialUpload']);
    expect(snapshots[0]?.createdAt).toMatch(/^\d{4}-/);
    await a.engine.restoreSnapshot(bookId, snapshots[0]?.id ?? '');
    await a.engine.syncAll();
    await b.engine.syncAll();
    expect(sectionText((await load(b, bookId)).manuscript, 'One')).toContain('One original text.');
    expect((await a.engine.listSnapshots(bookId)).map((s) => s.reason).sort()).toEqual(['beforeRestore', 'initialUpload']);
  });

  it('chunks an oversized section across documents under real rules and reassembles it exactly', async () => {
    const { a, b } = await pair();
    const huge = `${'Ünïcödé 😀 text that keeps going. '.repeat(13_000)}end.`;
    const { bookId, manuscript } = await a.library.create({
      manuscript: createManuscript({ title: 'Huge chapter', sections: [createSection({ kind: 'chapter', title: 'Huge', blocks: [createParagraph(huge)] })] }),
    });
    await a.engine.syncAll();
    const head = await a.remote.readHead(bookId);
    expect(Object.values(head?.view.sections ?? {})[0]?.chunkCount).toBeGreaterThan(2);
    await b.engine.syncAll();
    expect((await load(b, bookId)).manuscript.sections).toEqual(manuscript.sections);
  });

  it('syncs the ~210k-word manuscript with complete text preservation (timed)', async () => {
    const { a, b } = await pair();
    const manuscript = importFixture('very-large-manuscript');
    const words = manuscriptWordCount(manuscript);
    expect(words).toBeGreaterThan(200_000);
    const { bookId } = await a.library.create({ manuscript });

    let t = performance.now();
    await a.engine.syncBook(bookId);
    const upload = performance.now() - t;
    expect(await statusOf(a, bookId)).toBe('synced');

    t = performance.now();
    await b.engine.syncAll();
    const download = performance.now() - t;
    const downloaded = (await load(b, bookId)).manuscript;
    expect(manuscriptToPlainText(downloaded)).toBe(manuscriptToPlainText(manuscript));
    expect(downloaded.sections).toEqual(manuscript.sections);

    await edit(a, bookId, (m) => setText(m, 5, 'One changed chapter in a very large book.'));
    t = performance.now();
    await a.engine.syncBook(bookId);
    const push = performance.now() - t;
    t = performance.now();
    await b.engine.syncBook(bookId);
    const reconcile = performance.now() - t;
    expect(manuscriptToPlainText((await load(b, bookId)).manuscript)).toBe(manuscriptToPlainText((await load(a, bookId)).manuscript));

    const head = await a.remote.readHead(bookId);
    const chunks = Object.values(head?.view.sections ?? {}).reduce((sum, s) => sum + s.chunkCount, 0);
    console.info(
      `[large-sync] ${words} words, ${manuscript.sections.length} sections, ${chunks} section chunks, ` +
        `${JSON.stringify(manuscript).length} chars | initial upload ${upload.toFixed(0)} ms (incl. snapshot), ` +
        `download ${download.toFixed(0)} ms, one-section push ${push.toFixed(0)} ms, reconcile on other device ${reconcile.toFixed(0)} ms`,
    );
  }, 120_000);
});
