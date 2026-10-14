import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMATTING, defaultPrintMargins, findTrimSize, minimumInsideMargin, TRIM_SIZES } from './index';

describe('formatting', () => {
  it('ships the legacy trim presets and a valid default', () => {
    expect(TRIM_SIZES.map((t) => t.id)).toEqual(['5x8', '5.25x8', '5.5x8.5', '6x9', '7x10', '8.5x11']);
    expect(findTrimSize(DEFAULT_FORMATTING.trimSizeId)).toBeDefined();
  });

  it('never returns margins below printer minimums', () => {
    for (const trim of TRIM_SIZES) {
      for (const pages of [24, 200, 450, 650, 800]) {
        const margins = defaultPrintMargins(trim, pages);
        expect(margins.inside).toBeGreaterThanOrEqual(minimumInsideMargin(pages));
        expect(margins.outside).toBeGreaterThanOrEqual(0.25);
      }
    }
  });
});
