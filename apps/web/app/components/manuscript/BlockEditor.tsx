'use client';

import type { Block, InlineMark } from '@folio-loom/book-model';
import { htmlToRuns, runsToHtml } from '@folio-loom/editor-core';
import { useEffect, useRef } from 'react';

/**
 * One paragraph or heading as a contenteditable surface. Marks are serialized to
 * <strong>/<em> HTML and parsed back into runs on input. Soft line breaks are <br> ↔ \n.
 */
export function BlockEditor({
  block,
  sectionId,
  onCommit,
  onEnter,
  onBackspaceAtStart,
  onSelect,
  pendingMarks,
}: {
  block: Extract<Block, { type: 'paragraph' | 'heading' }>;
  sectionId: string;
  onCommit: (runs: ReturnType<typeof htmlToRuns>, options?: { coalesce?: boolean }) => void;
  onEnter: (offset: number) => void;
  onBackspaceAtStart: () => void;
  onSelect: (start: number, end: number) => void;
  pendingMarks: readonly InlineMark[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const lastHtml = useRef('');

  useEffect(() => {
    const el = ref.current;
    if (!el || composing.current) return;
    const html = runsToHtml(block.runs);
    if (html !== lastHtml.current && document.activeElement !== el) {
      el.innerHTML = html;
      lastHtml.current = html;
    }
  }, [block.runs]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.innerHTML) {
      el.innerHTML = runsToHtml(block.runs);
      lastHtml.current = el.innerHTML;
    }
  }, [block.runs]);

  function caretOffset(): number {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    return range.toString().length;
  }

  function selectionOffsets(): { start: number; end: number } {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const pre = sel.getRangeAt(0).cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    const start = pre.toString().length;
    const end = start + sel.toString().length;
    return { start, end };
  }

  return (
    // contenteditable is the web adapter for run-based editing; a native <textarea> cannot carry marks.
    // biome-ignore lint/a11y/useSemanticElements: contenteditable surface for rich text
    // biome-ignore lint/a11y/useFocusableInteractive: contentEditable provides focus
    <div
      ref={ref}
      className={block.type === 'heading' ? `block-editor heading-h${block.level}` : 'block-editor paragraph'}
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      role="textbox"
      aria-multiline="true"
      aria-label={block.type === 'heading' ? `Heading level ${block.level}` : 'Paragraph'}
      data-block-id={block.id}
      data-section-id={sectionId}
      spellCheck
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        const html = (event.currentTarget as HTMLDivElement).innerHTML;
        lastHtml.current = html;
        onCommit(htmlToRuns(html), { coalesce: true });
      }}
      onInput={(event) => {
        if (composing.current) return;
        const html = (event.currentTarget as HTMLDivElement).innerHTML;
        lastHtml.current = html;
        let runs = htmlToRuns(html);
        // Apply pending marks to a fresh empty insert at caret when the block was empty.
        if (pendingMarks.length > 0 && runs.length === 1 && !runs[0]?.marks?.length) {
          runs = [{ text: runs[0]?.text ?? '', marks: [...pendingMarks] }];
        }
        onCommit(runs, { coalesce: true });
      }}
      onSelect={() => {
        const { start, end } = selectionOffsets();
        onSelect(start, end);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onEnter(caretOffset());
          return;
        }
        if (event.key === 'Backspace') {
          const { start, end } = selectionOffsets();
          if (start === 0 && end === 0) {
            event.preventDefault();
            onBackspaceAtStart();
          }
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
    />
  );
}

export function SceneBreakView({ marker }: { marker?: string }) {
  return (
    <p className="scene-break">
      <span className="sr-only">Scene break</span>
      {marker ?? '* * *'}
    </p>
  );
}
