import {
  buildPreviewSpreads,
  findSpreadIndexForPage,
  formatSpreadLabel,
  primaryPageInSpread,
} from '../previewSpreads';

describe('buildPreviewSpreads', () => {
  it('returns empty array for zero pages', () => {
    expect(buildPreviewSpreads(0)).toEqual([]);
  });

  it('places page 1 alone on the right', () => {
    expect(buildPreviewSpreads(1)).toEqual([[null, 1]]);
  });

  it('builds spreads for two pages', () => {
    expect(buildPreviewSpreads(2)).toEqual([[null, 1], [2, null]]);
  });

  it('builds spreads for three pages', () => {
    expect(buildPreviewSpreads(3)).toEqual([[null, 1], [2, 3]]);
  });

  it('builds spreads for four pages', () => {
    expect(buildPreviewSpreads(4)).toEqual([[null, 1], [2, 3], [4, null]]);
  });

  it('builds spreads for five pages', () => {
    expect(buildPreviewSpreads(5)).toEqual([[null, 1], [2, 3], [4, 5]]);
  });
});

describe('findSpreadIndexForPage', () => {
  const spreads = buildPreviewSpreads(5);

  it('finds the title spread for page 1', () => {
    expect(findSpreadIndexForPage(spreads, 1)).toBe(0);
  });

  it('finds the middle spread', () => {
    expect(findSpreadIndexForPage(spreads, 3)).toBe(1);
  });
});

describe('primaryPageInSpread', () => {
  it('prefers the right page', () => {
    expect(primaryPageInSpread([2, 3])).toBe(3);
  });

  it('falls back to the left page', () => {
    expect(primaryPageInSpread([4, null])).toBe(4);
  });
});

describe('formatSpreadLabel', () => {
  it('labels the opening title spread', () => {
    expect(formatSpreadLabel([null, 1], 0, 3, true)).toBe('Spread 1 of 3 · Title page');
  });
});
