import { type InlineMark, normalizeRuns, type TextRun } from '@folio-loom/book-model';

const MARK_TAG: Record<'bold' | 'italic', string> = { bold: 'strong', italic: 'em' };

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/** Serialize runs to HTML for a contenteditable paragraph (web only). Soft breaks become <br>. */
export function runsToHtml(runs: readonly TextRun[]): string {
  if (runs.length === 0) return '<br>';
  return runs
    .map((run) => {
      let html = escapeText(run.text);
      const marks = run.marks ?? [];
      if (marks.includes('italic')) html = `<em>${html}</em>`;
      if (marks.includes('bold')) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

/**
 * Parse contenteditable HTML back into runs. Only bold/italic (and nested combinations)
 * are preserved; unknown tags are flattened to their text. Soft breaks become `\n`.
 * Use in the browser (needs DOM). For tests, pass a Document from linkedom or jsdom.
 */
export function htmlToRuns(html: string, doc: Document = globalThis.document): TextRun[] {
  if (!doc) throw new Error('htmlToRuns needs a Document (browser or test DOM).');
  const container = doc.createElement('div');
  container.innerHTML = html;
  const runs: TextRun[] = [];

  const walk = (node: Node, inherited: InlineMark[]) => {
    if (node.nodeType === doc.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.length === 0) return;
      runs.push(inherited.length > 0 ? { text, marks: [...inherited] } : { text });
      return;
    }
    if (node.nodeType !== doc.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      runs.push({ text: '\n' });
      return;
    }
    const next = [...inherited];
    if (tag === 'strong' || tag === 'b') next.push('bold');
    if (tag === 'em' || tag === 'i') next.push('italic');
    for (const child of Array.from(el.childNodes)) walk(child, [...new Set(next)]);
  };

  for (const child of Array.from(container.childNodes)) walk(child, []);
  // Contenteditable often leaves a lone <br> for an empty block.
  if (runs.length === 1 && runs[0]?.text === '\n') return [];
  return normalizeRuns(runs);
}

export { MARK_TAG };
