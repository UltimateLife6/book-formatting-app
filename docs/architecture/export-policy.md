# Export policy and pipeline

## Allowance (provisional)

| Plan | Exports |
| --- | --- |
| Free | **3 per calendar month (UTC)**. Provisional until product explicitly approves it (`PROVISIONAL_EXPORT_POLICY.provisional = true`) |
| Pro | Unlimited |

- One EPUB or one PDF counts as one export.
- Failed and refunded exports don't count.
- Re-downloading an artifact that was already produced doesn't count.

## Enforcement is server-side only

The client can show the remaining count, but only `services/export-worker` decides.

1. The client creates a `requestId` (UUID) per export intent and reuses it on every retry.
2. The worker calls `admitExportRequest(ledger, request, {plan, now})`. In Firestore this is a single transaction that:
   - Returns the existing ledger entry if `requestId` is already recorded. The result is a `duplicate` and **nothing is counted again**.
   - Otherwise counts the user's `reserved` and `succeeded` entries for the period. If `evaluateExportAllowance` allows it, the transaction writes a `reserved` entry; if not, it rejects with `free_limit_reached`.
3. When rendering finishes, the entry is set to `succeeded`. On failure it becomes `failed`, which is free.
4. Only server credentials can write ledger documents (`users/{uid}/exportLedger/{requestId}`). Security rules deny client writes.
5. The user's plan comes from the server-side entitlement record, not from client claims. Subscriptions are out of scope for this milestone.

Covered by `services/export-worker/src/admission.test.ts`:
- Retries are idempotent.
- The 4th free export in a month is rejected, and a new month resets the count.
- Failed exports are refunded.
- Pro is unlimited.
- Users don't share allowances.

## Formats

**EPUB 3** (`packages/export-epub`, server-side packaging next):
- Content documents are XHTML5 with `epub:type`, and all text goes through `escapeXml`, which also strips characters XML forbids.
- The package needs `nav.xhtml`, `dcterms:modified`, a unique `urn:uuid` per book (stable across re-exports), and an NCX for older readers.
- Fonts are embedded only when their licences allow it.
- Every artifact must pass **EPUBCheck** in CI before release.

**Print PDF** (decision: render on the server, never on the device):
- Vector text with embedded, subset fonts. Page size equals the trim size (plus 0.125" bleed per side when bleed is enabled).
- Inside and outside margins never fall below printer minimums (`formatting/defaultPrintMargins`).
- Chapters can start on recto, with blank versos inserted. Running heads and folios are suppressed on chapter openers.
- Widow and orphan control.
- Candidate engines, to evaluate in the next milestone: Paged.js on headless Chromium, Typst, or WeasyPrint. Selection criteria are hyphenation quality, widow and orphan control, PDF/X support, and render time on the 210k-word fixture.

## Reproducibility

Each export records the manuscript `revision` and the formatting settings hash. Two exports of the same revision with the same settings must produce identical content.
