import { z } from 'zod';

/**
 * Bump on every persisted-shape change (including new optional fields) and register a migrator
 * in `serialize.ts`. Strict objects mean an older client rejects unknown fields instead of
 * silently stripping them and saving the loss back to the cloud.
 */
export const MANUSCRIPT_SCHEMA_VERSION = 1 as const;

export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'IDs may only contain letters, digits, "_" and "-"');

export const InlineMarkSchema = z.enum([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'smallCaps',
  'superscript',
  'subscript',
]);

export const TextRunSchema = z.strictObject({
  text: z.string(),
  marks: z.array(InlineMarkSchema).optional(),
});

export const ParagraphBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('paragraph'),
  runs: z.array(TextRunSchema),
  variant: z.enum(['body', 'blockQuote', 'verse']).optional(),
  align: z.enum(['start', 'center', 'end', 'justify']).optional(),
});

export const HeadingBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  runs: z.array(TextRunSchema),
});

export const SceneBreakBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('sceneBreak'),
  /** Original marker text from the source (e.g. "* * *"), kept so imports never drop characters. */
  marker: z.string().optional(),
});

export const BlockSchema = z.discriminatedUnion('type', [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  SceneBreakBlockSchema,
]);

export const SectionKindSchema = z.enum(['frontMatter', 'chapter', 'backMatter']);

export const SectionRoleSchema = z.enum([
  'titlePage',
  'copyright',
  'dedication',
  'epigraph',
  'contents',
  'foreword',
  'preface',
  'introduction',
  'prologue',
  'chapter',
  'epilogue',
  'afterword',
  'acknowledgments',
  'aboutAuthor',
  'alsoBy',
  'note',
  'other',
]);

export const DetectionSignalSchema = z.enum([
  'heading',
  'strongPattern',
  'weakPattern',
  'opening',
  'fallback',
  'manual',
]);

export const DetectionConfidenceSchema = z.enum(['high', 'medium', 'low']);

/** How an imported section boundary was found; drives the "review chapters" UI. */
export const DetectionProvenanceSchema = z.strictObject({
  signal: DetectionSignalSchema,
  confidence: DetectionConfidenceSchema,
});

export const SectionSchema = z.strictObject({
  id: IdSchema,
  kind: SectionKindSchema,
  role: SectionRoleSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  /** Counts toward the chapter-number sequence. Numbers are derived, never stored. */
  numbered: z.boolean(),
  startOnRecto: z.boolean(),
  blocks: z.array(BlockSchema),
  detection: DetectionProvenanceSchema.optional(),
});

export const PartSchema = z.strictObject({
  id: IdSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  /** Ordered to match `Manuscript.sections`. */
  sectionIds: z.array(IdSchema),
});

export const BookMetadataSchema = z.strictObject({
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  publicationDate: z.string().optional(),
  description: z.string().optional(),
  copyrightHolder: z.string().optional(),
});

export const ManuscriptSchema = z.strictObject({
  schemaVersion: z.literal(MANUSCRIPT_SCHEMA_VERSION),
  id: IdSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  authors: z.array(z.string()),
  /** BCP 47 language tag, e.g. "en" or "en-US". */
  language: z.string().min(2).max(35),
  metadata: BookMetadataSchema,
  /** Reading order. */
  sections: z.array(SectionSchema),
  parts: z.array(PartSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
