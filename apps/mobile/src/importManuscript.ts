import type { ImportResult } from '@folio-loom/import-engine';
import { importTxt } from '@folio-loom/import-engine';
import type { UserLibrary } from '@folio-loom/local-storage';
import * as DocumentPicker from 'expo-document-picker';

/**
 * Pick a .txt or .docx from the device. TXT is imported on-device. DOCX uses the
 * mammoth path when the runtime can load it (may be unavailable on some RN builds);
 * failures surface a clear error so the author can import on web instead.
 */
export async function pickAndImportManuscript(library: UserLibrary): Promise<{ bookId: string; report: ImportResult['report'] }> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) throw new Error('Import cancelled.');
  const asset = picked.assets[0];
  const name = asset.name ?? 'import';
  const lower = name.toLowerCase();

  let result: ImportResult;
  if (lower.endsWith('.txt') || lower.endsWith('.md') || asset.mimeType?.startsWith('text/')) {
    const response = await fetch(asset.uri);
    result = importTxt(await response.text(), { title: name.replace(/\.(txt|md)$/i, '') });
  } else if (lower.endsWith('.docx') || asset.mimeType?.includes('wordprocessingml')) {
    try {
      const { importDocx } = await import('@folio-loom/import-engine/docx');
      const response = await fetch(asset.uri);
      result = await importDocx(await response.arrayBuffer(), { title: name.replace(/\.docx$/i, '') });
    } catch (e) {
      throw new Error(
        `DOCX import isn’t available in this build (${e instanceof Error ? e.message : String(e)}). Import the file on the web app, or use a .txt export.`,
      );
    }
  } else {
    throw new Error('Choose a .docx or .txt file.');
  }

  const record = await library.create({ manuscript: result.manuscript, title: result.manuscript.title || name });
  return { bookId: record.bookId, report: result.report };
}
