import { createManuscript, createParagraph, createSection, type Manuscript, manuscriptToPlainText, serializeManuscript } from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import { AutosaveController } from './autosave';
import { StorageError } from './errors';
import { LocalManuscriptStore } from './store';
import { importFixture } from './testing/fixtures';
import { TEST_BACKENDS } from './testing/backends';

function retitle(manuscript: Manuscript, title: string, paragraph?: string): Manuscript {
  const [first, ...rest] = manuscript.sections;
  const sections = paragraph === undefined || !first ? manuscript.sections : [{ ...first, blocks: [createParagraph(paragraph)] }, ...rest];
  return { ...manuscript, title, sections };
}

async function expectCode(promise: Promise<unknown>, code: StorageError['code']) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StorageError);
  expect((error as StorageError).code).toBe(code);
}

describe.each(TEST_BACKENDS)('$name: shared storage contract', ({ makeDriver }) => {
  async function openStore(options: ConstructorParameters<typeof LocalManuscriptStore>[1] = {}) {
    const store = new LocalManuscriptStore(makeDriver(), options);
    await store.ready;
    return store;
  }

  async function setup(options?: ConstructorParameters<typeof LocalManuscriptStore>[1]) {
    const store = await openStore(options);
    return { store, alice: store.forUser('alice-uid'), bob: store.forUser('bob-uid') };
  }

  it('opens ready at the latest schema version', async () => {
    const store = await openStore();
    expect(store.getStatus()).toMatchObject({ state: { status: 'ready' }, databaseVersion: 2, lastError: null });
  });

  it('creates, lists and loads a blank manuscript with a stable book ID and owner', async () => {
    const { alice } = await setup();
    const created = await alice.create({ title: 'First book' });
    expect(created.bookId).toMatch(/^bk_/);
    expect(created).toMatchObject({ ownerUid: 'alice-uid', localRevision: 1, dirty: true, syncedRevision: null });

    const [summary] = await alice.list();
    expect(summary).toMatchObject({ bookId: created.bookId, title: 'First book', localRevision: 1, health: 'ok' });

    const loaded = await alice.load(created.bookId);
    expect(loaded.ok && loaded.record.manuscript).toEqual(created.manuscript);
  });

  it('saves new revisions and lists them newest first', async () => {
    const { alice } = await setup();
    const { bookId, manuscript } = await alice.create({ title: 'Draft' });
    const receipt = await alice.save(bookId, retitle(manuscript, 'Draft 2', 'It was a dark and stormy night.'), 1);
    expect(receipt.localRevision).toBe(2);

    const loaded = await alice.load(bookId);
    if (!loaded.ok) throw new Error('expected load to succeed');
    expect(loaded.record.manuscript.title).toBe('Draft 2');
    expect(manuscriptToPlainText(loaded.record.manuscript)).toContain('It was a dark and stormy night.');
    expect((await alice.list())[0]).toMatchObject({ title: 'Draft 2', wordCount: 9, localRevision: 2 });
    expect((await alice.listRevisions(bookId)).map((r) => [r.revision, r.reason])).toEqual([
      [2, 'edit'],
      [1, 'create'],
    ]);
    const first = await alice.loadRevision(bookId, 1);
    expect(first.ok && first.manuscript.title).toBe('Draft');
  });

  it('refuses a stale save and keeps the newer content', async () => {
    const { alice } = await setup();
    const { bookId, manuscript } = await alice.create();
    await alice.save(bookId, retitle(manuscript, 'Newer'), 1);
    await expectCode(alice.save(bookId, retitle(manuscript, 'Older'), 1), 'stale_revision');
    const loaded = await alice.load(bookId);
    expect(loaded.ok && loaded.record.manuscript.title).toBe('Newer');
  });

  it('rejects invalid manuscripts and mismatched IDs without writing', async () => {
    const { store, alice } = await setup();
    const { bookId, manuscript } = await alice.create();
    await expectCode(alice.save(bookId, { ...manuscript, id: 'bk_other' }, 1), 'invalid_manuscript');
    await expectCode(alice.save(bookId, { ...manuscript, title: 42 } as unknown as Manuscript, 1), 'invalid_manuscript');
    expect((await alice.list())[0]?.localRevision).toBe(1);
    expect(store.getStatus().lastError).toBeNull();
  });

  it('prunes old revisions but always keeps the current one', async () => {
    const { alice } = await setup({ keepRevisions: 3 });
    const { bookId, manuscript } = await alice.create();
    for (let revision = 1; revision <= 5; revision++) await alice.save(bookId, retitle(manuscript, `v${revision + 1}`), revision);
    expect((await alice.listRevisions(bookId)).map((r) => r.revision)).toEqual([6, 5, 4]);
    expect(await alice.loadRevision(bookId, 1)).toMatchObject({ ok: false });
  });

  it('restores an older revision as a new revision', async () => {
    const { alice } = await setup();
    const { bookId, manuscript } = await alice.create({ title: 'Original' });
    await alice.save(bookId, retitle(manuscript, 'Changed'), 1);
    const restored = await alice.restoreRevision(bookId, 1);
    expect(restored).toMatchObject({ localRevision: 3, manuscript: { title: 'Original' } });
    expect((await alice.listRevisions(bookId))[0]).toMatchObject({ revision: 3, reason: 'restore' });
    expect(await alice.listQuarantine(bookId)).toEqual([]);
  });

  describe('account isolation', () => {
    it('one account cannot list, load, save, delete or mark another account’s books', async () => {
      const { alice, bob } = await setup();
      const book = await alice.create({ title: 'Alice private' });

      expect(await bob.list()).toEqual([]);
      expect(await bob.load(book.bookId)).toEqual({ ok: false, reason: 'not_found' });
      await expectCode(bob.save(book.bookId, retitle(book.manuscript, 'Hijacked'), 1), 'not_found');
      await expectCode(bob.requestDelete(book.bookId), 'not_found');
      await expectCode(bob.markSynced(book.bookId, 1, 1), 'stale_revision');
      expect(await bob.listRevisions(book.bookId)).toEqual([]);
      expect(await bob.loadRevision(book.bookId, 1)).toMatchObject({ ok: false });
      await expectCode(bob.restoreRevision(book.bookId, 1), 'corrupt_record');

      const loaded = await alice.load(book.bookId);
      expect(loaded.ok && loaded.record.manuscript.title).toBe('Alice private');
    });

    it('keeps same-ID books in different accounts fully separate', async () => {
      const { alice, bob } = await setup();
      const shared = createManuscript({ id: 'bk_shared', title: 'Shared ID' });
      await alice.create({ manuscript: shared });
      await bob.create({ manuscript: { ...shared, title: 'Bob copy' } });
      await alice.save('bk_shared', { ...shared, title: 'Alice edit' }, 1);

      const forBob = await bob.load('bk_shared');
      expect(forBob.ok && forBob.record).toMatchObject({ ownerUid: 'bob-uid', localRevision: 1, manuscript: { title: 'Bob copy' } });
      const forAlice = await alice.load('bk_shared');
      expect(forAlice.ok && forAlice.record).toMatchObject({ ownerUid: 'alice-uid', localRevision: 2, manuscript: { title: 'Alice edit' } });
    });

    it('a closed library rejects new calls; reopening for the same account still sees its books', async () => {
      const { store, alice } = await setup();
      const book = await alice.create();
      alice.close();
      await expectCode(alice.list(), 'closed');
      await expectCode(alice.save(book.bookId, book.manuscript, 1), 'closed');
      expect((await store.forUser('alice-uid').list()).map((s) => s.bookId)).toEqual([book.bookId]);
    });

    it('a save queued by account A lands only in A, never in B’s session', async () => {
      const { store, alice } = await setup();
      const book = await alice.create({ title: 'A' });
      const autosave = new AutosaveController<Manuscript>({
        initialRevision: 1,
        save: (value, expected) => alice.save(book.bookId, value, expected),
      });
      autosave.update(retitle(book.manuscript, 'A edited'));
      const flushing = autosave.flush();
      // Account switch: A's UI state is dropped, B gets a fresh library.
      autosave.dispose();
      alice.close();
      const bob = store.forUser('bob-uid');
      await flushing;
      expect(await bob.list()).toEqual([]);
      const reloaded = await store.forUser('alice-uid').load(book.bookId);
      expect(reloaded.ok && reloaded.record.manuscript.title).toBe('A edited');
    });

    it('rejects a missing or malformed owner UID', async () => {
      const store = await openStore();
      expect(() => store.forUser('')).toThrow(StorageError);
      expect(() => store.forUser('a/b')).toThrow(StorageError);
    });
  });

  describe('delete with explicit confirmation', () => {
    it('deletes only after confirmDelete, removing revisions too', async () => {
      const { alice } = await setup();
      const book = await alice.create({ title: 'Doomed' });
      const request = await alice.requestDelete(book.bookId);
      expect(request).toMatchObject({ bookId: book.bookId, title: 'Doomed', localRevision: 1 });
      expect(await alice.list()).toHaveLength(1);

      await alice.confirmDelete(request.token);
      expect(await alice.list()).toEqual([]);
      expect(await alice.listRevisions(book.bookId)).toEqual([]);
      await expectCode(alice.confirmDelete(request.token), 'confirmation_required');
    });

    it('requires a new confirmation if the book changed or the request expired', async () => {
      let now = new Date('2026-10-14T12:00:00Z');
      const { alice } = await setup({ now: () => now });
      const book = await alice.create();
      const request = await alice.requestDelete(book.bookId);
      await alice.save(book.bookId, retitle(book.manuscript, 'Edited after request'), 1);
      await expectCode(alice.confirmDelete(request.token), 'confirmation_required');

      const second = await alice.requestDelete(book.bookId);
      now = new Date(now.getTime() + 10 * 60_000);
      await expectCode(alice.confirmDelete(second.token), 'confirmation_required');
      await expectCode(alice.confirmDelete('made-up-token'), 'confirmation_required');
      expect(await alice.list()).toHaveLength(1);
    });
  });

  describe('dirty / unsynced tracking for future sync', () => {
    it('marks saves dirty until acknowledged at that exact revision', async () => {
      const { alice } = await setup();
      const book = await alice.create();
      expect((await alice.listUnsynced()).map((s) => s.bookId)).toEqual([book.bookId]);

      await alice.markSynced(book.bookId, 1, 7);
      expect(await alice.listUnsynced()).toEqual([]);
      expect((await alice.list())[0]).toMatchObject({ dirty: false, syncedRevision: 7 });

      await alice.save(book.bookId, retitle(book.manuscript, 'Edit'), 1);
      expect((await alice.list())[0]).toMatchObject({ dirty: true, syncedRevision: 7, localRevision: 2 });
      await expectCode(alice.markSynced(book.bookId, 1, 8), 'stale_revision');
    });
  });

  it('reports failed writes in the store status and clears them on the next success', async () => {
    const { store, alice } = await setup();
    const book = await alice.create();
    await expectCode(alice.save(book.bookId, book.manuscript, 5), 'stale_revision');
    expect(store.getStatus().lastError?.code).toBe('stale_revision');
    await alice.save(book.bookId, book.manuscript, 1);
    expect(store.getStatus().lastError).toBeNull();
  });

  it('round-trips a medium manuscript with no text loss', async () => {
    const { alice } = await setup();
    const manuscript = importFixture('medium-manuscript');
    await alice.create({ manuscript });
    const loaded = await alice.load(manuscript.id);
    if (!loaded.ok) throw new Error(`load failed: ${JSON.stringify(loaded)}`);
    expect(manuscriptToPlainText(loaded.record.manuscript)).toBe(manuscriptToPlainText(manuscript));
    expect(serializeManuscript({ ...loaded.record.manuscript, updatedAt: manuscript.updatedAt })).toBe(serializeManuscript(manuscript));
  });

  it('handles many rapid edits through autosave: sequential writes, newest content wins', async () => {
    const { alice } = await setup();
    const book = await alice.create();
    let concurrent = 0;
    let maxConcurrent = 0;
    const autosave = new AutosaveController<Manuscript>({
      initialRevision: 1,
      debounceMs: 1,
      maxWaitMs: 5,
      save: async (value, expected) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        try {
          return await alice.save(book.bookId, value, expected);
        } finally {
          concurrent -= 1;
        }
      },
    });
    for (let i = 1; i <= 60; i++) {
      autosave.update(retitle(book.manuscript, `Edit ${i}`, `Paragraph ${i}`));
      if (i % 7 === 0) void autosave.flush();
      if (i % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const final = await autosave.flush();
    expect(final.status).toBe('saved');
    expect(maxConcurrent).toBe(1);
    const loaded = await alice.load(book.bookId);
    if (!loaded.ok) throw new Error('load failed');
    expect(loaded.record.manuscript.title).toBe('Edit 60');
    expect(manuscriptToPlainText(loaded.record.manuscript)).toContain('Paragraph 60');
    expect(loaded.record.localRevision).toBe(final.revision);
  });

  it('creates from an imported manuscript and keeps its sections', async () => {
    const { alice } = await setup();
    const manuscript = createManuscript({
      title: 'Imported',
      sections: [createSection({ kind: 'chapter', title: 'One', blocks: [createParagraph('Hello')] })],
    });
    const created = await alice.create({ manuscript });
    expect(created.bookId).toBe(manuscript.id);
    const again = await alice.create({ manuscript }).then(
      () => 'created twice',
      (error: StorageError) => error.code,
    );
    expect(again).toBe('write_failed');
  });
});
