import type { Metadata } from 'next';
import { EditorScreen } from './EditorScreen';

export const metadata: Metadata = { title: 'Manuscript · Folio Loom' };

export default async function ManuscriptPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  // Only the ID reaches the server; content is read from this browser's storage after sign-in.
  return <EditorScreen bookId={bookId} />;
}
