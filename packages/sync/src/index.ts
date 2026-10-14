export { compareVersions, type LocalVersion, type RemoteVersion, type SyncDecision } from './compare';
export { canonicalJson, stableHash } from './hash';
export { fitParts, mergeStructure, relativeOrderChanged, type StructureMerge, weaveOrder, withMembers } from './merge';
export {
  adoptLandedUnits,
  baseAfterCommit,
  type ConflictKind,
  emptyBase,
  isCleanAgainstBase,
  type PushPlan,
  planPush,
  type ReconcileInput,
  type ReconcileResult,
  reconcile,
  type SectionWrite,
  type SyncConflict,
  sectionConflictId,
  sectionsToFetch,
} from './reconcile';
export { CHOICES_BY_KIND, type ConflictChoice, localHashFor, type ResolutionInput, type ResolutionResult, resolveConflict } from './resolve';
export {
  assembleManuscript,
  type BookStructure,
  chunkText,
  hashSection,
  hashStructure,
  type RemoteBookView,
  type SyncBase,
  SyncIntegrityError,
  structureOf,
  type UnitVersion,
} from './units';
