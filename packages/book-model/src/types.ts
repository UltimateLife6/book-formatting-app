import type { z } from 'zod';
import type {
  BlockSchema,
  BookMetadataSchema,
  DetectionConfidenceSchema,
  DetectionProvenanceSchema,
  DetectionSignalSchema,
  HeadingBlockSchema,
  InlineMarkSchema,
  ManuscriptSchema,
  ParagraphBlockSchema,
  PartSchema,
  SceneBreakBlockSchema,
  SectionKindSchema,
  SectionRoleSchema,
  SectionSchema,
  TextRunSchema,
} from './schema';

export type InlineMark = z.infer<typeof InlineMarkSchema>;
export type TextRun = z.infer<typeof TextRunSchema>;
export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type SceneBreakBlock = z.infer<typeof SceneBreakBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type SectionKind = z.infer<typeof SectionKindSchema>;
export type SectionRole = z.infer<typeof SectionRoleSchema>;
export type DetectionSignal = z.infer<typeof DetectionSignalSchema>;
export type DetectionConfidence = z.infer<typeof DetectionConfidenceSchema>;
export type DetectionProvenance = z.infer<typeof DetectionProvenanceSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Part = z.infer<typeof PartSchema>;
export type BookMetadata = z.infer<typeof BookMetadataSchema>;
export type Manuscript = z.infer<typeof ManuscriptSchema>;
