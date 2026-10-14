export interface TrimSize {
  id: string;
  /** Inches. */
  width: number;
  height: number;
  name: string;
  description: string;
}

/** Carried over from the legacy BookContext presets. */
export const TRIM_SIZES: readonly TrimSize[] = [
  { id: '5x8', width: 5, height: 8, name: '5 × 8 in', description: 'Compact paperback, great for shorter works' },
  { id: '5.25x8', width: 5.25, height: 8, name: '5.25 × 8 in', description: 'Slightly wider than standard, good readability' },
  { id: '5.5x8.5', width: 5.5, height: 8.5, name: '5.5 × 8.5 in', description: 'Trade paperback size, comfortable reading' },
  { id: '6x9', width: 6, height: 9, name: '6 × 9 in', description: 'Most common paperback size (default for fiction)' },
  { id: '7x10', width: 7, height: 10, name: '7 × 10 in', description: 'Larger format for nonfiction guides and workbooks' },
  { id: '8.5x11', width: 8.5, height: 11, name: '8.5 × 11 in', description: 'Workbook size for guides and manuals' },
];

export function findTrimSize(id: string): TrimSize | undefined {
  return TRIM_SIZES.find((trim) => trim.id === id);
}

export interface PrintMargins {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
}

/**
 * Minimum inside (gutter-side) margin by page count, per Amazon KDP's no-bleed paperback
 * guidance. Must be re-checked against the printer's current spec before PDF export ships.
 */
export function minimumInsideMargin(pageCount: number): number {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

export const MINIMUM_OUTSIDE_MARGIN = 0.25;

/**
 * The legacy `calculateAutoMargins` scaled margins by trim size with no lower bound; this keeps
 * the same proportions but never goes below printer minimums.
 */
export function defaultPrintMargins(trim: TrimSize, pageCount: number): PrintMargins {
  const scale = Math.min(trim.width, trim.height) / 6;
  return {
    top: 0.75 * scale,
    bottom: 1 * scale,
    inside: Math.max(minimumInsideMargin(pageCount), 0.875 * scale),
    outside: Math.max(MINIMUM_OUTSIDE_MARGIN, 0.625 * scale),
  };
}

export type SceneBreakStyle = 'asterisks' | 'dinkus' | 'ornament' | 'blank';

export interface FormattingSettings {
  templateId: string;
  trimSizeId: string;
  bodyFont: string;
  headingFont: string;
  /** Points. */
  bodySize: number;
  lineHeight: number;
  firstLineIndent: number;
  justify: boolean;
  hyphenate: boolean;
  dropCaps: boolean;
  sceneBreak: SceneBreakStyle;
  chaptersStartOnRecto: boolean;
}

export const DEFAULT_FORMATTING: FormattingSettings = {
  templateId: 'classic',
  trimSizeId: '6x9',
  bodyFont: 'EB Garamond',
  headingFont: 'EB Garamond',
  bodySize: 11,
  lineHeight: 1.35,
  firstLineIndent: 0.3,
  justify: true,
  hyphenate: true,
  dropCaps: false,
  sceneBreak: 'asterisks',
  chaptersStartOnRecto: false,
};
