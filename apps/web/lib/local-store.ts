import { LocalManuscriptStore } from '@folio-loom/local-storage';
import { createIndexedDbDriver } from '@folio-loom/local-storage/indexeddb';

let store: LocalManuscriptStore | null = null;

/**
 * The browser's IndexedDB-backed store, opened on first use. Returns `null` during server
 * rendering so no storage is touched (and no manuscript content can reach SSR HTML).
 */
export function getLocalStore(): LocalManuscriptStore | null {
  if (typeof window === 'undefined') return null;
  store ??= new LocalManuscriptStore(createIndexedDbDriver());
  return store;
}
