import { createParagraph, createSceneBreak, createSection, createSequentialIdGenerator } from '@folio-loom/book-model';
import { describe, expect, it } from 'vitest';
import { blockToXhtml, escapeXml, runsToXhtml, sectionToXhtml } from './index';

describe('export-epub', () => {
  it('escapes markup and strips characters XML forbids', () => {
    expect(escapeXml(`Tom & "Jerry" <script>'x'</script>\u0001`)).toBe(
      'Tom &amp; &quot;Jerry&quot; &lt;script&gt;&apos;x&apos;&lt;/script&gt;',
    );
  });

  it('renders nested inline marks and soft breaks', () => {
    expect(runsToXhtml([{ text: 'a' }, { text: 'b\nc', marks: ['bold', 'italic'] }])).toBe(
      'a<strong><em>b<br/>c</em></strong>',
    );
  });

  it('renders scene breaks and aligned paragraphs', () => {
    const id = createSequentialIdGenerator('x');
    expect(blockToXhtml(createSceneBreak('* * *', id))).toBe('<hr class="scene-break" title="* * *"/>');
    expect(blockToXhtml(createParagraph('Hi', id, { align: 'center' }))).toBe('<p class="align-center">Hi</p>');
  });

  it('escapes titles inside the content document', () => {
    const id = createSequentialIdGenerator('x');
    const section = createSection({ kind: 'chapter', title: 'Cats & <Dogs>', blocks: [createParagraph('Text', id)] }, id);
    const xhtml = sectionToXhtml(section, { language: 'en', chapterNumber: 3 });
    expect(xhtml).toContain('<h1>Cats &amp; &lt;Dogs&gt;</h1>');
    expect(xhtml).toContain('epub:type="chapter"');
    expect(xhtml).not.toContain('<Dogs>');
  });
});
