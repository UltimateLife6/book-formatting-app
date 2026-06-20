# PRD Implementation Checklist — Folio Loom

Living tracker for [PRD.md](./PRD.md). Update this file when features ship or scope changes.

**Last reviewed:** May 2026  
**Overall progress:** ~**65–70%** of full PRD · ~**85%** of core author workflow

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done — meets PRD intent in production code |
| 🟡 | Partial — implemented but incomplete vs PRD |
| ❌ | Not started |
| 🔮 | Phase 2+ (future per PRD §8) |

---

## Summary by layer

| Layer | Progress | Notes |
|-------|----------|-------|
| Core product (import → export) | **~85%** | Full workflow live on Vercel |
| Functional spec (PRD §3) | **~75%** | Missing drag-drop, zoom, batch export, some UI chrome |
| Non-functional / launch ops (PRD §4–7, §6) | **~40%** | Monitoring, CI, legal, test coverage |
| Phase 2 / 3 (PRD §8) | **0%** | Intentionally future |
| Measurable success metrics (PRD §1.3) | **0%** | No analytics wired yet |

---

## 1. Executive summary & success metrics

| Item | Status | Notes |
|------|--------|-------|
| Product vision (indie author formatting) | ✅ | Positioning reflected in Home, Import–Export copy |
| 1,000+ active users / 6 months | ❌ | No analytics |
| 15% visitor → completed format | ❌ | No funnel tracking |
| 4.5+ star rating | ❌ | No review integration |
| <3s page load | 🟡 | Deployed; no Lighthouse budget in CI |
| 99.9% uptime | 🟡 | Vercel hosting only; no uptime monitor |

---

## 2. Product overview

| Item | Status | Notes |
|------|--------|-------|
| Target audience (indie authors) | ✅ | Copy and UX aligned |
| Ease of use | ✅ | Wizard + step intros |
| Professional quality output | 🟡 | PDF/EPUB/DOCX work; print pagination is strong |
| Multiple export formats | ✅ | PDF, EPUB, DOCX |
| Cost effective / free tier | 🟡 | App is free; **no premium tier or billing** |
| Modern responsive UI | ✅ | MUI, mobile-friendly |
| Real-time preview | ✅ | eBook + print + spread view |
| Template library | ✅ | 6 templates (PRD asks 5+) |
| Error handling | ✅ | ErrorContext, validation, ErrorBoundary |

---

## 3. Functional requirements

### 3.1.1 File import

| Item | Status | Notes |
|------|--------|-------|
| DOCX import | ✅ | mammoth |
| TXT import | ✅ | |
| RTF import | 🟡 | Basic text read; limited RTF parsing |
| 50MB file limit | 🟡 | `appConfig` = 50MB; Import page hardcodes **10MB** |
| Drag & drop upload | ❌ | Button / hidden input only |
| Paste text | ✅ | |
| Google Docs integration | 🟡 | Picker + service exist; requires `REACT_APP_GOOGLE_*` keys |
| Chapter detection on import | ✅ | **Beyond PRD** — `chapterDetection.ts` |

### 3.1.2 Formatting engine

| Item | Status | Notes |
|------|--------|-------|
| Font management (15+ fonts) | 🟡 | ~8–10 in Format/Preview |
| Typography (size, line height, spacing) | ✅ | |
| Margin settings | ✅ | Including print trim / gutter |
| Template system (5+ layouts) | ✅ | classic, romance, fantasy, nonfiction, poetry, academic |
| Real-time preview | ✅ | Format live sample + Preview page |
| Chapter heading / title / subtitle styles | ✅ | **Beyond PRD** |
| Manuscript structure (parts, front/back matter) | ✅ | **Beyond PRD** — Manuscript + ChapterTree |

### 3.1.3 Export system

| Item | Status | Notes |
|------|--------|-------|
| PDF export | ✅ | html2pdf |
| EPUB generation | ✅ | Custom JSZip implementation |
| DOCX export | ✅ | **Beyond PRD minimum** |
| Print optimization (trim, margins) | ✅ | TrimSizeSelector, pagination |
| Batch export (all formats at once) | ❌ | One format per action |
| Custom filenames | 🟡 | Uses book title; limited user override |

