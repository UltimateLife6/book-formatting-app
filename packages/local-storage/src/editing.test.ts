import { createManuscript, createParagraph, createSection, manuscriptToPlainText } from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import { createManuscriptAutosave, firstParagraphText, withFirstParagraph, withTitle } from './editing';
import { LocalManuscriptStore } from './store';
import { TEST_BACKENDS } from './testing/backends';
import { importFixture } from './testing/fixtures';

describe('minimal editor helpers', () => {
  it('edits only the first paragraph and keeps every other block', () => {
    const manuscript = importFixture('medium-manuscript');
    const before = manuscriptToPlainText(manuscript);
    const original = firstParagraphText(manuscript);
    const edited = withFirstParagraph(manuscript, `${original} (edited)`);
    expect(firstParagraphText(edited)).toBe(`${original} (edited)`);
    expect(manuscriptToPlainText(edited)).toBe(before.replace(original, `${original} (edited)`));
    edited.sections.slice(1).forEach((section, i) => {
      expect(section).toBe(manuscript.sections[i + 1]);
    });
    expect(edited.sections[0]?.blocks.length).toBe(manuscript.sections[0]?.blocks.length);
  });

  it('returns the same object when nothing changed', () => {
    const manuscript = importFixture('small-manuscript');
    expect(withFirstParagraph(manuscript, firstParagraphText(manuscript))).toBe(manuscript);
    expect(withTitle(manuscript, manuscript.title)).toBe(manuscript);
  });

  it('adds a paragraph or section when there is none', () => {
    const empty = createManuscript({ title: 'Empty', sections: [] });
    expect(firstParagraphText(withFirstParagraph(empty, 'Hello'))).toBe('Hello');
    const headingOnly = createManuscript({ title: 'H', sections: [createSection({ kind: 'chapter', title: 'One', blocks: [] })] });
    expect(firstParagraphText(withFirstParagraph(headingOnly, 'Hi'))).toBe('Hi');
  });

  it('keeps the paragraph id stable across edits', () => {
    const manuscript = createManuscript({
      title: 'T',
      sections: [createSection({ kind: 'chapter', title: 'One', blocks: [createParagraph('a'), createParagraph('b')] })],
    });
    const id = manuscript.sections[0]?.blocks[0]?.id;
    expect(withFirstParagraph(manuscript, 'changed').sections[0]?.blocks[0]?.id).toBe(id);
  });
});

describe.each(TEST_BACKENDS)('$name: editor round trip', ({ makeDriver }) => {
  it('edit title and paragraph, close, reopen after "sign out and back in", nothing lost', async () => {
    const driver = makeDriver();
    const store = new LocalManuscriptStore(driver);
    await store.ready;
    let library = store.forUser('alice-uid');
    const record = await library.create();
    const autosave = createManuscriptAutosave(library, record, { debounceMs: 1 });
    let doc = withTitle(record.manuscript, 'My Novel');
    autosave.update(doc);
    doc = withFirstParagraph(doc, 'It was a dark and stormy night.');
    autosave.update(doc);
    const closed = await autosave.close();
    expect(closed).toMatchObject({ unsaved: null, snapshot: { status: 'saved' } });

    // Sign out: the library for alice is closed; sign back in: a fresh library for the same UID.
    library.close();
    library = store.forUser('alice-uid');
    const [summary] = await library.list();
    expect(summary).toMatchObject({ title: 'My Novel', dirty: true });
    const loaded = await library.load(record.bookId);
    if (!loaded.ok) throw new Error('load failed');
    expect(firstParagraphText(loaded.record.manuscript)).toBe('It was a dark and stormy night.');
  });

  it('a pending autosave from a signed-out account can never land in another account', async () => {
    const store = new LocalManuscriptStore(makeDriver());
    await store.ready;
    const alice = store.forUser('alice-uid');
    const record = await alice.create({ title: 'Alice' });
    const autosave = createManuscriptAutosave(alice, record, { debounceMs: 10_000 });
    autosave.update(withTitle(record.manuscript, 'Alice secret edit'));
    // Account switch: dispose the editor (drops pending edits) and close Alice's library.
    autosave.dispose();
    alice.close();
    const bob = store.forUser('bob-uid');
    expect(await bob.list()).toEqual([]);
    const flushed = await autosave.flush();
    expect(flushed.status).toBe('unsaved');
    expect(await bob.list()).toEqual([]);
    const aliceAgain = store.forUser('alice-uid');
    expect((await aliceAgain.list()).map((s) => s.title)).toEqual(['Alice']);
  });
});
