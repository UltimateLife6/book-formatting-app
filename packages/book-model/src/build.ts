import { createId, type IdGenerator } from './ids';
import { normalizeRuns } from './runs';
import { MANUSCRIPT_SCHEMA_VERSION } from './schema';
import type {
  Block,
  BookMetadata,
  DetectionProvenance,
  HeadingBlock,
  Manuscript,
  ParagraphBlock,
  Part,
  SceneBreakBlock,
  Section,
  SectionKind,
  SectionRole,
  TextRun,
} from './types';

export function createParagraph(
  content: string | readonly TextRun[],
  idGen: IdGenerator = createId,
  options: Pick<ParagraphBlock, 'variant' | 'align'> = {},
): ParagraphBlock {
  const runs = typeof content === 'string' ? normalizeRuns([{ text: content }]) : normalizeRuns(content);
  const block: ParagraphBlock = { id: idGen('blk'), type: 'paragraph', runs };
  if (options.variant) block.variant = options.variant;
  if (options.align) block.align = options.align;
  return block;
}

export function createHeadingBlock(
  level: HeadingBlock['level'],
  content: string | readonly TextRun[],
  idGen: IdGenerator = createId,
): HeadingBlock {
  const runs = typeof content === 'string' ? normalizeRuns([{ text: content }]) : normalizeRuns(content);
  return { id: idGen('blk'), type: 'heading', level, runs };
}

export function createSceneBreak(marker: string | undefined, idGen: IdGenerator = createId): SceneBreakBlock {
  const block: SceneBreakBlock = { id: idGen('blk'), type: 'sceneBreak' };
  if (marker !== undefined && marker.length > 0) block.marker = marker;
  return block;
}

export interface CreateSectionInput {
  kind: SectionKind;
  role?: SectionRole;
  title: string;
  subtitle?: string;
  numbered?: boolean;
  startOnRecto?: boolean;
  blocks?: Block[];
  detection?: DetectionProvenance;
}

export function createSection(input: CreateSectionInput, idGen: IdGenerator = createId): Section {
  const section: Section = {
    id: idGen('sec'),
    kind: input.kind,
    role: input.role ?? (input.kind === 'chapter' ? 'chapter' : 'other'),
    title: input.title,
    numbered: input.numbered ?? input.kind === 'chapter',
    startOnRecto: input.startOnRecto ?? false,
    blocks: input.blocks ?? [],
  };
  if (input.subtitle !== undefined) section.subtitle = input.subtitle;
  if (input.detection) section.detection = input.detection;
  return section;
}

export function createPart(
  input: { title: string; subtitle?: string; sectionIds?: string[] },
  idGen: IdGenerator = createId,
): Part {
  const part: Part = { id: idGen('prt'), title: input.title, sectionIds: input.sectionIds ?? [] };
  if (input.subtitle !== undefined) part.subtitle = input.subtitle;
  return part;
}

export interface CreateManuscriptInput {
  id?: string;
  title?: string;
  subtitle?: string;
  authors?: string[];
  language?: string;
  metadata?: BookMetadata;
  sections?: Section[];
  parts?: Part[];
  now?: Date;
}

export function createManuscript(input: CreateManuscriptInput = {}, idGen: IdGenerator = createId): Manuscript {
  const timestamp = (input.now ?? new Date()).toISOString();
  const manuscript: Manuscript = {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    id: input.id ?? idGen('bk'),
    title: input.title ?? '',
    authors: input.authors ?? [],
    language: input.language ?? 'en',
    metadata: input.metadata ?? {},
    sections: input.sections ?? [],
    parts: input.parts ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (input.subtitle !== undefined) manuscript.subtitle = input.subtitle;
  return manuscript;
}
