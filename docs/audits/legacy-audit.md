# Legacy audit: Folio Loom 1.x (CRA web app)

Audited on branch `rebuild/folio-loom-2-mobile`, starting from commit `c75af0d`. That commit is `origin/main` (`e9a05fd`) plus the DOCX Heading 1 chapter-detection work that had not yet been committed. Every claim below was checked against the code at that commit. Line numbers refer to that tree.

## 1. Baseline health (before any 2.0 changes)

| Check | Result |
| --- | --- |
| `CI=true npm test` | 5 suites / 62 tests pass |
| `npm run type-check` (TS 4.9.5) | exit 0 |
| `npm run lint` (ESLint 8, react-app) | 0 errors, 4 warnings: `appConfig.ts:71` unused `isProduction`, `validation.test.ts:19` no-script-url, and two `react-hooks/exhaustive-deps` in `performance.ts` |
| `npm run build` | succeeds; main bundle is about 683 kB gzipped, with a CRA size warning |
| `npm audit --omit=dev` | 116 advisories (7 critical, 85 high, 19 moderate, 5 low), mostly through `react-scripts` 5 |

After the 2.0 workspace was added, the legacy test, type-check, and build results are unchanged, and lint shows the same 4 warnings. React went from 19.1.1 to 19.2.3 because Expo SDK 57 requires that exact version. The legacy bundle grew by 1.87 kB.

## 2. Ratings

Ratings: **Reuse** means take as is. **Adapt** means port the logic and change its shape. **Rewrite** means keep the goal and replace the code. **Remove** means drop it.

| Area / file | Rating | Evidence |
| --- | --- | --- |
| `src/utils/chapterDetection.ts` (455 lines) | **Adapt (done)** | The most valuable legacy logic. It already uses DOCX Heading 1, strong whole-line patterns, and context-checked weak `1.` / `One` heuristics, and it has 26 regression tests. It has no provenance or confidence, no parts, and no roman numerals, and it returns string bodies. Ported to `packages/chapter-engine` with all 26 tests. |
| `src/pages/Import.tsx` (380) | **Adapt** | The DOCX path calls Mammoth `convertToHtml` and walks the HTML. It works, but inline formatting is lost when bodies become strings, and it enforces a 10 MB limit (`Import.tsx:59`) while `appConfig.ts:53` says 50 MB. Replaced by `packages/import-engine`, which reads Mammoth's document tree directly. |
| `src/context/BookContext.tsx` (621) | **Rewrite** | `BookData` holds three overlapping copies of the text: a legacy `content` string, `chapters[]`, and `manuscript{frontMatter,parts,chapters,backMatter}`. `Chapter.body` is a plain string, and `chapterNumber` is stored, so it can go stale. **Bug:** `REORDER_CHAPTERS` (`:507-525`) rebuilds only `manuscript.chapters` from `type === 'chapter'`, so moving front or back matter silently does nothing and those sections stay where they were. `TRIM_SIZE_PRESETS` (`:155`) are reused. |
| `src/lib/storage/bookStorage.ts` (177) | **Rewrite** | The whole book is one JSON value under a single localStorage key (`folio-loom:book`, `:6`). That caps at roughly 5 MB per origin, offers no history, and doesn't exist on native. It does have a version field and reports quota errors. |
| `src/hooks/usePersistedBook.ts` | **Adapt (concepts)** | 750 ms debounce plus flush on `beforeunload` / `visibilitychange` is the right idea, but the result of `saveBook(...)` is discarded (`:17`), so quota or serialization failures are invisible to the author. |
| `src/utils/epubGenerator.ts` (313) | **Rewrite** | Produces EPUB **2.0** (`version="2.0"`, `:231`) with no `nav.xhtml` and no `dcterms:modified`. Every book shares one hard-coded identifier, `urn:uuid:12345678-…` (`:236`, `:280`). The title, author, and description go into the OPF unescaped (`<dc:title>${epubContent.title}`, `:233`), so `&` or `<` in a title produces an invalid EPUB. `formatChapterContent` puts `<style>`/`<body>` inside the chapter body (`:140`), which is invalid XHTML. Headings are numbered twice ("1. Chapter 1"). |
| `src/pages/Export.tsx` (422) | **Rewrite** | The PDF is `html2pdf` over `state.book.content`, the legacy raw string rather than the structured chapters, and that string is inserted with `innerHTML` (`:135-140`). Page size is fixed to `format: 'letter'` (`:150`), ignoring the chosen trim. html2canvas rasterizes pages to JPEG, so the output is not print-ready (no vector text, embedded fonts, or bleed). Export waits on a fake 2-second delay (`:112`). There is no export accounting. DOCX export is offered, which 2.0 doesn't require. |
| `src/pagination/runTokenPagination.ts` (445) | **Remove** | DOM measurement with binary search in batches of 30 per `requestAnimationFrame`. It only works in a browser, gets slower as the manuscript grows, and can't run on native or a server. Print pagination moves to a server-side engine. |
| `src/pages/Preview.tsx` (1904) | **Rewrite** | A monolith. It splits paragraphs on every single `\n` (`:821`) and falls back to `state.book.content` (`:315`). |
| `src/pages/Format.tsx` (929) | **Rewrite** | Settings UI coupled to the legacy state. It lists "Scene breaks" as a feature, but scene breaks are not implemented anywhere in the code. |
| `src/components/ChapterEditor.tsx` (320) | **Rewrite** | A plain MUI multiline `TextField`, with no inline formatting. |
| `src/components/ChapterTree.tsx` (522) | **Adapt (UX)** | The dnd-kit tree is a usable reference for interaction, but it's web-only. |
| `src/components/Header.tsx` (221) | **Remove** | Fake auth. `handleLogin` runs `console.log('Login:', email, password)` (`:31`), printing the plaintext password to the console, then sets `isLoggedIn`. The Google and Apple buttons are placeholders. |
| `src/utils/validation.ts` (294) | **Adapt (parts)** | ISBN checks are reusable. The author regex `^[a-zA-Z\s\-']+$` (`:152`) **rejects non-ASCII names** (José, Zoë, 李). `sanitizeText` strips tags with a regex. |
| `src/utils/security.ts` (265) | **Remove** | Escapes HTML through a DOM element (`innerHTML`, `:8`). It's browser-only and duplicates what a structured model makes unnecessary. |
| `src/utils/googleDocsService.ts`, `GoogleDocsPicker.tsx` | **Remove (for now)** | Google Docs import is not in the 2.0 scope. `googleapis` (a Node SDK) is a client dependency. |
| `src/utils/docxGenerator.ts` | **Remove** | DOCX export is out of scope. |
| `package.json` | **Rewrite** | `epub-gen` is installed but unused. `react-scripts` and the `@types/*` packages sit in `dependencies`. |

