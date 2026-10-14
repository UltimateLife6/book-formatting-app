# Implementation backlog

Ordered by risk to manuscript integrity first, then by user value. "M" stands for milestone.

## M0: Foundation (this branch) ✅

- [x] Workspace config and package boundaries (`apps/`, `packages/`, `services/`, `tooling/`)
- [x] Versioned canonical schema, validation, and serialization tests (`book-model`)
- [x] Chapter detection extracted and adapted (`chapter-engine`, 38 test cases). All 26 legacy regression tests have equivalents: 24 in `chapter-engine`, and the 2 that tested the legacy HTML parser are now covered by the `import-engine` DOCX tests
- [x] TXT and DOCX import with a text-preservation check on every import, plus legacy localStorage book migration (`import-engine`)
- [x] Integrity validation and provisional import limits (`validation`)
- [x] Pure edit operations, including a fix for the legacy front/back-matter reorder bug (`editor-core`)
- [x] Export allowance contracts and an idempotent admission ledger (`export-contracts`, `export-worker`)
- [x] Sync decision logic, content hashing, and persistence interfaces (`sync`)
- [x] Minimal Expo and Next shells that import the shared packages; web build and iOS bundle verified

## M1: Accounts, local persistence, sync (next)

1. Firebase projects for **dev and staging only**, using the emulator suite for tests. No production writes.
2. Auth: email link, Apple, and Google. Mandatory sign-in gate in both shells.
3. Firestore security rules (owner-only, ledger is server-write-only) with emulator tests.
4. `ManuscriptStore` implementations: `expo-sqlite` (native) and `idb` (web), sharing one contract test suite.
5. Outbox plus `compareVersions`-driven sync for the manifest and each section, with conflict UI (keep mine, keep theirs, keep both).
6. Snapshots and restore. Autosave status indicator. Save failures shown to the author.
7. Legacy migration: detect `folio-loom:book`, run `fromLegacyBook`, and confirm before saving.

## M2: Import and chapter review UX

1. Import flow on phone and web: pick a file, see progress, see the report (warnings, preservation result).
2. Chapter review screen: list with confidence badges, plus split, merge, rename, retype (front, chapter, back), and drag to reorder.
3. Server-side DOCX conversion for native (Storage upload, then worker, then manuscript).
4. Detection improvements:
   - Plain-text table of contents detection, which currently yields empty chapters.
   - "Part" headings that use roman numerals with titles.
   - Footnote import (currently a warning).
5. Image import design (currently dropped with a warning).

## M3: Editor

1. Block editor for paragraphs, headings, scene breaks, and block quotes, with inline marks (bold, italic, underline, small caps).
2. Mobile-first interactions: selection toolbar, paragraph split and merge, undo and redo.
3. Section-level editing that syncs per section. Large-manuscript performance targets: open a 210k-word book in under 1 s and type with under 16 ms per keystroke on a mid-range phone.

## M4: Formatting and templates

1. Template system (Classic, Modern, Romance, Thriller, Nonfiction) built on `FormattingSettings`.
2. Live preview that paginates per section, not over the whole book.
3. Typography: font licensing review, drop caps, scene-break ornaments, and chapter opener styles.

## M5: Export

1. EPUB 3 packaging (`nav.xhtml`, OPF 3, unique stable identifier), with EPUBCheck in CI.
2. Print PDF engine evaluation and implementation (see `export-policy.md`): trim, bleed, margins, recto starts.
3. Export worker deployment (staging), with the ledger in Firestore through transactions.
4. Download history and re-download without being charged again.

## M6: Plans and launch

1. Product approval of the free-export limit (currently provisional at 3 per month).
2. Subscriptions: RevenueCat or StoreKit and Play Billing, plus web checkout. Server-side entitlements.
3. Store builds through EAS, privacy policy and data deletion, accessibility audit.
4. Retire the legacy app, move it to `legacy/`, and switch Vercel to `apps/web`.

## Known risks

| Risk | Mitigation |
| --- | --- |
| Expo upgrades force React upgrades on the legacy app | Retire the legacy app before the next Expo SDK; until then, bump them in lockstep |
| npm drops native optional bindings (npm/cli#4828) | Bindings listed explicitly in `tooling/package.json` |
| Mammoth fidelity limits (footnotes, images, complex styles) | Warnings in the import report; server-side converter can be swapped later |
| Expo CLI build-time advisories (node-forge, braces, uuid) | Build-time only; track Expo patch releases |
| Plain-text TOC creates empty chapters | M2 detection work; review UI flags low-confidence results |
