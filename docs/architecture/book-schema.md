# Canonical manuscript schema (v1)

Source of truth: `packages/book-model/src/schema.ts`. Types are derived from it with `z.infer`, so the documentation and the code cannot drift apart.

## Shape

```text
Manuscript
├─ schemaVersion: 1
├─ id, title, subtitle?, authors[], language (BCP 47)
├─ metadata { isbn?, publisher?, publicationDate?, description?, copyrightHolder? }
├─ sections: Section[]          ← reading order
│   ├─ id, kind: frontMatter | chapter | backMatter
│   ├─ role: titlePage | copyright | dedication | epigraph | contents | foreword | preface |
│   │        introduction | prologue | chapter | epilogue | afterword | acknowledgments |
│   │        aboutAuthor | alsoBy | note | other
│   ├─ title, subtitle?, numbered, startOnRecto
│   ├─ detection? { signal: heading | strongPattern | weakPattern | opening | fallback | manual,
│   │               confidence: high | medium | low }
│   └─ blocks: Block[]
│       ├─ paragraph  { id, runs[], variant?: body | blockQuote | verse, align?: start | center | end | justify }
│       ├─ heading    { id, level: 2 | 3 | 4, runs[] }      (h1 is the section title)
│       └─ sceneBreak { id, marker? }                        (original "* * *" kept)
├─ parts: Part[] { id, title, subtitle?, sectionIds[] }      ← grouping, ordered like sections
└─ createdAt, updatedAt (ISO 8601)

TextRun { text, marks?: (bold | italic | underline | strikethrough | smallCaps | superscript | subscript)[] }
```

## Rules

1. **There is no HTML anywhere.** Inline formatting lives in `marks`. Soft line breaks are `\n` inside a run's text.
2. **Chapter numbers are never stored.** `chapterNumbers(manuscript)` derives them from the order of sections where `kind === 'chapter' && numbered`. Reordering can't leave stale numbers behind.
3. **IDs are stable.** IDs are created once with a prefix (`bk_`, `sec_`, `blk_`, `prt_`) and preserved through edits. Editing a block keeps its ID, which is what lets sync merge per section.
4. **Parts group sections; they don't contain them.** Section order is always `manuscript.sections`. `part.sectionIds` must reference existing sections, stay in reading order, and give each section at most one part. `validateManuscriptIntegrity` enforces all three.
5. **Front and back matter are explicit.** They are expressed through `kind` and `role`, never inferred from position at render time.
6. **Detection provenance.** Imports record how each boundary was found. Any section with confidence other than `high` triggers the "review chapters" UI. An author edit sets `signal: 'manual'`.
7. **Runs are normalized.** `normalizeRuns` merges adjacent runs that have the same marks, puts marks in a canonical order, and drops empty runs.

## Versioning and migrations

- `MANUSCRIPT_SCHEMA_VERSION = 1`. Bump it for **any** change to the persisted shape, including new optional fields.
- All objects are `z.strictObject`. A client that sees an unknown field rejects the document instead of stripping the field and saving the loss back to the cloud.
- `parseManuscript` handles versions in three ways:
  - Documents with a **newer** version are refused (`unsupported_version`) and left unmodified. The app prompts the author to update.
  - **Older** documents go through the `migrations[n]` registry, one version at a time. Migrations must be pure and lossless.
  - `serializeManuscript` validates before writing and throws `ManuscriptValidationError`, so an invalid in-memory model is never persisted.

## Persistence mapping

The schema is the logical model. Storage splits it so that no single document holds a whole novel. Full protocol: `sync-design.md`.

```text
Firestore (sync format 1):
  users/{uid}/manuscripts/{manuscriptId}                         ← head: revision, structureRevision,
                                                                   structure (JSON: title, subtitle, authors,
                                                                   language, metadata, createdAt, parts, order),
                                                                   sectionIndex {sectionId: [revision, hash, chunks]},
                                                                   title, wordCount, contentHash, deleted, recentOps
  …/sections/{sectionId}                                         ← one section (JSON), revision, contentHash,
                                                                   chunkCount, deleted (tombstone); chunk 0 inline
  …/sections/{sectionId}/chunks/{n}                              ← further 200k-character chunks of a large section
  …/snapshots/{snapshotId} + …/snapshots/{snapshotId}/chunks/{n} ← full serialized manuscript, written in one batch
SQLite / IndexedDB (local schema v2):
  books + manuscripts (whole manuscript per revision), revisions, quarantine,
  sync_state (per-book sync base and conflicts), outbox (queued ops), preserved (recovered copies)
```

- **Unit of sync:** the book structure (everything except section content) and each section are versioned and hashed separately (`hashStructure`, `hashSection` in `@folio-loom/sync`). A one-section edit writes the head and that one section.
- **Section order** is `structure.order` (section IDs). Assembling a manuscript from the cloud requires the order, the parts and the section index to agree exactly; a mismatch is treated as damaged data and the local copy is left untouched.
- **Schema versions:** the head and sections carry `schemaVersion`. A device that sees a newer version than it understands refuses to merge (`unsupported_version`) and keeps its local copy; the rules forbid lowering `schemaVersion` on a head.

Firestore caps a document at 1 MiB, and the head is kept under 900 KB. A 210k-word novel is about 1.4 MB as JSON, so the whole book cannot fit in one document. A single chapter is typically 20–60 KB.

## Verified properties (tests)

- **`book-model/model.test.ts`:**
  - Front and back matter, inline marks, scene breaks, and subheadings all validate.
  - A manuscript round-trips through JSON unchanged.
  - Unknown fields, unknown block types, and newer versions are rejected.
- **`import-engine/*.test.ts`:**
  - All four fixtures (5–70 chapters, up to 210k words) convert with zero words lost and round-trip through serialization.
  - For DOCX, the check runs against Mammoth's independent raw-text extraction.
