'use client';

import type { ImportResult } from '@folio-loom/import-engine';
import { importTxt } from '@folio-loom/import-engine';
import type { UserLibrary } from '@folio-loom/local-storage';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Import DOCX (web mammoth path) or TXT into a new local manuscript, then open it.
 * Text-preservation failures are shown; the book is still saved so the author can review.
 */
export function ImportManuscriptButton({ library, disabled }: { library: UserLibrary; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportResult['report'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const lower = file.name.toLowerCase();
      let result: ImportResult;
      if (lower.endsWith('.docx')) {
        const { importDocx } = await import('@folio-loom/import-engine/docx');
        result = await importDocx(await file.arrayBuffer(), { title: file.name.replace(/\.docx$/i, '') });
      } else if (lower.endsWith('.txt') || lower.endsWith('.md') || file.type.startsWith('text/')) {
        result = importTxt(await file.text(), { title: file.name.replace(/\.(txt|md)$/i, '') });
      } else {
        throw new Error('Choose a .docx or .txt file.');
      }
      setReport(result.report);
      if (!result.report.preservation.ok) {
        const proceed = window.confirm(
          `Text preservation check failed (source ${result.report.preservation.sourceWordCount} words vs result ${result.report.preservation.resultWordCount}). Save the import anyway so you can review it?`,
        );
        if (!proceed) return;
      }
      const record = await library.create({ manuscript: result.manuscript, title: result.manuscript.title || file.name });
      router.push(`/manuscripts/${encodeURIComponent(record.bookId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-box">
      <label className={`button ${busy || disabled ? 'disabled' : ''}`}>
        {busy ? 'Importing…' : 'Import DOCX or TXT'}
        <input
          type="file"
          accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          disabled={busy || disabled}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <p className="muted" role="status">
          Imported {report.chapterCount} chapters ({report.sectionCount} sections, {report.blockCount} blocks).
          {report.needsReview ? ' Some chapters need review.' : ''}
          {report.warnings.length > 0 ? ` Warnings: ${report.warnings.map((w) => w.message).join('; ')}` : ''}
        </p>
      ) : null}
    </div>
  );
}
