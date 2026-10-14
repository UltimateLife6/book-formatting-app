import type { InlineMark, TextRun } from './types';

const MARK_ORDER: readonly InlineMark[] = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'smallCaps',
  'superscript',
  'subscript',
];

function canonicalMarks(marks: readonly InlineMark[] | undefined): InlineMark[] {
  if (!marks || marks.length === 0) return [];
  const set = new Set(marks);
  return MARK_ORDER.filter((mark) => set.has(mark));
}

function sameMarks(a: readonly InlineMark[], b: readonly InlineMark[]): boolean {
  return a.length === b.length && a.every((mark, i) => mark === b[i]);
}

/** Drop empty runs, de-duplicate and order marks, merge adjacent runs with identical marks. */
export function normalizeRuns(runs: readonly TextRun[]): TextRun[] {
  const out: { text: string; marks: InlineMark[] }[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const marks = canonicalMarks(run.marks);
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, marks)) {
      last.text += run.text;
    } else {
      out.push({ text: run.text, marks });
    }
  }
  return out.map((run) => (run.marks.length > 0 ? { text: run.text, marks: run.marks } : { text: run.text }));
}

export function runsToPlainText(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join('');
}

/** Trim leading whitespace of the first run and trailing whitespace of the last run. */
export function trimRuns(runs: readonly TextRun[]): TextRun[] {
  const copy = runs.map((run) => ({ ...run }));
  while (copy.length > 0) {
    const first = copy[0];
    if (!first) break;
    first.text = first.text.replace(/^\s+/u, '');
    if (first.text.length > 0) break;
    copy.shift();
  }
  while (copy.length > 0) {
    const last = copy[copy.length - 1];
    if (!last) break;
    last.text = last.text.replace(/\s+$/u, '');
    if (last.text.length > 0) break;
    copy.pop();
  }
  return normalizeRuns(copy);
}
