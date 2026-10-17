# Manuscript editor design (M2)

## Goals

- Edit the canonical `@folio-loom/book-model` manuscript on iOS, Android, and web.
- Never invent a second document model.
- Prefer well-defined operations over ad hoc JSON mutation in UI code.
- Keep typing responsive on long books by editing one section at a time and sharing structure immutably.
- Integrate with M1-B autosave and M1-C section-level sync without replacing them.

## Framework selection

| Layer | Choice | Why |
| --- | --- | --- |
| Shared ops | `@folio-loom/editor-core` (pure TypeScript) | Platform-free; unit-testable; same ops feed web and mobile |
| Web UI | Per-block `contenteditable` + `runsToHtml` / `htmlToRuns` | Native browser selection, IME, and keyboard shortcuts; serializes only bold/italic into the schema |
| Mobile UI | Per-block React Native `TextInput` + selection offsets | RN has no reliable contenteditable; marks apply to `selectionStart`/`selectionEnd` through run ops |

We deliberately **do not** embed TipTap/ProseMirror/Slate as the source of truth. Those trees would compete with the canonical schema and complicate sync. Platform editors are adapters that call editor-core.

## Shared editing operations

Immutable functions in `@folio-loom/editor-core`:

- **Structure:** `moveSection`, `updateSection`, `assignSectionToPart`, `updateBlock`, `insertBlockAfter`, `removeBlock`
- **Sections:** `addSection`, `deleteSection`, `duplicateSection`, `splitSectionAtBlock`, `mergeWithPreviousSection`, `renameSection`, `setSectionKind`, `nudgeSection`, `updateManuscriptMeta`
- **Blocks / text:** `insertTextAt`, `deleteSelection`, `splitBlockAt`, `mergeWithPreviousBlock`, `toggleMark`, `insertSceneBreakAfter`, `insertParagraphAfter`, `insertHeadingAfter`, `pastePlainText`
- **Runs:** `splitRunsAt`, `insertTextIntoRuns`, `deleteRangeFromRuns`, `toggleMarkInRuns`, `marksAtOffset`, `rangeHasMark`
- **History:** `EditHistory` (undo/redo stacks of manuscript snapshots, with typing coalesce)

Destructive section deletes are confirmed in the UI; immediate **Undo** restores the previous snapshot from `EditHistory`.

## Selection and cursor model

```text
TextPoint  = { sectionId, blockId, offset }   // UTF-16 code units into block plain text
TextRange  = { anchor: TextPoint, focus: TextPoint }
```

Offsets match `String.length` / DOM selection / RN `selection` so emoji and other surrogate pairs stay consistent. Cross-block ranges are rejected for mark/delete/paste in M2 (the UI keeps selections inside one block). Empty ranges use **pending marks** for the next insert (toolbar bold/italic with no selection).

## Rich-text serialization

- Canonical form: `TextRun[]` with optional `marks: ('bold' \| 'italic' \| …)[]`.
- Web display: `runsToHtml` → `<strong>` / `<em>` / `<br>`; `htmlToRuns` flattens unknown tags to text and keeps only bold/italic.
- Paste on web: plain text only (`text/plain`), so foreign HTML styles cannot strip or replace existing marks unexpectedly.
- Mobile: the `TextInput` shows plain text; marks live in the run model and are toggled via the toolbar against the native selection.

Editing one paragraph never rewrites runs in other blocks: section updates use structural sharing (`edited.sections[i] === original.sections[i]` when untouched).

## Undo / redo

- Before each edit, `EditHistory.push` stores the prior manuscript (and selection).
- Typing uses `coalesce: true` so a burst of characters within ~900 ms shares one undo step.
- Mark toggles and structure changes push discrete steps (`coalesce: false`).
- Undo/redo call `autosave.update` with the restored manuscript so the outbox and local revision stay consistent. Sync still sees normal section-level diffs.

## Autosave and sync

- UI → `EditHistory` + `createManuscriptAutosave` → `UserLibrary.save` (M1-B).
- Open books call `SyncEngine.setEditing(bookId, true)` so cloud pulls wait until close (M1-C).
- “Saved” only appears after the local transaction resolves (existing autosave contract).
- Reorders, merges, and deletes are ordinary manuscript revisions; the sync engine uploads structure and changed sections via compare-and-set.

## Import integration

- Web: file input → `importTxt` or dynamic `@folio-loom/import-engine/docx` → `library.create({ manuscript })`.
- Mobile: `expo-document-picker` → same. DOCX may fail to bundle mammoth on some RN builds; the UI then tells the author to import on web or use TXT.
- Preservation failures are shown; the author can still save for review. Imports never overwrite an existing `bookId` (create always uses the manuscript’s new id).

## Mobile keyboard behavior

- `KeyboardAvoidingView` on iOS; toolbar stays above the scroll view.
- Multiline `TextInput`s use soft `\n` inside a paragraph (scene breaks are explicit blocks).
- Backspace on an empty paragraph merges with the previous block via `deleteSelection`.
- Foreground → background flushes autosave (`AppState`).

## Performance

Measured on the ~210k-word fixture (see `packages/editor-core/src/large-edit.test.ts`):

- `insertTextAt` into one paragraph: typically well under 100 ms (structural sharing; other sections retain object identity).
- `moveSection`: typically well under 50 ms.

UI mounts **only the active section’s blocks**. Full-manuscript JSON serialization still runs on each autosave (M1-B storage shape); that cost is documented under Known limitations—not redesigned in M2.

## Known limitations

- Underline, small caps, and other schema marks are stored on import but the M2 toolbar only toggles **bold** and **italic**.
- Cross-block / cross-section selection is not supported for formatting.
- Web contenteditable can briefly diverge from React state during IME composition; commits happen on `compositionend`.
- Mobile DOCX depends on Metro resolving mammoth; TXT is the reliable on-device path.
- No native simulator/device verification in this milestone: typing, selection, keyboard, and SQLite on hardware remain unverified.
- Full-book autosave serialization of very large manuscripts can still hitch on low-end phones; per-section local storage is future work (was noted under M1-C follow-ups / M3 backlog).

## Device testing requirements (before calling native “done”)

1. iOS Simulator and Android Emulator: type in a long chapter, toggle bold/italic on a selection, rotate, background the app mid-edit, kill and restore.
2. Physical keyboard and software keyboard: IME (e.g. Japanese / Chinese), emoji, undo.
3. Import a multi-chapter DOCX on web; sync to a device; confirm marks and scene breaks.
4. Measure `expo-sqlite` save times for the 210k-word book after a chapter edit.
