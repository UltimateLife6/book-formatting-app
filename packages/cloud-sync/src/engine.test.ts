import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManuscript, createParagraph, createSection, type Manuscript, manuscriptToPlainText } from '@folio-loom/book-model';
import { LocalManuscriptStore } from '@folio-loom/local-storage';
import { createSqliteDriver } from '@folio-loom/local-storage/sqlite';
import { nodeSqliteConnection } from '@folio-loom/local-storage/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictResolutionError, SnapshotRestoreError, SyncEngine } from './engine';
import { MemoryBackend } from './memory';
import { RemoteBooks } from './remote';
import { parseSyncState } from './state';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'folio-sync-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Device {
  name: string;
  session: { uid: string | null; offline: boolean };
  store: LocalManuscriptStore;
  library: ReturnType<LocalManuscriptStore['forUser']>;
  remote: RemoteBooks;
  engine: SyncEngine;
}

async function device(backend: MemoryBackend, name: string, uid = 'alice', options: { path?: string; chunkSize?: number; engine?: Partial<ConstructorParameters<typeof SyncEngine>[0]> } = {}): Promise<Device> {
  const session = { uid: uid as string | null, offline: false };
  const store = new LocalManuscriptStore(createSqliteDriver(async () => nodeSqliteConnection(options.path ?? join(dir, `${name}.db`))));
  await store.ready;
  const library = store.forUser(uid);
  const remote = new RemoteBooks(backend.client(() => session.uid, { offline: () => session.offline }), uid, options.chunkSize ? { chunkSize: options.chunkSize } : {});
  const engine = new SyncEngine({ store, library, remote, autoSchedule: false, random: () => 0.5, ...options.engine });
  engine.start();
  return { name, session, store, library, remote, engine };
}

