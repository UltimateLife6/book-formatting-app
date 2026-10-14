import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { StorageDriver } from '../driver';
import { createIndexedDbDriver } from '../indexeddb';
import { createSqliteDriver } from '../sqlite';
import { nodeSqliteConnection } from './nodeSqlite';

export interface TestBackend {
  name: 'sqlite' | 'indexeddb';
  makeDriver(): StorageDriver;
}

export const fakeIndexedDb = () => new IDBFactory() as unknown as globalThis.IDBFactory;
export const fakeKeyRange = IDBKeyRange as unknown as typeof globalThis.IDBKeyRange;

export const TEST_BACKENDS: TestBackend[] = [
  { name: 'sqlite', makeDriver: () => createSqliteDriver(async () => nodeSqliteConnection(':memory:')) },
  { name: 'indexeddb', makeDriver: () => createIndexedDbDriver({ indexedDB: fakeIndexedDb(), keyRange: fakeKeyRange }) },
];