## 3. Focus areas

**DOCX headings and formatting.** Heading 1 detection works in the legacy importer since `c75af0d`: `small-manuscript.docx` gives 5 chapters. Italic, bold, and other marks are dropped when chapter bodies become plain strings. The new `importDocx` keeps bold, italic, underline, strikethrough, small caps, superscript, and subscript. It also keeps soft line breaks, center/right alignment, and deeper headings (as `heading` blocks), and it flattens tables into paragraphs with a warning.

**Detection accuracy.** The legacy precedence is sound: Word headings first, then strong patterns, then weak heuristics. The weak heuristics are guarded by blank-line and "next line is not another marker" checks, and the false-positive tests cover lists, outlines, and prose like "chapter 4 was my favorite". Gaps that are now fixed:
- No roman numerals ("Chapter IV").
- No part detection.
- "Chapter summary" could match through the loose word branch.
- Titles that weren't recognized defaulted to *unnumbered*.
- No confidence information to drive a review UI.

Open risk: a plain-text table of contents ("Chapter 1 … Chapter 2 …") still produces empty chapters. That is tracked in the backlog.

**Paragraphs and scene breaks.** Legacy splits on every newline, so wrapped TXT lines become separate paragraphs. There is no scene-break handling at all, so `* * *` lines are stored as body text. The new import engine detects blank-line-separated paragraphs (single newlines become soft breaks) and recognizes scene-break lines (`***`, `* * *`, `#`, `~~~`, `---`, `•••`, `⁂`, `§`), keeping the original marker.

**Data structures.** See BookContext above. The new model is a versioned schema: sections contain blocks, blocks contain text runs, every entity has a stable ID, chapter numbers are derived from order, and front/back matter is explicit (`docs/architecture/book-schema.md`).

**EPUB validity and escaping.** The output is EPUB 2, not EPUB 3, and fails validation: there's no nav document, every book has the same identifier, and both the OPF and chapter XHTML are malformed. Unescaped metadata can break the XML entirely.

**PDF pagination.** The PDF is rasterized at letter size from the legacy string, so it is not print-ready. The decision for 2.0 is server-side rendering (`docs/architecture/export-policy.md`).

**Autosave and recovery.** A single localStorage key, failures ignored, no snapshots, no recovery UI, and no cloud copy. One quota error or one bad write can lose the book.

**Large-manuscript performance.** DOM pagination and a 1904-line Preview re-render the whole book. In the new packages, the fixtures import fast (measured in `vitest`):

| Fixture | TXT import | DOCX import (Mammoth parse plus raw-text verification) |
| --- | --- | --- |
| Small, about 5k words | 15 ms | about 200 ms |
| Very large, about 210k words, 70 chapters | 133 ms | about 3.9 s |

**Security and dependencies.**
- Plaintext password logging (`Header.tsx:31`).
- Unescaped `innerHTML` in Export.
- `googleapis` in the client bundle.
- 116 production advisories, mostly from the CRA toolchain.
- Mammoth before 1.11.0 has a directory-traversal advisory (GHSA-rmjr-87wv-gf87). The workspace now resolves `mammoth@1.13.0`; the import engine requires `^1.11.0`, which still satisfies the legacy app's `^1.10.0` range.
- Expo SDK 57's CLI and build tooling pull in advisories (node-forge, braces, uuid) that only affect build time. npm's suggested "fix" is a downgrade to SDK 44, which is not viable. Watch for Expo patch releases.

## 4. What 2.0 reuses vs rewrites

- **Reused (ported with tests):**
  - Chapter-detection rules and their 26 regression tests (`packages/chapter-engine`).
  - Trim-size presets (`packages/formatting`).
  - Debounce and flush-on-hide autosave concepts (`packages/sync` interfaces).
- **Adapted:**
  - The DOCX import approach: still Mammoth, but reading its document tree rather than HTML.
  - Legacy book conversion: `fromLegacyBook` migrates saved localStorage books into the new model.
- **Rewritten:** data model, persistence, EPUB, PDF, editor, preview, auth, and validation of names.
- **Removed (in 2.0):** DOM pagination, fake auth, Google Docs, DOCX export, and `security.ts` HTML helpers.

The legacy app stays in place, deployable from `main`, until 2.0 reaches feature parity.
