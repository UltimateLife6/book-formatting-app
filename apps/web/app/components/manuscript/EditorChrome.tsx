'use client';

import { chapterNumbers, type Manuscript, type Section, sectionToPlainText } from '@folio-loom/book-model';
import type { InlineMark } from '@folio-loom/book-model';
import type { SyncStatusKind } from '@folio-loom/cloud-sync';
import { SYNC_STATUS_LABEL } from '@folio-loom/cloud-sync';
import { SAVE_STATUS_LABEL } from '@folio-loom/local-storage';

export function SectionNav({
  manuscript,
  activeSectionId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
  onDuplicate,
  onRename,
  onSetKind,
  open,
  onToggle,
}: {
  manuscript: Manuscript;
  activeSectionId: string;
  onSelect: (id: string) => void;
  onAdd: (kind: Section['kind']) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSetKind: (id: string, kind: Section['kind']) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const numbers = chapterNumbers(manuscript);
  return (
    <>
      <button type="button" className="secondary nav-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? 'Hide chapters' : 'Chapters'}
      </button>
      <aside className={`section-nav ${open ? 'open' : ''}`} aria-label="Chapters and sections">
        <h2>Contents</h2>
        <ul>
          {manuscript.sections.map((section, index) => {
            const number = numbers.get(section.id);
            const label = number !== undefined ? `${number}. ${section.title || 'Untitled'}` : section.title || section.kind;
            return (
              <li key={section.id} className={section.id === activeSectionId ? 'active' : ''}>
                <button type="button" className="nav-item" onClick={() => onSelect(section.id)}>
                  <span className="nav-kind">{section.kind === 'chapter' ? 'Ch' : section.kind === 'frontMatter' ? 'Front' : 'Back'}</span>
                  <span className="nav-title">{label}</span>
                  <span className="muted-line">{sectionToPlainText(section).split(/\s+/).filter(Boolean).length} w</span>
                </button>
                {section.id === activeSectionId ? (
                  <div className="nav-actions">
                    <input
                      aria-label="Section title"
                      value={section.title}
                      onChange={(e) => onRename(section.id, e.target.value)}
                    />
                    <select
                      aria-label="Section type"
                      value={section.kind}
                      onChange={(e) => onSetKind(section.id, e.target.value as Section['kind'])}
                    >
                      <option value="frontMatter">Front matter</option>
                      <option value="chapter">Chapter</option>
                      <option value="backMatter">Back matter</option>
                    </select>
                    <button type="button" className="secondary" onClick={() => onMove(section.id, -1)} disabled={index === 0}>
                      Up
                    </button>
                    <button type="button" className="secondary" onClick={() => onMove(section.id, 1)} disabled={index === manuscript.sections.length - 1}>
                      Down
                    </button>
                    <button type="button" className="secondary" onClick={() => onDuplicate(section.id)}>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="secondary danger"
                      onClick={() => {
                        if (window.confirm(`Delete “${section.title || 'this section'}”? You can Undo immediately after.`)) onDelete(section.id);
                      }}
                      disabled={manuscript.sections.length <= 1}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="nav-add">
          <button type="button" className="secondary" onClick={() => onAdd('frontMatter')}>
            + Front matter
          </button>
          <button type="button" onClick={() => onAdd('chapter')}>
            + Chapter
          </button>
          <button type="button" className="secondary" onClick={() => onAdd('backMatter')}>
            + Back matter
          </button>
        </div>
      </aside>
    </>
  );
}

export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggleMark,
  activeMarks,
  onSceneBreak,
  onSplitSection,
  onMergeSection,
  saveLabel,
  syncKind,
  wordCount,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMark: (mark: InlineMark) => void;
  activeMarks: readonly InlineMark[];
  onSceneBreak: () => void;
  onSplitSection: () => void;
  onMergeSection: () => void;
  saveLabel: string;
  syncKind: SyncStatusKind | undefined;
  wordCount: number;
}) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" className="secondary" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
        Undo
      </button>
      <button type="button" className="secondary" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (⌘⇧Z)">
        Redo
      </button>
      <span className="toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className={activeMarks.includes('bold') ? 'mark-on' : 'secondary'}
        onClick={() => onToggleMark('bold')}
        aria-pressed={activeMarks.includes('bold')}
        title="Bold (⌘B)"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={activeMarks.includes('italic') ? 'mark-on' : 'secondary'}
        onClick={() => onToggleMark('italic')}
        aria-pressed={activeMarks.includes('italic')}
        title="Italic (⌘I)"
      >
        <em>I</em>
      </button>
      <button type="button" className="secondary" onClick={onSceneBreak} title="Insert scene break">
        Scene break
      </button>
      <button type="button" className="secondary" onClick={onSplitSection} title="Split chapter at this paragraph">
        Split chapter
      </button>
      <button type="button" className="secondary" onClick={onMergeSection} title="Merge with previous chapter">
        Merge up
      </button>
      <span className="toolbar-status">
        <span aria-live="polite">{wordCount.toLocaleString()} words</span>
        <span>· {saveLabel}</span>
        {syncKind ? <span>· {SYNC_STATUS_LABEL[syncKind]}</span> : null}
      </span>
    </div>
  );
}

export { SAVE_STATUS_LABEL };