### 3.1.4 Preview system

| Item | Status | Notes |
|------|--------|-------|
| Device simulation (mobile/tablet/desktop) | ✅ | eBook mode |
| eBook vs print modes | ✅ | |
| Responsive layout testing | ✅ | |
| Zoom controls | ❌ | |
| Export preview / verification | 🟡 | Preview page serves this role; no separate export preview |
| Two-page book spread | ✅ | **Beyond PRD** — print mode, May 2026 |
| Lazy print pagination + chapter cache | ✅ | **Beyond PRD** |

### 3.2 User interface

| Item | Status | Notes |
|------|--------|-------|
| Header (logo, nav, actions) | ✅ | Folio Loom branding |
| Sidebar (quick format options) | ❌ | Controls on each page instead |
| Breadcrumbs | 🟡 | Step overlines on main pages, not full breadcrumb trail |
| Site footer (links, company) | ❌ | |
| Glassmorphism blue/gray theme | 🟡 | **Spec drift** — warm editorial cream/serif (Folio Loom) |
| Inter + editorial serif pairing | ✅ | Inter + Cormorant Garamond |
| MUI component system | ✅ | |
| Animations / polish | 🟡 | Card hovers, transitions; not full glassmorphism |

### 3.2.3 Responsive & accessibility

| Item | Status | Notes |
|------|--------|-------|
| Mobile-first layouts | ✅ | |
| Breakpoints (375 / 768 / 1024 / 1440) | 🟡 | MUI defaults; not explicitly validated at each |
| Touch-friendly targets | 🟡 | Generally good; not audited |
| WCAG 2.1 AA | 🟡 | Some aria labels; **no formal audit** |

---

## 4. User journey (PRD §5.1)

| Step | Route / screen | Status |
|------|----------------|--------|
| Landing | `/` Home | ✅ |
| Optional setup | `/wizard` | ✅ **Beyond PRD** |
| Import | `/import` | ✅ |
| Manuscript edit | `/manuscript` | ✅ **Beyond PRD** |
| Chapter organize | `/chapters` | ✅ **Beyond PRD** |
| Format / style | `/format` | ✅ |
| Preview | `/preview` | ✅ |
| Export | `/export` | ✅ |

---

## 5. Technical requirements (PRD §4)

| Item | Status | Notes |
|------|--------|-------|
| React + TypeScript | ✅ | React 19 |
| Material-UI v7 | ✅ | |
| React Context (BookContext) | ✅ | |
| React Router | ✅ | |
| Create React App | ✅ | |
| Vercel + GitHub deploy | ✅ | `book-formatting-app.vercel.app` |
| Bundle <1MB gzipped | ✅ | ~680KB (still large for CRA) |
| Lighthouse 90+ | ❌ | Not tracked in repo |
| Code splitting / lazy routes | ❌ | |
| Input validation / file security | 🟡 | Type + size checks; Import limit mismatch |
| CSP / CSRF | 🟡 | Static SPA; no backend CSRF surface documented |
| Browser support matrix tested | 🟡 | Assumed; no automated matrix |

---

## 6. Error handling & UX (PRD §5.2)

| Item | Status | Notes |
|------|--------|-------|
| User-friendly error messages | ✅ | ErrorContext + utils |
| Recovery suggestions | 🟡 | Some alerts; not exhaustive |
| Progress indicators | ✅ | Import/export/pagination progress |
| Real-time validation | 🟡 | Wizard + forms; not everywhere |
| Error boundaries | ✅ | `ErrorBoundary.tsx` (console only, no Sentry) |

---

## 7. Quality assurance (PRD §6)