function book(title = 'Shared book'): Manuscript {
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

async function load(d: Device, bookId: string) {
  const loaded = await d.library.load(bookId);
  if (!loaded.ok) throw new Error(`${d.name}: ${bookId} not loadable (${loaded.reason})`);
  return loaded.record;
}

async function edit(d: Device, bookId: string, change: (m: Manuscript) => Manuscript) {
  const record = await load(d, bookId);
  await d.library.save(bookId, change(record.manuscript), record.localRevision);
}

const textOf = (m: Manuscript) => manuscriptToPlainText(m);
const sectionText = (m: Manuscript, title: string) => {
  const section = m.sections.find((s) => s.title === title);
  return section ? manuscriptToPlainText({ ...m, sections: [section] }) : null;
};

async function status(d: Device, bookId: string) {
  await d.engine.refreshStatuses();
  return d.engine.getSnapshot().books.get(bookId);
}

async function syncState(d: Device, bookId: string) {
  return parseSyncState(await d.library.getSyncState(bookId)).state;
}

async function shared(backend = new MemoryBackend()) {
  const a = await device(backend, 'a');
  const b = await device(backend, 'b');
  const created = await a.library.create({ manuscript: book() });
  await a.engine.syncAll();
  await b.engine.syncAll();
  return { backend, a, b, bookId: created.bookId };
}

describe('upload and download', () => {
  it('uploads a new book, snapshots it, and downloads it intact on another device', async () => {
    const backend = new MemoryBackend();
    const a = await device(backend, 'a');
    const created = await a.library.create({ manuscript: book() });
    expect((await status(a, created.bookId))?.kind).toBe('waiting');
    await a.engine.syncAll();
    expect((await status(a, created.bookId))?.kind).toBe('synced');
    expect(await a.library.listOutbox()).toEqual([]);
    expect((await a.library.list())[0]).toMatchObject({ dirty: false, syncedRevision: 1 });
    expect((await a.remote.listSnapshots(created.bookId)).map((s) => s.reason)).toEqual(['initialUpload']);

    const b = await device(backend, 'b');
    await b.engine.syncAll();
    const downloaded = await load(b, created.bookId);
    expect(downloaded.manuscript.sections).toEqual(created.manuscript.sections);
    expect(downloaded.manuscript.title).toBe(created.manuscript.title);
    expect((await status(b, created.bookId))?.kind).toBe('synced');
  });

  it('writes only the changed section for a one-section edit', async () => {
    const { backend, a, bookId } = await shared();
    const before = backend.stats.writes;
    await edit(a, bookId, (m) => setText(m, 2, 'A small change.'));
    await a.engine.syncAll();
    expect(backend.stats.writes - before).toBe(2); // the section and the head
    const head = await a.remote.readHead(bookId);
    expect(head?.view.revision).toBe(2);
    expect(Object.values(head?.view.sections ?? {}).map((s) => s.revision).sort()).toEqual([1, 1, 1, 2]);
  });
});

describe('concurrent editing', () => {
  it('merges edits to different sections from two devices without conflict', async () => {
    const { a, b, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Edited on A.'));
    await edit(b, bookId, (m) => setText(m, 3, 'Edited on B.'));
    await a.engine.syncAll();
    await b.engine.syncAll();
    await a.engine.syncAll();
    for (const d of [a, b]) {
      const m = (await load(d, bookId)).manuscript;
      expect(sectionText(m, 'One')).toContain('Edited on A.');
      expect(sectionText(m, 'Three')).toContain('Edited on B.');
      expect((await status(d, bookId))?.kind).toBe('synced');
    }
  });

  it('ACCEPTANCE: offline edits to the same manuscript stay recoverable and conflicts are explicit', async () => {
    const { a, b, bookId } = await shared();
    b.session.offline = true;
    await edit(b, bookId, (m) => setText(setText(m, 1, 'B wrote this offline.'), 3, 'B also changed chapter three.'));
    await b.engine.syncAll();
    expect((await status(b, bookId))?.kind).toBe('offline');
    expect(await b.library.listOutbox()).toHaveLength(1);

    await edit(a, bookId, (m) => setText(setText(m, 1, 'A wrote this online.'), 2, 'A changed chapter two.'));
    await a.engine.syncAll();

    b.session.offline = false;
    await b.engine.syncAll();
    const bView = (await load(b, bookId)).manuscript;
    expect(sectionText(bView, 'One')).toContain('B wrote this offline.');
    expect(sectionText(bView, 'Two')).toContain('A changed chapter two.');
    expect(sectionText(bView, 'Three')).toContain('B also changed chapter three.');
    expect((await status(b, bookId))?.kind).toBe('conflict');
    const [view] = await b.engine.getConflicts(bookId);
    expect(view?.conflict).toMatchObject({ kind: 'edit', title: 'One' });
    expect(JSON.stringify(view?.theirs)).toContain('A wrote this online.');
    expect(JSON.stringify(view?.mine)).toContain('B wrote this offline.');

    await a.engine.syncAll();
    const aView = (await load(a, bookId)).manuscript;
    expect(sectionText(aView, 'One')).toContain('A wrote this online.');
    expect(sectionText(aView, 'Three')).toContain('B also changed chapter three.');

    await b.engine.resolveConflict(bookId, view?.conflict.id ?? '', 'both', view?.expected ?? { remoteRevision: 0, localHash: null });
    await b.engine.syncAll();
    await a.engine.syncAll();
    for (const d of [a, b]) {
      const text = textOf((await load(d, bookId)).manuscript);
      expect(text).toContain('A wrote this online.');
      expect(text).toContain('B wrote this offline.');
      expect(text).toContain('A changed chapter two.');
      expect(text).toContain('B also changed chapter three.');
      expect((await status(d, bookId))?.kind).toBe('synced');
    }
    expect((await load(a, bookId)).manuscript.sections.map((s) => s.title)).toEqual(['Front', 'One', 'One (my version)', 'Two', 'Three']);
  });

  it('keep mine publishes after re-checking the cloud and keeps their version as a preserved copy', async () => {
    const { a, b, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Theirs.'));
    await a.engine.syncAll();
    await edit(b, bookId, (m) => setText(m, 1, 'Mine.'));
    await b.engine.syncAll();
    const [view] = await b.engine.getConflicts(bookId);
    if (!view) throw new Error('expected a conflict');
    await b.engine.resolveConflict(bookId, view.conflict.id, 'mine', view.expected);
    expect(JSON.stringify(await b.library.listPreserved())).toContain('Theirs.');
    await b.engine.syncAll();
    await a.engine.syncAll();
    expect(sectionText((await load(a, bookId)).manuscript, 'One')).toContain('Mine.');
    expect((await a.remote.listSnapshots(bookId)).map((s) => s.reason)).toContain('beforeConflictResolution');
  });

  it('keep theirs adopts the cloud version after preserving mine', async () => {
    const { a, b, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Theirs.'));
    await a.engine.syncAll();
    await edit(b, bookId, (m) => setText(m, 1, 'Mine.'));
    await b.engine.syncAll();
    const [view] = await b.engine.getConflicts(bookId);
    if (!view) throw new Error('expected a conflict');
    await b.engine.resolveConflict(bookId, view.conflict.id, 'theirs', view.expected);
    expect(sectionText((await load(b, bookId)).manuscript, 'One')).toContain('Theirs.');
    const [copy] = await b.library.listPreserved();
    expect(copy?.content).toContain('Mine.');
    await b.engine.syncAll();
    expect((await status(b, bookId))?.kind).toBe('synced');
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(2);
  });

  it('detects a cloud change made while the conflict screen is open and refuses the stale choice', async () => {
    const { a, b, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Theirs v1.'));
    await a.engine.syncAll();
    await edit(b, bookId, (m) => setText(m, 1, 'Mine.'));
    await b.engine.syncAll();
    const [shown] = await b.engine.getConflicts(bookId);
    if (!shown) throw new Error('expected a conflict');

    await edit(a, bookId, (m) => setText(m, 1, 'Theirs v2.'));
    await a.engine.syncAll();
    await b.engine.syncAll();
    await expect(b.engine.resolveConflict(bookId, shown.conflict.id, 'theirs', shown.expected)).rejects.toBeInstanceOf(ConflictResolutionError);
    const [fresh] = await b.engine.getConflicts(bookId);
    expect(JSON.stringify(fresh?.theirs)).toContain('Theirs v2.');
    if (!fresh) throw new Error('expected a conflict');
    await b.engine.resolveConflict(bookId, fresh.conflict.id, 'theirs', fresh.expected);
    // Retrying the same (already applied) resolution is a safe no-op error, not a second change.
    await expect(b.engine.resolveConflict(bookId, fresh.conflict.id, 'theirs', fresh.expected)).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('resolves a stale push by re-reading and merging (another device committed mid-sync)', async () => {
    const { backend, a, b, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'From A.'));
    await edit(b, bookId, (m) => setText(m, 2, 'From B.'));
    backend.beforeNextTransaction(() => b.engine.syncBook(bookId));
    await a.engine.syncBook(bookId);
    await b.engine.syncAll();
    for (const d of [a, b]) {
      const m = (await load(d, bookId)).manuscript;
      expect(sectionText(m, 'One')).toContain('From A.');
      expect(sectionText(m, 'Two')).toContain('From B.');
    }
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(3);
  });
});

describe('deletion and reordering', () => {
  it('syncs section deletion and reorder, and flags edit-versus-delete', async () => {
    const { a, b, bookId } = await shared();
    await edit(a, bookId, (m) => {
      const [front, one, two, three] = m.sections as [Manuscript['sections'][0], Manuscript['sections'][0], Manuscript['sections'][0], Manuscript['sections'][0]];
      return { ...m, sections: [front, three, one, two].filter((s) => s.title !== 'Two') };
    });
    await edit(b, bookId, (m) => setText(m, 2, 'B edited Two, which A deleted.'));
    await a.engine.syncAll();
    await b.engine.syncAll();
    const bBook = (await load(b, bookId)).manuscript;
    expect(bBook.sections.map((s) => s.title)).toEqual(['Front', 'Three', 'One', 'Two']);
    const [view] = await b.engine.getConflicts(bookId);
    expect(view?.conflict.kind).toBe('remoteDeleted');
    if (!view) throw new Error('expected a conflict');
    await b.engine.resolveConflict(bookId, view.conflict.id, 'mine', view.expected);
    await b.engine.syncAll();
    await a.engine.syncAll();
    expect((await load(a, bookId)).manuscript.sections.map((s) => s.title)).toEqual(['Front', 'Three', 'One', 'Two']);
    expect(sectionText((await load(a, bookId)).manuscript, 'Two')).toContain('B edited Two');
  });

  it('propagates a book deletion to devices without unsynced changes', async () => {
    const { a, b, bookId } = await shared();
    await a.library.confirmDelete((await a.library.requestDelete(bookId)).token);
    expect(await a.library.listOutbox()).toMatchObject([{ kind: 'deleteBook' }]);
    await a.engine.syncAll();
    expect(await a.library.listOutbox()).toEqual([]);
    expect((await a.remote.readHead(bookId))?.view.deleted).toBe(true);
    await b.engine.syncAll();
    expect(await b.library.list()).toEqual([]);
  });

  it('turns a remote deletion into a conflict when this device has unsynced edits', async () => {
    const { a, b, bookId } = await shared();
    await a.library.confirmDelete((await a.library.requestDelete(bookId)).token);
    await a.engine.syncAll();
    await edit(b, bookId, (m) => setText(m, 1, 'Unsynced work.'));
    await b.engine.syncAll();
    const [view] = await b.engine.getConflicts(bookId);
    expect(view?.conflict.kind).toBe('bookDeleted');
    if (!view) throw new Error('expected a conflict');
    await b.engine.resolveConflict(bookId, 'book', 'mine', view.expected);
    await b.engine.syncAll();
    const head = await b.remote.readHead(bookId);
    expect(head?.view.deleted).toBe(false);
    await a.engine.syncAll();
    expect(sectionText((await load(a, bookId)).manuscript, 'One')).toContain('Unsynced work.');
  });

  it('keeps a locally deleted book that changed in the cloud meanwhile (downloads it again)', async () => {
    const { a, b, bookId } = await shared();
    await edit(b, bookId, (m) => setText(m, 1, 'Changed after A last synced.'));
    await b.engine.syncAll();
    await a.library.confirmDelete((await a.library.requestDelete(bookId)).token);
    await a.engine.syncAll();
    await a.engine.syncAll();
    expect((await a.remote.readHead(bookId))?.view.deleted).toBe(false);
    expect(sectionText((await load(a, bookId)).manuscript, 'One')).toContain('Changed after A last synced.');
  });
});

describe('durable queue and failures', () => {
  it('keeps queued changes across an app restart and uploads them afterwards', async () => {
    const backend = new MemoryBackend();
    const path = join(dir, 'restart.db');
    const first = await device(backend, 'r1', 'alice', { path });
    first.session.offline = true;
    const created = await first.library.create({ manuscript: book('Offline novel') });
    await edit(first, created.bookId, (m) => setText(m, 1, 'Written offline.'));
    await first.engine.syncAll();
    await first.engine.stop();
    await first.store.close();

    const second = await device(backend, 'r2', 'alice', { path });
    expect(await second.library.listOutbox()).toHaveLength(1);
    await second.engine.syncAll();
    expect(await second.library.listOutbox()).toEqual([]);
    const remote = await second.remote.readBook(created.bookId);
    expect(sectionText(remote?.manuscript as Manuscript, 'One')).toContain('Written offline.');
  });

  it('does not commit twice when the acknowledgement is lost (duplicate delivery)', async () => {
    const { backend, a, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Once.'));
    backend.inject({ op: 'transaction', when: 'afterCommit', code: 'unavailable' });
    await a.engine.syncBook(bookId);
    expect((await syncState(a, bookId)).pending).not.toBeNull();
    expect((await status(a, bookId))?.kind).toBe('offline');
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(2);

    await edit(a, bookId, (m) => setText(m, 1, 'Once, then edited before the retry.'));
    await a.engine.syncBook(bookId);
    const state = await syncState(a, bookId);
    expect(state.conflicts).toEqual([]);
    expect(state.pending).toBeNull();
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(3);
    expect(sectionText((await a.remote.readBook(bookId))?.manuscript as Manuscript, 'One')).toContain('then edited before the retry');
  });

  it('leaves the cloud untouched when the network fails before commit, then backs off and retries', async () => {
    const { backend, a, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Retry me.'));
    backend.inject({ op: 'transaction', when: 'beforeCommit', code: 'unavailable' });
    await a.engine.syncBook(bookId);
    expect((await a.remote.readHead(bookId))?.view.revision).toBe(1);
    const failed = await syncState(a, bookId);
    expect(failed.failure).toMatchObject({ code: 'unavailable', permanent: false, attempts: 1 });
    backend.inject({ op: 'transaction', when: 'beforeCommit', code: 'unavailable' });
    await a.engine.syncBook(bookId);
    const again = await syncState(a, bookId);
    expect(again.failure?.attempts).toBe(2);
    expect((again.failure?.nextAttemptAt ?? 0) - Date.now()).toBeGreaterThan(700);
    await a.engine.syncBook(bookId);
    expect((await syncState(a, bookId)).failure).toBeNull();
    expect((await status(a, bookId))?.kind).toBe('synced');
  });

  it('never applies a partially written book: a mismatched section aborts the read and keeps local content', async () => {
    const { backend, a, b, bookId } = await shared();
    await edit(a, bookId, (m) => setText(m, 1, 'Committed.'));
    await a.engine.syncAll();
    const head = await a.remote.readHead(bookId);
    const sectionId = Object.entries(head?.view.sections ?? {}).find(([, s]) => s.revision === 2)?.[0] as string;
    const path = `users/alice/manuscripts/${bookId}/sections/${sectionId}`;
    const doc = backend.docs.get(path) as Record<string, unknown>;
    backend.docs.set(path, { ...doc, revision: 9 });
    const before = await load(b, bookId);
    await b.engine.syncBook(bookId);
    expect((await syncState(b, bookId)).failure).toMatchObject({ code: 'aborted', permanent: false });
    expect((await load(b, bookId)).manuscript).toEqual(before.manuscript);
  });

  it('refuses newer-format or damaged cloud data without changing the device copy', async () => {
    const { backend, b, bookId } = await shared();
    const headPath = `users/alice/manuscripts/${bookId}`;
    const head = backend.docs.get(headPath) as Record<string, unknown>;
    backend.docs.set(headPath, { ...head, syncFormat: 99 });
    const before = await load(b, bookId);
    await b.engine.syncBook(bookId);
    expect((await status(b, bookId))).toMatchObject({ kind: 'failed', needsRetry: true });
    expect((await syncState(b, bookId)).failure?.code).toBe('unsupported_version');
    backend.docs.set(headPath, { ...head, structure: '{"title":' });
    await b.engine.syncBook(bookId);
    expect((await syncState(b, bookId)).failure?.code).toBe('invalid_data');
    expect((await load(b, bookId)).manuscript).toEqual(before.manuscript);
  });

  it('refuses commits over the size limit without touching local content', async () => {
    const backend = new MemoryBackend();
    const a = await device(backend, 'a', 'alice', { chunkSize: 1000 });
    const huge = createManuscript({
      title: 'Huge',
      sections: [createSection({ kind: 'chapter', title: 'Long', blocks: [createParagraph('x'.repeat(500_000))] })],
    });
    const created = await a.library.create({ manuscript: huge });
    await a.engine.syncBook(created.bookId);
    expect((await syncState(a, created.bookId)).failure).toMatchObject({ code: 'too_large', permanent: true });
    expect(await a.remote.readHead(created.bookId)).toBeNull();
    expect((await load(a, created.bookId)).manuscript.sections).toEqual(huge.sections);
  });

  it('chunks oversized sections and reassembles them exactly', async () => {
    const backend = new MemoryBackend();
    const a = await device(backend, 'a', 'alice', { chunkSize: 4000 });
    const long = createManuscript({
      title: 'Long chapter',
      sections: [createSection({ kind: 'chapter', title: 'Long', blocks: Array.from({ length: 50 }, (_, i) => createParagraph(`Paragraph ${i} 🙂 ${'é'.repeat(300)}`)) })],
    });
    const created = await a.library.create({ manuscript: long });
    await a.engine.syncAll();
    const head = await a.remote.readHead(created.bookId);
    expect(Object.values(head?.view.sections ?? {})[0]?.chunkCount).toBeGreaterThan(3);
    const b = await device(backend, 'b', 'alice', { chunkSize: 4000 });
    await b.engine.syncAll();
    expect((await load(b, created.bookId)).manuscript.sections).toEqual(long.sections);
    await edit(a, created.bookId, (m) => setText(m, 0, 'Now short.'));
    await a.engine.syncAll();
    expect([...backend.docs.keys()].filter((p) => p.includes('/chunks/') && p.includes('/sections/'))).toEqual([]);
  });
});

describe('editor open', () => {
  it('defers cloud changes for an open manuscript and applies them when it closes', async () => {
    const { a, b, bookId } = await shared();
    b.engine.setEditing(bookId, true);
    await edit(a, bookId, (m) => setText(m, 1, 'Remote change.'));
    await a.engine.syncAll();
    await edit(b, bookId, (m) => setText(m, 3, 'Typing in the open editor.'));
    const revision = (await load(b, bookId)).localRevision;
    await b.engine.syncBook(bookId);
    expect((await load(b, bookId)).localRevision).toBe(revision);
    expect((await status(b, bookId))?.kind).toBe('waiting');
    expect(sectionText((await a.remote.readBook(bookId))?.manuscript as Manuscript, 'Three')).toContain('Typing in the open editor.');
    b.engine.setEditing(bookId, false);
    await b.engine.syncBook(bookId);
    expect(sectionText((await load(b, bookId)).manuscript, 'One')).toContain('Remote change.');
    expect((await status(b, bookId))?.kind).toBe('synced');
  });
});

describe('snapshots', () => {
  it('restores a snapshot after preserving the current state, and syncs it to other devices', async () => {
    const { a, b, bookId } = await shared();
    const [initial] = await a.engine.listSnapshots(bookId);
    await edit(a, bookId, (m) => setText(m, 1, 'Later draft.'));
    await a.engine.syncAll();
    await edit(a, bookId, (m) => setText(m, 1, 'Unsynced.'));
    await expect(a.engine.restoreSnapshot(bookId, initial?.id ?? '')).rejects.toBeInstanceOf(SnapshotRestoreError);
    await a.engine.syncAll();

    await a.engine.restoreSnapshot(bookId, initial?.id ?? '');
    expect(sectionText((await load(a, bookId)).manuscript, 'One')).toContain('One original text.');
    expect(JSON.stringify(await a.library.listPreserved())).toContain('Unsynced.');
    expect((await a.engine.listSnapshots(bookId)).map((s) => s.reason)).toContain('beforeRestore');
    await a.engine.syncAll();
    await b.engine.syncAll();
    expect(sectionText((await load(b, bookId)).manuscript, 'One')).toContain('One original text.');
  });

  it('bounds automatic snapshots by the retention policy', async () => {
    const backend = new MemoryBackend();
    const a = await device(backend, 'a', 'alice', { engine: { snapshotIntervalMs: 0, retention: { automatic: 3 } } });
    const created = await a.library.create({ manuscript: book() });
    for (let i = 0; i < 6; i++) {
      await edit(a, created.bookId, (m) => setText(m, 1, `Draft ${i}.`));
      await a.engine.syncAll();
    }
    const snapshots = await a.engine.listSnapshots(created.bookId);
    expect(snapshots.length).toBe(3);
    const restored = await a.remote.readSnapshot(created.bookId, snapshots[0]?.id ?? '');
    expect(sectionText(restored.manuscript, 'One')).toContain('Draft 5.');
  });
});

describe('accounts', () => {
  it('refuses to touch another account and pauses on a session for a different user', async () => {
    const backend = new MemoryBackend();
    const alice = await device(backend, 'alice', 'alice');
    const created = await alice.library.create({ manuscript: book() });
    await alice.engine.syncAll();

    const bob = await device(backend, 'bob', 'bob');
    await bob.engine.syncAll();
    expect(await bob.library.list()).toEqual([]);
    const intruder = new RemoteBooks(backend.client(() => 'bob'), 'alice');
    await expect(intruder.readHead(created.bookId)).rejects.toMatchObject({ code: 'wrong_account' });
    const forged = backend.client(() => 'bob');
    await expect(forged.get(`users/alice/manuscripts/${created.bookId}`)).rejects.toMatchObject({ code: 'permission-denied' });

    await edit(alice, created.bookId, (m) => setText(m, 1, 'Edited by Alice.'));
    alice.session.uid = 'bob';
    const writes = backend.stats.writes;
    await alice.engine.syncAll();
    expect(alice.engine.getSnapshot().paused).toBe('wrongAccount');
    expect(backend.stats.writes).toBe(writes);
    expect(await alice.library.listOutbox()).toHaveLength(1);
  });

  it('pauses when signed out mid-sync and resumes for the same account only', async () => {
    const backend = new MemoryBackend();
    const a = await device(backend, 'a');
    const created = await a.library.create({ manuscript: book() });
    backend.beforeNextTransaction(async () => {
      a.session.uid = null;
    });
    await a.engine.syncBook(created.bookId);
    expect(a.engine.getSnapshot().paused).toBe('signedOut');
    expect(await a.remote.readHead(created.bookId).catch((e: { code: string }) => e.code)).toBe('unauthenticated');
    expect((await status(a, created.bookId))?.kind).toBe('savedLocally');
    await a.engine.stop();

    a.session.uid = 'alice';
    const resumed = new SyncEngine({ store: a.store, library: a.library, remote: a.remote, autoSchedule: false });
    resumed.start();
    await resumed.syncAll();
    expect((await a.remote.readHead(created.bookId))?.view.revision).toBe(1);
  });

  it('switching accounts on one device keeps each account’s queue separate', async () => {
    const backend = new MemoryBackend();
    const path = join(dir, 'shared-device.db');
    const asAlice = await device(backend, 'shared', 'alice', { path });
    asAlice.session.offline = true;
    await asAlice.library.create({ manuscript: book('Alice private') });
    await asAlice.engine.stop();
    asAlice.library.close();

    const bobLibrary = asAlice.store.forUser('bob');
    const bobSession = { uid: 'bob' as string | null };
    const bobEngine = new SyncEngine({ store: asAlice.store, library: bobLibrary, remote: new RemoteBooks(backend.client(() => bobSession.uid), 'bob'), autoSchedule: false });
    bobEngine.start();
    await bobLibrary.create({ manuscript: book('Bob book') });
    await bobEngine.syncAll();
    expect([...backend.docs.keys()].some((p) => p.startsWith('users/alice/'))).toBe(false);
    expect([...backend.docs.keys()].some((p) => p.startsWith('users/bob/manuscripts/'))).toBe(true);
    expect(await asAlice.store.forUser('alice').listOutbox()).toHaveLength(1);
  });

  it('rejects a library/remote account mismatch at construction', async () => {
    const backend = new MemoryBackend();
    const a = await device(backend, 'a');
    expect(() => new SyncEngine({ store: a.store, library: a.library, remote: new RemoteBooks(backend.client(() => 'bob'), 'bob') })).toThrow(/different accounts/);
  });
});

describe('cloud copy missing (emulator restart)', () => {
  it('re-uploads from the device without losing content', async () => {
    const { backend, a, bookId } = await shared();
    backend.reset();
    await a.engine.syncAll();
    const remote = await a.remote.readBook(bookId);
    expect(remote?.manuscript.sections).toEqual((await load(a, bookId)).manuscript.sections);
  });
});
