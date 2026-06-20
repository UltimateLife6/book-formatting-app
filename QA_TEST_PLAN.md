# Folio Loom — Manual QA Test Plan

Step-by-step manual test cases for beta / release validation. Pair with **[PRD_CHECKLIST.md](./PRD_CHECKLIST.md)** (feature completeness) and automated tests (`npm test`).

**Last updated:** May 2026  
**App URL (production):** https://book-formatting-app.vercel.app  
**Local:** `npm start` → http://localhost:3000

---

## Priority tiers (read first)

These three areas drive the most post-launch support risk for a book-formatting product. Run them **before every release candidate**, not only full regression.

| Tier | Sections | Why |
|------|----------|-----|
| **P0 — Blockers** | [§6 Data persistence](#6-manuscript-persistence-data) · [§11 Pagination accuracy](#11-pagination-accuracy-pag) · [§12 Large-manuscript performance](#12-large-manuscript-performance-perf) | Lost manuscripts, wrong pages, and timeouts destroy trust |
| **P1 — Major** | [§9 Export validation](#9-export-export) · [§8 Preview / spread](#8-preview-preview) · [§13 Recovery / failure](#13-recovery--failure-err) | Bad imports, weak exports, broken spread |
| **P2 — Standard** | Screen sections §2–§7 · [§16 Accessibility](#16-accessibility-smoke-a11y) · responsive / browser matrices | UX polish and coverage |

> **Persistence (May 2026):** Book state auto-saves to `localStorage` (debounced 750ms + flush on tab hide/unload). Run **DATA-01–06** to validate.

---

## How to use this document

| Column | Meaning |
|--------|---------|
| **ID** | Reference for bugs (e.g. `PREV-04`) |
| **Pass criteria** | Minimum expected behavior |
| **☐** | Check when passed on a given run |

**Test run header** (copy per session):

```text
Date:
Tester:
Environment: [ ] Local  [ ] Production  [ ] Staging
Browser / OS:
Build / commit (if known):
P0 passed: DATA __ / 6 · PAG __ / 7 · PERF __ / 5
Full run: ___ / ___ cases passed
```

**Severity if failed:** Blocker · Major · Minor · Cosmetic

---

## 0. Prerequisites

| ☐ | Step |
|---|------|
| ☐ | App loads without console errors on Home |
| ☐ | `npm test` passes (automated unit tests) |
| ☐ | Standard fixture files prepared (see table below) |
| ☐ | Optional: Google API keys in `.env.local` for Google Docs cases (see [GOOGLE_DOCS_TEST.md](./GOOGLE_DOCS_TEST.md)) |

### Test manuscript fixtures

Maintain a small library under `qa/fixtures/` (or local test folder) for repeatable runs:

| Label | Target size | Suggested contents | Used by |
|-------|-------------|-------------------|---------|
| **Small** | ~5k words | 3 chapters, simple headings | Smoke, E2E, spread edge cases |
| **Medium** | ~50k words | 10+ chapters, mixed paragraphs | Pagination, export |
| **Large novel** | ~100k words | Full novel length, many chapters | PERF-*, PAG-*, DATA-04 |
| **Very large** | ~200k+ words | Stress test (optional) | PERF-01/02 ceiling test |

**Fixture tips:** Use `.docx` and `.txt` variants; include chapters with `Chapter 1`, `CHAPTER 2`, etc., for detection tests. Record word count and file size in the test run header.

---

## 1. End-to-end smoke test (happy path)

Complete once per release on **desktop** and once on **mobile width**.

| ID | Step | Pass criteria | ☐ |
|----|------|---------------|---|
| E2E-01 | Home → start workflow | Landing shows Folio Loom; primary CTA navigates to Import or Wizard | ☐ |
| E2E-02 | Import manuscript | Paste or upload text; success message; redirects to Manuscript | ☐ |
| E2E-03 | Manuscript | At least one section visible in outline; can select and edit text | ☐ |
| E2E-04 | Format | Choose template; adjust font or margin; live sample updates | ☐ |
| E2E-05 | Preview (eBook) | eBook mode renders content; device toggle changes width | ☐ |
| E2E-06 | Preview (print) | Print mode paginates; can move to page 2+ when content is long enough | ☐ |
| E2E-07 | Export | Download at least one format (PDF, EPUB, or DOCX); file opens without error | ☐ |

**Notes:**

---

## 2. Home (`/`)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| HOME-01 | Branding | Header and page show **Folio Loom** | ☐ |
| HOME-02 | Hero CTAs | Buttons navigate to Wizard, Import, or downstream routes | ☐ |
| HOME-03 | Workflow section | Import → Style → Chapters → Preview → Export described | ☐ |
| HOME-04 | Mobile layout | No horizontal scroll; readable typography | ☐ |
| HOME-05 | Header nav | Manuscript, Style, Preview links work from header (desktop) | ☐ |

---

## 3. Wizard (`/wizard`)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| WIZ-01 | Step 1 validation | Empty title/author blocks Next with error | ☐ |
| WIZ-02 | Step 2 genre | Genre required before Next | ☐ |
| WIZ-03 | Step 3 optional | Can skip ISBN/description and continue | ☐ |
| WIZ-04 | Step 4 review | Summary matches entered data | ☐ |
| WIZ-05 | Complete | Final action saves book metadata and goes to Import | ☐ |
| WIZ-06 | Back navigation | Back returns to previous step without losing data | ☐ |

---

## 4. Import (`/import`)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| IMP-01 | Paste text | Multi-paragraph paste imports; redirects to Manuscript | ☐ |
| IMP-02 | Empty paste | Shows error; does not navigate | ☐ |
| IMP-03 | DOCX upload | Valid `.docx` imports; title from filename | ☐ |
| IMP-04 | TXT upload | Plain text file imports correctly | ☐ |
| IMP-05 | Oversized file | File over limit rejected with clear message | ☐ |
| IMP-06 | Unsupported type | Bad extension rejected | ☐ |
| IMP-07 | Chapter detection | Multi-chapter paste splits into sections in Manuscript outline | ☐ |
| IMP-08 | Processing UI | Progress indicator during import; no frozen UI | ☐ |
| IMP-09 | Google Docs | With keys: picker opens, doc imports *(skip if not configured)* | ☐ |
| IMP-10 | Mobile | Upload and paste usable on narrow screen | ☐ |

**Known limitation:** Import page may enforce **10MB** while config allows 50MB — note if testing large files.

---

## 5. Manuscript (`/manuscript`)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| MS-01 | Outline load | Imported chapters appear in structure tree | ☐ |
| MS-02 | Select section | Clicking outline loads editor on the right (desktop) | ☐ |
| MS-03 | Edit + save | Change title/body; Save persists after re-select | ☐ |
| MS-04 | Add chapter | New chapter appears in outline and is editable | ☐ |
| MS-05 | Add front/back matter | Can add non-chapter section types | ☐ |
| MS-06 | Reorder | Drag handle reorders sections; order persists | ☐ |
| MS-07 | Delete | Remove section; outline updates | ☐ |
| MS-08 | Preview shortcut | Preview button navigates to Preview (saves open section first) | ☐ |
| MS-09 | Trim size panel | Collapsible print trim settings open/close | ☐ |
| MS-10 | Mobile | Outline OR editor visible; can switch between them | ☐ |

---

## 6. Manuscript persistence (DATA) — **P0**

Persistence failures are catastrophic for authors. These cases define **release-ready** behavior.

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| DATA-01 | Auto-save | Edit manuscript, wait; reload page; changes persist | ☐ |
| DATA-02 | Route changes | Edit manuscript → navigate to Format/Preview → return; changes preserved | ☐ |
| DATA-03 | Browser refresh | Hard refresh on Manuscript; full book state restored | ☐ |
| DATA-04 | Large manuscript | 100k+ word manuscript saves without truncation or corruption | ☐ |
| DATA-05 | Multiple edits | Rapid edits across several chapters; no lost paragraphs or reorder glitches | ☐ |
| DATA-06 | Formatting persistence | Template, fonts, margins, trim size remain after refresh | ☐ |

**Verification tips:** After reload, spot-check first/middle/last chapter text, chapter order, and Format settings. Compare character/word counts before and after.

---

## 7. Chapters (`/chapters`)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| CH-01 | Auto-detect | With content in book, suggests chapters from headings | ☐ |
| CH-02 | Split by sections | Blank-line split creates multiple chapters | ☐ |
| CH-03 | Add / edit dialog | Manual chapter add and edit save correctly | ☐ |
| CH-04 | Reorder | Up/down changes order in list | ☐ |
| CH-05 | Save all | Save all writes to manuscript state | ☐ |
| CH-06 | Empty state | Clear messaging when no chapters | ☐ |
| CH-07 | Preview navigation | Continue to Preview works when chapters exist | ☐ |

---

## 8. Format / Style (`/format`)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| FMT-01 | Template select | Each template applies preset formatting | ☐ |
| FMT-02 | Font / size | Changes reflect in live sample | ☐ |
| FMT-03 | Margins | Margin sliders/inputs update sample | ☐ |
| FMT-04 | Trim size | Print trim selection updates page dimensions | ☐ |
| FMT-05 | Chapter heading controls | Title/number/subtitle style changes visible in sample | ☐ |
| FMT-06 | Persistence | Navigate away and back; settings retained in session | ☐ |
| FMT-07 | Mobile | Controls wrap; sample still readable | ☐ |

---

## 9. Preview (`/preview`)

### 9.1 eBook mode

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PREV-01 | Mode toggle | Switch eBook ↔ Print without crash | ☐ |
| PREV-02 | Device sizes | Mobile / tablet / desktop widths change preview frame | ☐ |
| PREV-03 | Scroll | Long eBook content scrolls inside preview | ☐ |
| PREV-04 | Formatting controls | Template/font changes reflow eBook preview | ☐ |

### 9.2 Print mode — single page

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PREV-05 | Pagination | Long manuscript produces multiple pages | ☐ |
| PREV-06 | Title page | If title/author set, page 1 is title page | ☐ |
| PREV-07 | Page numbers | Footer page numbers match body pages | ☐ |
| PREV-08 | Prev/next | Single-page nav moves through all pages | ☐ |
| PREV-09 | Margins / trim | Page respects configured margins and trim size | ☐ |
| PREV-10 | Progress | Multi-chapter pagination shows progress; UI stays responsive | ☐ |
| PREV-11 | Chapter breaks | Chapter headings/titles render with correct styles | ☐ |

### 9.3 Print mode — two-page spread

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PREV-12 | Toggle visible | “Two-page spread” only in **Print** mode on wide screen | ☐ |
| PREV-13 | Page 1 placement | First spread: **blank left**, page 1 (title) on **right** | ☐ |
| PREV-14 | Pairs | Pages 2–3, 4–5 appear side-by-side | ☐ |
| PREV-15 | Odd last page | Final odd page alone on left with blank right (if applicable) | ☐ |
| PREV-16 | Spread nav | Prev/next moves by spread; label shows spread + page range | ☐ |
| PREV-17 | Gutter | Visible center gutter/shadow between pages | ☐ |
| PREV-18 | Mobile fallback | On narrow screen: spread disabled or falls back to single page | ☐ |

### 9.4 Spread edge cases (regression)

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PREV-19 | 1 page total | Only title or one body page; spread still usable or gracefully single | ☐ |
| PREV-20 | 2 pages | Spread `[null,1]` then `[2,null]` | ☐ |
| PREV-21 | 3 pages | Spread `[null,1]` then `[2,3]` | ☐ |
| PREV-22 | Many pages | Can navigate all spreads without blank content errors | ☐ |

### 9.5 Spread + formatting interaction

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PREV-23 | Mode switching | Toggle single page ↔ spread repeatedly; no blank pages or wrong index | ☐ |
| PREV-24 | Trim in spread | Change trim size while spread enabled; both pages resize; gutter intact | ☐ |
| PREV-25 | Font in spread | Change font size in Preview controls; spread repaginates; no overlap/clipping | ☐ |
| PREV-26 | Final spread | Jump to last spread directly; correct pages shown; nav disabled at end | ☐ |
| PREV-27 | Export after spread | View in spread mode → Export PDF/EPUB; output unaffected by UI layout mode | ☐ |

---

## 10. Export (`/export`)

### 10.1 Basic export

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| EXP-01 | EPUB | Download `.epub`; opens in reader or validates as ZIP/epub | ☐ |
| EXP-02 | PDF | Download PDF; pages readable, not blank | ☐ |
| EXP-03 | DOCX | Download Word file; opens in Word/Pages | ☐ |
| EXP-04 | Empty content | Export blocked or warned when no manuscript | ☐ |
| EXP-05 | Progress | Loading state during export; no double-click duplicate | ☐ |
| EXP-06 | Metadata | Title/author appear in exported metadata where applicable | ☐ |
| EXP-07 | After preview | Export reflects latest Manuscript edits without refresh hack | ☐ |

### 10.2 Export accuracy validation — **P1**

Go beyond “file opens” — compare export to preview and source manuscript.

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| EXP-08 | PDF page count | Exported PDF page count matches print preview page count (± title page rules) | ☐ |
| EXP-09 | PDF headings | PDF contains chapter titles/headings from manuscript | ☐ |
| EXP-10 | EPUB navigation | EPUB TOC/chapter navigation matches manuscript structure | ☐ |
| EXP-11 | DOCX structure | DOCX preserves chapter breaks and heading hierarchy | ☐ |
| EXP-12 | Metadata match | Title, author (and ISBN if set) match book metadata in all formats | ☐ |

---

## 11. Pagination accuracy (PAG) — **P0**

Core product quality — wrong pagination generates the most author frustration.

Use **Medium** or **Large novel** fixture. Manually spot-check 3+ chapter boundaries and 2+ page boundaries mid-chapter.

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PAG-01 | Chapter new page | New chapter starts on a fresh page when configured / expected | ☐ |
| PAG-02 | Sequential numbers | Body page numbers increase by 1 with no skips or duplicates | ☐ |
| PAG-03 | No duplication | No paragraph appears in full on two consecutive pages | ☐ |
| PAG-04 | No missing text | No paragraphs dropped between page N and N+1 | ☐ |
| PAG-05 | Last paragraph intact | Final paragraph of each chapter not truncated mid-sentence | ☐ |
| PAG-06 | Front matter numbering | Front matter handled correctly vs body numbering (document actual behavior) | ☐ |
| PAG-07 | Trim re-pagination | Change trim size → page count updates; content reflows without PAG-03/04 failures | ☐ |

**Spot-check method:** Pick a known paragraph near a page break; confirm it appears exactly once across the break in preview (and PDF if EXP-08 passed).

---

## 12. Large-manuscript performance (PERF) — **P0**

Most production bugs surface at realistic book length. Record **time to complete** and **browser tab memory** (Task Manager) in notes.

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| PERF-01 | Import 100k DOCX | Import completes without crash; Manuscript outline populated | ☐ |
| PERF-02 | Print preview 100k | Pagination completes; UI remains responsive; progress shown | ☐ |
| PERF-03 | Deep page nav | Navigate from page 1 to last page (e.g. ~500) without hang | ☐ |
| PERF-04 | PDF export large | PDF export completes for large novel fixture | ☐ |
| PERF-05 | EPUB export large | EPUB export completes for large novel fixture | ☐ |

**Acceptance guidelines (adjust as product matures):**

| Step | Target (100k words, modern desktop) |
|------|-------------------------------------|
| Import | < 60s |
| Initial pagination | < 120s with idle UI |
| Page/spread navigation | < 2s per step |
| PDF export | < 180s |

---

## 13. Recovery / failure (ERR) — **P1**

Users will hit bad files and network blips.

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| ERR-01 | Corrupted DOCX | Upload invalid/corrupt `.docx`; friendly error, no crash | ☐ |
| ERR-02 | Empty DOCX | Empty or whitespace-only file; clear message, no silent success | ☐ |
| ERR-03 | Import interrupted | Cancel/navigate away mid-import; loading state clears; can retry | ☐ |
| ERR-04 | Export failure | Simulate failure (e.g. very large export, devtools offline); clear message + retry path | ☐ |
| ERR-05 | Browser offline | Go offline mid-session; graceful message on export/import, no white screen | ☐ |

---

## 14. Header & global

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| GLB-01 | Logo home | Folio Loom chip returns to Home | ☐ |
| GLB-02 | Routing | Direct URL to each route loads correct screen | ☐ |
| GLB-03 | In-session state | Navigate Manuscript → Preview → back without losing edits in same session | ☐ |
| GLB-04 | Error boundary | Forced render error shows fallback UI, not white screen | ☐ |
| GLB-05 | Auth modal | Login/register UI opens *(placeholder OK)* | ☐ |

---

## 15. Responsive matrix

Run **smoke subset** (E2E-01–07) at each width.

| Width | Target | Home | Import | Manuscript | Preview | Export | ☐ |
|-------|--------|------|--------|------------|---------|--------|---|
| ~375px | Mobile | | | | | | ☐ |
| ~768px | Tablet | | | | | | ☐ |
| ~1280px | Desktop | | | | | | ☐ |

---

## 16. Browser smoke (optional)

| Browser | Version | E2E smoke pass | ☐ |
|---------|---------|----------------|---|
| Chrome | | | ☐ |
| Safari | | | ☐ |
| Firefox | | | ☐ |
| Edge | | | ☐ |
| iOS Safari | | | ☐ |

---

## 17. Accessibility smoke (A11Y)

Formal WCAG audit is out of scope here; these catch obvious barriers.

| ID | Case | Pass criteria | ☐ |
|----|------|---------------|---|
| A11Y-01 | Keyboard navigation | Tab through Import → Manuscript → Preview controls without traps | ☐ |
| A11Y-02 | Focus visible | Focus ring visible on buttons, toggles, and nav | ☐ |
| A11Y-03 | Form labels | Import/Wizard/Editor fields have accessible names | ☐ |
| A11Y-04 | Contrast | Body text and primary buttons readable on cream background | ☐ |
| A11Y-05 | Preview controls | Print prev/next and spread toggle operable via keyboard | ☐ |

---

## 18. Regression watchlist

Re-test after changes to pagination, import, export, or persistence.

| ☐ | Area | Cases | Why |
|---|------|-------|-----|
| ☐ | Print pagination | PAG-01–07, PREV-05–11 | Measurement DOM drift |
| ☐ | Spread grouping | PREV-12–27 | Page index / spread pairing |
| ☐ | Chapter detection | IMP-07, EXP-10–11 | Import → structure |
| ☐ | Export generators | EXP-08–12, PERF-04–05 | Generator changes |
| ☐ | Persistence | DATA-01–06 | Storage layer changes |
| ☐ | Trim size change | PAG-07, PREV-24 | Reflow + warning |

---

## 19. Automated tests (CI companion)

Not a substitute for manual QA, but run before each test session:

```bash
npm test -- --watchAll=false
npm run type-check
npm run lint
CI=true npm run build
```

| ☐ | Command | Pass |
|---|---------|------|
| ☐ | `npm test` | |
| ☐ | `npm run type-check` | |
| ☐ | `npm run lint` | |
| ☐ | `CI=true npm run build` | |

---

## 20. Bug log template

| ID | Date | Case ID | Severity | Summary | Steps | Expected | Actual | Status |
|----|------|---------|----------|---------|-------|----------|--------|--------|
| | | | | | | | | Open |

---

## 21. Release approval gates

**Do not mark a release approved until P0 suites are run and gates below are satisfied.**

### Defect status

| ☐ | Gate |
|---|------|
| ☐ | All **blocker** defects resolved |
| ☐ | No **major** defects open (or explicitly waived with sign-off) |

### Required test passes

| ☐ | Gate |
|---|------|
| ☐ | E2E smoke passed on **desktop** (§1) |
| ☐ | E2E smoke passed on **mobile** width (§1) |
| ☐ | **DATA** persistence suite run — results documented (§6) |
| ☐ | **PAG** pagination accuracy passed on medium+ fixture (§11) |
| ☐ | **PERF** large-manuscript test passed (§12) |
| ☐ | **PDF** export passed — EXP-02 + EXP-08/09 (§10) |
| ☐ | **EPUB** export passed — EXP-01 + EXP-10 (§10) |
| ☐ | **DOCX** export passed — EXP-03 + EXP-11 (§10) |
| ☐ | Pagination + spread regression passed (§9.4–9.5, §18) |

### Sign-off

```text
Release approved by: ___________________________
Date: ___________________________
Version / commit: ___________________________
Known waivers: ___________________________
```

---

## Related docs

- [PRD_CHECKLIST.md](./PRD_CHECKLIST.md) — feature completeness vs PRD
- [PRD.md](./PRD.md) — product spec
- [MARKET_READINESS.md](./MARKET_READINESS.md) — launch ops checklist
- [GOOGLE_DOCS_TEST.md](./GOOGLE_DOCS_TEST.md) — Google import only
- [Fixes/pagination-fix.md](./Fixes/pagination-fix.md) — pagination regression notes

---

## Changelog

| Date | Change |
|------|--------|
| May 2026 | Initial manual QA test plan |
| May 2026 | Added P0 persistence, pagination, performance, export accuracy, failure recovery, a11y, release gates |
