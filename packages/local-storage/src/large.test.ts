import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countWords, createParagraph, type Manuscript, manuscriptToPlainText, serializeManuscript } from '@folio-loom/book-model';
import { stableHash } from '@folio-loom/sync';
import { afterAll, describe, expect, it } from 'vitest';
import { AutosaveController } from './autosave';
import type { StorageDriver } from './driver';
import { createIndexedDbDriver } from './indexeddb';
import { createSqliteDriver } from './sqlite';
import { LocalManuscriptStore } from './store';
import { fakeIndexedDb, fakeKeyRange } from './testing/backends';
import { importFixture } from './testing/fixtures';
import { nodeSqliteConnection } from './testing/nodeSqlite';

/**
 * Persists the ~210k-word QA fixture end to end and prints timings. Budgets are deliberately
 * loose so the test catches pathological regressions, not machine-to-machine noise.
 */
const BUDGET_MS = 5000;
const dir = mkdtempSync(join(tmpdir(), 'folio-loom-large-'));
const timings: Record<string, Record<string, number>> = {};

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  console.info(`\nLarge manuscript timings (ms):\n${JSON.stringify(timings, null, 2)}`);
});

async function time<T>(backend: string, label: string, run: () => Promise<T> | T): Promise<T> {
  const start = performance.now();
  const result = await run();
  const elapsed = Math.round((performance.now() - start) * 10) / 10;
  timings[backend] ??= {};
  (timings[backend] as Record<string, number>)[label] = elapsed;
  expect(elapsed).toBeLessThan(BUDGET_MS);
  return result;
}

function editLastParagraph(manuscript: Manuscript, suffix: string): Manuscript {
  const sections = [...manuscript.sections];
  const last = sections[sections.length - 1];
  if (!last) throw new Error('fixture has no sections');
  sections[sections.length - 1] = { ...last, blocks: [...last.blocks, createParagraph(suffix)] };
  return { ...manuscript, sections };
}

const source = importFixture('very-large-manuscript');
const sourceText = manuscriptToPlainText(source);

const backends: { name: string; driver: () => StorageDriver }[] = [
  { name: 'sqlite (file, WAL, synchronous=FULL)', driver: () => createSqliteDriver(async () => nodeSqliteConnection(join(dir, 'large.db'))) },
  { name: 'indexeddb (fake-indexeddb, in memory)', driver: () => createIndexedDbDriver({ indexedDB: fakeIndexedDb(), keyRange: fakeKeyRange }) },
];

describe('very large manuscript fixture', () => {
  it('is the ~210k word fixture', () => {
    expect(countWords(sourceText)).toBeGreaterThan(200_000);
  });

  it('serializes and hashes within budget', async () => {
    const json = await time('shared', 'serialize', () => serializeManuscript(source));
    await time('shared', 'checksum', () => stableHash(json));
    timings.shared = { ...timings.shared, serializedKB: Math.round(json.length / 1024) };
  });
});

describe.each(backends)('$name with the very large fixture', ({ name, driver }) => {
  it('creates, saves, loads, reopens and keeps every word', async () => {
    const store = new LocalManuscriptStore(driver());
    await store.ready;
    const library = store.forUser('alice-uid');

    const created = await time(name, 'create', () => library.create({ manuscript: source }));
    let current = created.manuscript;
    let revision = created.localRevision;
    for (let i = 1; i <= 3; i++) {
      current = editLastParagraph(current, `Edit ${i}.`);
      revision = (await time(name, `save #${i}`, () => library.save(created.bookId, current, revision))).localRevision;
    }

    const loaded = await time(name, 'load', () => library.load(created.bookId));
    if (!loaded.ok) throw new Error(`load failed: ${JSON.stringify(loaded)}`);
    const text = manuscriptToPlainText(loaded.record.manuscript);
    expect(text.startsWith(sourceText)).toBe(true);
    expect(text.endsWith('Edit 1.\n\nEdit 2.\n\nEdit 3.')).toBe(true);
    await time(name, 'list', () => library.list());
    await time(name, 'load previous revision', () => library.loadRevision(created.bookId, revision - 1));
    expect(await library.listRevisions(created.bookId)).toHaveLength(4);
  });

  it('keeps the newest of many rapid edits without overlapping writes', async () => {
    const store = new LocalManuscriptStore(driver());
    await store.ready;
    const library = store.forUser('bob-uid');
    const created = await library.create({ manuscript: source });
    let inFlight = 0;
    let maxInFlight = 0;
    let writes = 0;
    const autosave = new AutosaveController<Manuscript>({
      initialRevision: created.localRevision,
      debounceMs: 5,
      maxWaitMs: 20,
      save: async (value, expected) => {
        inFlight += 1;
        writes += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await library.save(created.bookId, value, expected);
        } finally {
          inFlight -= 1;
        }
      },
    });

    let current = created.manuscript;
    await time(name, '40 rapid edits + final flush', async () => {
      for (let i = 1; i <= 40; i++) {
        current = { ...current, title: `Rapid ${i}` };
        autosave.update(current);
        if (i % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 3));
      }
      expect((await autosave.flush()).status).toBe('saved');
    });
    timings[name] = { ...timings[name], 'writes for 40 edits': writes };
    expect(maxInFlight).toBe(1);
    const loaded = await library.load(created.bookId);
    if (!loaded.ok) throw new Error('load failed');
    expect(loaded.record.manuscript.title).toBe('Rapid 40');
    expect(manuscriptToPlainText(loaded.record.manuscript).length).toBe(sourceText.length);
  });
});
