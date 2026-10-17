import { describe, expect, it } from 'vitest';
import { runsToHtml } from './html';

describe('runsToHtml', () => {
  it('escapes HTML and wraps bold/italic', () => {
    expect(runsToHtml([{ text: 'a <b>', marks: ['bold'] }, { text: ' c', marks: ['italic'] }])).toBe(
      '<strong>a &lt;b&gt;</strong><em> c</em>',
    );
  });

  it('turns soft breaks into br tags', () => {
    expect(runsToHtml([{ text: 'a\nb' }])).toBe('a<br>b');
  });

  it('uses a lone br for an empty block', () => {
    expect(runsToHtml([])).toBe('<br>');
  });
});
