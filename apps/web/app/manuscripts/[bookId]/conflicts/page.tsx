import type { Metadata } from 'next';
import { ConflictsScreen } from './ConflictsScreen';

export const metadata: Metadata = { title: 'Sync conflicts · Folio Loom' };

export default async function ConflictsPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <ConflictsScreen bookId={bookId} />;
}
