/**
 * Cursor and selection model for manuscript editing.
 *
 * Offsets are UTF-16 code units into the concatenated plain text of a paragraph or heading
 * block's runs (the same coordinate system as `String.prototype.length` and DOM selection).
 * Scene breaks have no text offset.
 */

export interface TextPoint {
  sectionId: string;
  blockId: string;
  /** UTF-16 offset into the block's plain text; clamped by callers when applying ops. */
  offset: number;
}

export interface TextRange {
  anchor: TextPoint;
  focus: TextPoint;
}

export function isCollapsed(range: TextRange): boolean {
  return range.anchor.sectionId === range.focus.sectionId && range.anchor.blockId === range.focus.blockId && range.anchor.offset === range.focus.offset;
}

/** Ordered start/end of a range that lives inside a single block. */
export function blockRange(range: TextRange): { sectionId: string; blockId: string; start: number; end: number } | null {
  if (range.anchor.sectionId !== range.focus.sectionId || range.anchor.blockId !== range.focus.blockId) return null;
  const start = Math.min(range.anchor.offset, range.focus.offset);
  const end = Math.max(range.anchor.offset, range.focus.offset);
  return { sectionId: range.anchor.sectionId, blockId: range.anchor.blockId, start, end };
}

export function collapsedAt(sectionId: string, blockId: string, offset: number): TextRange {
  const point = { sectionId, blockId, offset };
  return { anchor: point, focus: point };
}
