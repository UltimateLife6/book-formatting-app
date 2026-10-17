import { type InlineMark, normalizeRuns, runsToPlainText, type TextRun } from '@folio-loom/book-model';

/** Split runs at a plain-text offset. Left and right together reconstruct the input. */
export function splitRunsAt(runs: readonly TextRun[], offset: number): { left: TextRun[]; right: TextRun[] } {
  const text = runsToPlainText(runs);
  const at = Math.max(0, Math.min(text.length, offset));
  if (at === 0) return { left: [], right: normalizeRuns(runs) };
  if (at === text.length) return { left: normalizeRuns(runs), right: [] };

  const left: TextRun[] = [];
  const right: TextRun[] = [];
  let cursor = 0;
  for (const run of runs) {
    const next = cursor + run.text.length;
    if (next <= at) {
      left.push(run);
    } else if (cursor >= at) {
      right.push(run);
    } else {
      const cut = at - cursor;
      if (cut > 0) left.push({ ...run, text: run.text.slice(0, cut) });
      if (cut < run.text.length) right.push({ ...run, text: run.text.slice(cut) });
    }
    cursor = next;
  }
  return { left: normalizeRuns(left), right: normalizeRuns(right) };
}

/** Slice runs covering [start, end) in plain-text coordinates. */
export function sliceRuns(runs: readonly TextRun[], start: number, end: number): TextRun[] {
  const { right } = splitRunsAt(runs, start);
  return splitRunsAt(right, Math.max(0, end - start)).left;
}

/**
 * Insert plain text at `offset`, inheriting marks from the run at the caret
 * (or the previous run when at a boundary).
 */
export function insertTextIntoRuns(runs: readonly TextRun[], offset: number, text: string): TextRun[] {
  if (text.length === 0) return normalizeRuns(runs);
  const { left, right } = splitRunsAt(runs, offset);
  const inherited = left.at(-1)?.marks ?? right[0]?.marks;
  const inserted: TextRun = inherited && inherited.length > 0 ? { text, marks: [...inherited] } : { text };
  return normalizeRuns([...left, inserted, ...right]);
}

/** Delete the plain-text range [start, end). Unrelated runs keep their marks. */
export function deleteRangeFromRuns(runs: readonly TextRun[], start: number, end: number): TextRun[] {
  if (end <= start) return normalizeRuns(runs);
  const { left } = splitRunsAt(runs, start);
  const { right } = splitRunsAt(runs, end);
  return normalizeRuns([...left, ...right]);
}

function hasMark(marks: readonly InlineMark[] | undefined, mark: InlineMark): boolean {
  return !!marks?.includes(mark);
}

function withMark(marks: readonly InlineMark[] | undefined, mark: InlineMark, on: boolean): InlineMark[] | undefined {
  const set = new Set(marks ?? []);
  if (on) set.add(mark);
  else set.delete(mark);
  return set.size > 0 ? ([...set] as InlineMark[]) : undefined;
}

/** True when every character in [start, end) already has `mark` (empty range uses marks at the caret). */
export function rangeHasMark(runs: readonly TextRun[], start: number, end: number, mark: InlineMark): boolean {
  const text = runsToPlainText(runs);
  const a = Math.max(0, Math.min(text.length, start));
  const b = Math.max(0, Math.min(text.length, end));
  if (a === b) {
    if (a === 0) return hasMark(runs[0]?.marks, mark);
    const { left } = splitRunsAt(runs, a);
    return hasMark(left.at(-1)?.marks, mark);
  }
  const middle = sliceRuns(runs, a, b);
  return middle.length > 0 && middle.every((run) => hasMark(run.marks, mark));
}

/**
 * Toggle a mark over [start, end). If the range is empty, returns the runs unchanged
 * (callers apply pending-mark state at the caret for the next insert).
 * When every character already has the mark, it is removed; otherwise it is added.
 * Text outside the range is never rewritten.
 */
export function toggleMarkInRuns(runs: readonly TextRun[], start: number, end: number, mark: InlineMark): TextRun[] {
  if (end <= start) return normalizeRuns(runs);
  const on = !rangeHasMark(runs, start, end, mark);
  const { left } = splitRunsAt(runs, start);
  const middle = sliceRuns(runs, start, end).map((run) => {
    const marks = withMark(run.marks, mark, on);
    return marks ? { text: run.text, marks } : { text: run.text };
  });
  const { right } = splitRunsAt(runs, end);
  return normalizeRuns([...left, ...middle, ...right]);
}

/** Marks active at a caret offset (for toolbar state). */
export function marksAtOffset(runs: readonly TextRun[], offset: number): readonly InlineMark[] {
  if (runs.length === 0) return [];
  const text = runsToPlainText(runs);
  const at = Math.max(0, Math.min(text.length, offset));
  if (at === 0) return runs[0]?.marks ?? [];
  const { left } = splitRunsAt(runs, at);
  return left.at(-1)?.marks ?? [];
}

/** Replace the plain-text range with new runs (used for paste). */
export function replaceRangeWithRuns(runs: readonly TextRun[], start: number, end: number, replacement: readonly TextRun[]): TextRun[] {
  const { left } = splitRunsAt(runs, start);
  const { right } = splitRunsAt(runs, end);
  return normalizeRuns([...left, ...replacement, ...right]);
}
