import type { SectionKind, SectionRole } from '@folio-loom/book-model';
import {
  CHAPTER_HEADING,
  cleanHeadingText,
  EPILOGUE_HEADING,
  matchesWeakNumericOnly,
  matchesWeakSpelledOnly,
  PROLOGUE_HEADING,
} from './patterns';

export interface SectionClassification {
  kind: SectionKind;
  role: SectionRole;
  numbered: boolean;
}

const TAIL = '(?:\\s*[:.\\-–—].*)?';

const MATTER_RULES: readonly { pattern: RegExp; kind: SectionKind; role: SectionRole }[] = [
  { pattern: new RegExp(`^title\\s+page${TAIL}$`, 'i'), kind: 'frontMatter', role: 'titlePage' },
  { pattern: new RegExp(`^copyright(?:\\s+page)?${TAIL}$`, 'i'), kind: 'frontMatter', role: 'copyright' },
  { pattern: new RegExp(`^dedication${TAIL}$`, 'i'), kind: 'frontMatter', role: 'dedication' },
  { pattern: new RegExp(`^epigraph${TAIL}$`, 'i'), kind: 'frontMatter', role: 'epigraph' },
  { pattern: new RegExp(`^(?:table\\s+of\\s+)?contents${TAIL}$`, 'i'), kind: 'frontMatter', role: 'contents' },
  { pattern: new RegExp(`^foreword${TAIL}$`, 'i'), kind: 'frontMatter', role: 'foreword' },
  { pattern: new RegExp(`^preface${TAIL}$`, 'i'), kind: 'frontMatter', role: 'preface' },
  { pattern: new RegExp(`^introduction${TAIL}$`, 'i'), kind: 'frontMatter', role: 'introduction' },
  { pattern: new RegExp(`^afterword${TAIL}$`, 'i'), kind: 'backMatter', role: 'afterword' },
  { pattern: new RegExp(`^acknowledge?ments?${TAIL}$`, 'i'), kind: 'backMatter', role: 'acknowledgments' },
  { pattern: new RegExp(`^about\\s+the\\s+author${TAIL}$`, 'i'), kind: 'backMatter', role: 'aboutAuthor' },
  { pattern: /^(?:also\s+by|other\s+books\s+by)\b.*$/i, kind: 'backMatter', role: 'alsoBy' },
  {
    pattern: new RegExp(`^(?:(?:an?\\s+)?author['’]?s\\s+note|a\\s+note\\s+from\\s+the\\s+author)${TAIL}$`, 'i'),
    kind: 'backMatter',
    role: 'note',
  },
  {
    pattern: new RegExp(`^(?:glossary|bibliography|appendix(?:\\s+\\w+)?)${TAIL}$`, 'i'),
    kind: 'backMatter',
    role: 'other',
  },
];

/**
 * A short standalone line that names front/back matter ("Dedication", "About the Author").
 * Sentence-like lines ("Also by the river they walked.") are rejected.
 */
export function classifyMatterHeading(line: string): SectionClassification | null {
  const t = cleanHeadingText(line);
  if (t.length === 0 || t.length > 60 || /[.!?,;]$/.test(t)) return null;
  for (const rule of MATTER_RULES) {
    if (rule.pattern.test(t)) return { kind: rule.kind, role: rule.role, numbered: false };
  }
  return null;
}

/**
 * Classify a section title found by a heading or pattern. Titles that are not recognisable
 * front/back matter (including "The Long Road Home") are numbered chapters.
 */
export function classifySectionTitle(title: string): SectionClassification {
  const t = cleanHeadingText(title);
  if (PROLOGUE_HEADING.test(t)) return { kind: 'frontMatter', role: 'prologue', numbered: false };
  if (EPILOGUE_HEADING.test(t)) return { kind: 'backMatter', role: 'epilogue', numbered: false };
  if (CHAPTER_HEADING.test(t) || matchesWeakNumericOnly(t) || matchesWeakSpelledOnly(t)) {
    return { kind: 'chapter', role: 'chapter', numbered: true };
  }
  for (const rule of MATTER_RULES) {
    if (rule.pattern.test(t)) return { kind: rule.kind, role: rule.role, numbered: false };
  }
  return { kind: 'chapter', role: 'chapter', numbered: true };
}
