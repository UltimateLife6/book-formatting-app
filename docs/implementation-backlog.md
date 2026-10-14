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

## M1: Accounts, local persistence, sync (in progress)

### M1-A: Emulator authentication and owner-only security ✅

- [x] Emulator-only Firebase config (`firebase.json`, `demo-folio-loom`). App code rejects non-`demo-*` projects and non-emulator modes
- [x] `@folio-loom/auth` contract, safe errors, credential validation, route gate, and a Firebase adapter shared by web and native
- [x] Email/password sign-up, sign-in, and sign-out, auth-state loading, and session restoration in the Next and Expo shells. Private routes are gated
- [x] Firestore rules: owner-only, immutable `ownerId`, field allow-lists, revision rules, server-only entitlements/ledger/exports, default deny
- [x] Storage rules: owner-scoped imports and snapshots, content type and size limits, immutable files, server-only exports, default deny
- [x] Emulator suites for rules, real-token sessions (signed out and deleted), the auth flows, and React Native persistence

### M1-B: Offline manuscript storage ✅

- [x] `@folio-loom/local-storage`: a platform-independent store with create, load, list (current account only), save, local revisions, restore, delete with a single-use confirmation token, dirty/unsynced tracking, and status and error reporting. It uses the `book-model` schema with stable book IDs and owner UIDs
- [x] SQLite driver (`expo-sqlite` ~57.0.4 on native): WAL with `synchronous=FULL`, transactional compare-and-set writes, `user_version` migrations in transactions, owner/book indexes, and no destructive fallback
- [x] IndexedDB driver (web): browser-only open (never during SSR), `durability: 'strict'` transactions, owner keys and indexes, versioned upgrades, and handling for unavailable, blocked, closed, and quota errors
- [x] Autosave: debounced, one write at a time and revision-checked; flushes on hide/background/close/sign-out. Statuses are Saved / Saving / Unsaved changes / Save failed, and a failed save keeps the content and offers Retry
- [x] Recovery: corrupt, missing, or checksum-failed content is surfaced, never dropped; restoring an older revision quarantines the damaged copy; future schema or database versions are refused
- [x] Account isolation, with tests: libraries are bound to the UID, account changes unmount the editor, queued saves can't cross accounts, and sign-out deletes nothing. Threat model documented: scoping is not encryption
- [x] Minimal web and mobile UI: list, create blank, open, edit title and first paragraph, save status, close and reopen, sign out and back in, delete with confirmation
- [x] Tests: shared contract suite on both backends, SQLite and IndexedDB specifics (migrations, interrupted transactions, quota, corrupt records, reopen after crash), autosave sequencing, and the 210k-word fixture with timings (`system-design.md`)
- [x] Web flow verified in a real browser against the Auth emulator: create, autosave, reload, close and reopen, sign out and back in, and a second account can neither list nor open the first account's book

Not verified in M1-B: `expo-sqlite` on an iOS simulator, an Android emulator, or a phone (none available). The iOS and Android bundles were built, but that does not prove the native code works.

### M1-C: Cloud sync (next)

1. Run the Expo app on an iOS simulator and an Android emulator (or a device). Confirm SQLite create/save/reopen, background flush, and auth restoration, and measure `expo-sqlite` save/load times with the 210k-word fixture.
2. Outbox driven by `listUnsynced()` and `markSynced()`, using `compareVersions` for the manifest and each section. Writes go through the M1-A revision rules.
3. Conflict UI: keep mine, keep theirs, keep both. This also resolves the current two-tab `stale_revision` failure.
4. Per-section storage and sync (today each save writes the whole manuscript).
5. Staging Firebase project (dedicated, non-production) and a reviewed `staging` mode in `resolveFirebaseConfig`. Rules deploy only after the emulator suite passes.

### M1-D: Legacy migration

1. Detect `folio-loom:book` in `localStorage`, run `fromLegacyBook`, show a preview, and save to local storage only after the author confirms. Keep the legacy data until the new copy is verified.

### Other remaining M1 work

1. More sign-in methods: Apple and Google (and possibly email link). Password reset and email verification flows.
2. Server-side account deletion (Firestore and Storage cleanup), and token revocation if needed. Decide what happens to local books when an account is deleted.
3. Encryption at rest for local manuscripts (SQLCipher or a Keychain/Keystore-held key), if required.

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
| Edits in the last ~800 ms can be lost if the tab is closed or the app is killed | Flush on hide, background, and close; `beforeunload` prompt; documented in `system-design.md` |
| Local manuscripts are plaintext on the device | Documented threat model; encryption at rest is in the backlog |
