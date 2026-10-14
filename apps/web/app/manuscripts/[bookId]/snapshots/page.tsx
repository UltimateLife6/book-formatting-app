import type { Metadata } from 'next';
import { SnapshotsScreen } from './SnapshotsScreen';

export const metadata: Metadata = { title: 'Snapshots · Folio Loom' };

export default async function SnapshotsPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <SnapshotsScreen bookId={bookId} />;
}
