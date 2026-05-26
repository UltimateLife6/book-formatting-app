/** One open-book spread: left verso and right recto (1-based page numbers). */
export type PreviewSpread = [left: number | null, right: number | null];

/**
 * Groups sequential pages into book spreads.
 * First spread is `[null, 1]` so page 1 sits on the right like a printed book.
 */
export function buildPreviewSpreads(totalPages: number): PreviewSpread[] {
  if (totalPages <= 0) return [];

  const spreads: PreviewSpread[] = [[null, 1]];

  for (let page = 2; page <= totalPages; page += 2) {
    const right = page + 1 <= totalPages ? page + 1 : null;
    spreads.push([page, right]);
  }

  return spreads;
}

export function findSpreadIndexForPage(spreads: PreviewSpread[], pageNumber: number): number {
  const index = spreads.findIndex(([left, right]) => left === pageNumber || right === pageNumber);
  return index >= 0 ? index : 0;
}

/** Prefer the right page when present (recto-first navigation). */
export function primaryPageInSpread(spread: PreviewSpread | undefined): number {
  if (!spread) return 1;
  const [left, right] = spread;
  return right ?? left ?? 1;
}

export function formatSpreadLabel(
  spread: PreviewSpread,
  spreadIndex: number,
  spreadCount: number,
  hasTitlePage: boolean
): string {
  const [left, right] = spread;
  let pages = '';

  if (left === null && right !== null) {
    pages = hasTitlePage && right === 1 ? 'Title page' : `Page ${right}`;
  } else if (left !== null && right !== null) {
    pages = `Pages ${left}–${right}`;
  } else if (left !== null) {
    pages = `Page ${left}`;
  }

  const spreadPart = `Spread ${spreadIndex + 1} of ${spreadCount}`;
  return pages ? `${spreadPart} · ${pages}` : spreadPart;
}