| Item | Status | Notes |
|------|--------|-------|
| Manual QA test plan | ✅ | **[QA_TEST_PLAN.md](./QA_TEST_PLAN.md)** — P0: DATA, PAG, PERF; release gates in §21 |
| Manuscript persistence (localStorage / reload) | 🟡 | **`src/lib/storage/bookStorage.ts`** — auto-save; run DATA-01–06 in QA plan |
| Unit tests (Jest) | 🟡 | 4 files: validation, chapterDetection, previewSpreads, App smoke |
| 80% code coverage | ❌ | |
| Integration tests | ❌ | |
| E2E (Cypress) | ❌ | |
| ESLint | 🟡 | Runs; warnings remain |
| TypeScript strict | 🟡 | `tsc --noEmit` passes |
| Prettier / Husky pre-commit | ❌ | |
| axe / a11y automation | ❌ | |

---

## 8. Deployment & infrastructure (PRD §7)

| Item | Status | Notes |
|------|--------|-------|
| Vercel production hosting | ✅ | |
| HTTPS | ✅ | |
| GitHub source control | ✅ | |
| Auto deploy on push | 🟡 | Vercel CLI / git; **no GitHub Actions workflow** |
| Staging environment | ❌ | |
| Custom domain | 🟡 | vercel.app alias; no custom domain in repo |
| Sentry error tracking | ❌ | Env stub in `appConfig` only |
| Google Analytics | ❌ | Env flag only |
| Uptime monitoring | ❌ | |

---

## 9. Legal & market readiness

See also [MARKET_READINESS.md](./MARKET_READINESS.md).

| Item | Status | Notes |
|------|--------|-------|
| Privacy policy | ❌ | |
| Terms of service | ❌ | |
| Cookie / GDPR consent | ❌ | |
| Authentication (real accounts) | ❌ | Placeholder AuthModal only |

---

## 10. Launch criteria (PRD §9.1) — honest status

| Criterion | PRD box | Actual |
|-----------|---------|--------|
| Core features implemented and tested | [x] | 🟡 Core path yes; test depth thin |
| Performance benchmarks met | [x] | 🟡 Not measured in CI |
| Security requirements satisfied | [x] | 🟡 Client-side only; partial |
| Accessibility compliance achieved | [x] | 🟡 Not verified to WCAG AA |
| Cross-browser compatibility verified | [x] | 🟡 Manual assumption |
| Production deployment successful | [x] | ✅ |

**Recommendation:** Treat launch as **soft launch / beta** until §7–9 monitoring, legal, and QA items progress.

---

## 11. Phase 2 & 3 (PRD §8) — future

| Item | Status |
|------|--------|
| AI-powered formatting | 🔮 |
| Collaborative editing | 🔮 |
| Template marketplace | 🔮 |
| Print-on-demand integration | 🔮 |
| Native mobile apps | 🔮 |
| Public API | 🔮 |
| White-label / enterprise | 🔮 |

---

## 12. Recommended next priorities

Ordered for closing the gap between **~85% product** and **market-ready ~100%**:

1. **Validate persistence (P0 QA)** — run DATA-01–06 in [QA_TEST_PLAN.md §6](./QA_TEST_PLAN.md#6-manuscript-persistence-data--p0)
2. **Wire Sentry + GA4** (config already exists)
3. **Add GitHub Actions CI** (lint, type-check, test, build)
4. **Privacy policy + Terms** pages and footer links
5. **Align Import file size** with 50MB config
6. **Drag-and-drop import** on Import page
7. **PRD spec sync** — update PRD branding/UI section to Folio Loom editorial direction
8. **Run P0 QA** — DATA, PAG, PERF per [QA_TEST_PLAN.md](./QA_TEST_PLAN.md) before release sign-off
9. **Accessibility pass** on Preview spread controls and main forms

---

## Changelog

| Date | Change |
|------|--------|
| May 2026 | Initial checklist from PRD vs codebase review |
| May 2026 | Marked two-page print spread ✅ |
| May 2026 | Added [QA_TEST_PLAN.md](./QA_TEST_PLAN.md) manual test cases |
| May 2026 | QA plan: DATA, PAG, PERF, ERR, export accuracy, a11y, release gates |
| May 2026 | Manuscript persistence via `bookStorage` + debounced auto-save |

**Maintainers:** Update status symbols when merging features. Link PRs in changelog when helpful.
