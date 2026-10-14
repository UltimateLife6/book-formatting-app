import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulators, PROJECT_ID, readRules } from './env';

type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

let env: RulesTestEnvironment;
let alice: Db;
let bob: Db;
let anon: Db;

const NOW = '2026-10-14T00:00:00.000Z';
const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();
const manuscript = (ownerId: string, revision = 1, extra: Record<string, unknown> = {}) => ({
  ownerId,
  syncFormat: 1,
  schemaVersion: 1,
  title: 'The Book',
  revision,
  structureRevision: 1,
  structure: '{"order":["s1"]}',
  sectionIndex: '{"s1":[1,"def456",1]}',
  wordCount: 0,
  contentHash: 'abc123',
  deleted: false,
  lastOpId: 'op-1',
  recentOps: ['op-1'],
  createdAt: NOW,
  updatedAt: serverTime(),
  ...extra,
});
const section = (ownerId: string, manuscriptId = 'm1', revision = 1, extra: Record<string, unknown> = {}) => ({
  ownerId,
  manuscriptId,
  sectionId: 's1',
  revision,
  commitRevision: 1,
  contentHash: 'def456',
  deleted: false,
  chunkCount: 1,
  content: '{"id":"s1","title":"Chapter 1","kind":"chapter","blocks":[]}',
  updatedAt: serverTime(),
  ...extra,
});
const snapshot = (ownerId: string, manuscriptId = 'm1') => ({
  ownerId,
  manuscriptId,
  reason: 'beforeImport',
  schemaVersion: 1,
  storagePath: `users/${ownerId}/manuscripts/${manuscriptId}/snapshots/snap.json`,
  sizeBytes: 120,
  createdAt: serverTime(),
});
/** A commit: head revision +1 with server time. */
const bump = (revision: number, extra: Record<string, unknown> = {}) => ({ revision, updatedAt: serverTime(), ...extra });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readRules('firestore.rules'), ...emulators.firestore },
  });
  alice = env.authenticatedContext('alice').firestore();
  bob = env.authenticatedContext('bob').firestore();
  anon = env.unauthenticatedContext().firestore();
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('users/bob').set({ ownerId: 'bob', displayName: 'Bob', createdAt: NOW, updatedAt: NOW });
    await db.doc('users/bob/manuscripts/m1').set(manuscript('bob'));
    await db.doc('users/bob/manuscripts/m1/sections/s1').set(section('bob'));
    await db.doc('users/bob/manuscripts/m1/snapshots/snap1').set(snapshot('bob'));
    await db.doc('users/bob/entitlements/current').set({ plan: 'free', status: 'active' });
    await db.doc('users/bob/exportLedger/r1').set({ count: 1, period: '2026-10' });
    await db.doc('users/bob/exports/e1').set({ status: 'ready', storagePath: 'users/bob/exports/e1/book.epub' });
    await db.doc('billing/bob').set({ customerId: 'cus_1' });
    await db.doc('admin/config').set({ flag: true });
  });
});

describe('unauthenticated access', () => {
  it('cannot read profiles, manuscripts, sections, snapshots or entitlements', async () => {
    await assertFails(anon.doc('users/bob').get());
    await assertFails(anon.doc('users/bob/manuscripts/m1').get());
    await assertFails(anon.collection('users/bob/manuscripts').get());
    await assertFails(anon.doc('users/bob/manuscripts/m1/sections/s1').get());
    await assertFails(anon.doc('users/bob/manuscripts/m1/snapshots/snap1').get());
    await assertFails(anon.doc('users/bob/entitlements/current').get());
  });

  it('cannot write anything', async () => {
    await assertFails(anon.doc('users/bob/manuscripts/m2').set(manuscript('bob')));
    await assertFails(anon.doc('users/bob/manuscripts/m1').delete());
    await assertFails(anon.doc('users/anon').set({ ownerId: 'anon' }));
  });
});

describe('cross-user access (alice → bob)', () => {
  it('cannot read or list', async () => {
    await assertFails(alice.doc('users/bob').get());
    await assertFails(alice.doc('users/bob/manuscripts/m1').get());
    await assertFails(alice.collection('users/bob/manuscripts').get());
    await assertFails(alice.collection('users/bob/manuscripts/m1/sections').get());
    await assertFails(alice.doc('users/bob/manuscripts/m1/snapshots/snap1').get());
    await assertFails(alice.collection('users/bob/exports').get());
    await assertFails(alice.doc('users/bob/entitlements/current').get());
  });

  it('cannot query across accounts with collection-group queries', async () => {
    await assertFails(alice.collectionGroup('manuscripts').get());
    await assertFails(alice.collectionGroup('manuscripts').where('ownerId', '==', 'alice').get());
    await assertFails(alice.collection('users').get());
  });

  it('cannot modify or delete', async () => {
    await assertFails(alice.doc('users/bob/manuscripts/m1').update(bump(2, { title: 'Mine now' })));
    await assertFails(alice.doc('users/bob/manuscripts/m1').delete());
    await assertFails(alice.doc('users/bob/manuscripts/m1/sections/s1').delete());
    await assertFails(alice.doc('users/bob/manuscripts/m1/snapshots/snap1').delete());
    await assertFails(alice.doc('users/bob').update({ displayName: 'Hacked', updatedAt: NOW }));
  });

  it('cannot create inside another account, whatever ownerId is claimed', async () => {
    await assertFails(alice.doc('users/bob/manuscripts/m2').set(manuscript('bob')));
    await assertFails(alice.doc('users/bob/manuscripts/m2').set(manuscript('alice')));
    await assertFails(alice.doc('users/bob/manuscripts/m1/sections/s2').set(section('bob')));
  });
});

describe('ownership forgery', () => {
  it('rejects documents in your own path that claim another owner', async () => {
    await assertFails(alice.doc('users/alice').set({ ownerId: 'bob', displayName: 'A' }));
    await assertFails(alice.doc('users/alice/manuscripts/m1').set(manuscript('bob')));
    const { ownerId: _omitted, ...withoutOwner } = manuscript('alice');
    await assertFails(alice.doc('users/alice/manuscripts/m1').set(withoutOwner));
  });

  it('rejects sections whose manuscript or section ID does not match the path, and orphan snapshots', async () => {
    await assertSucceeds(alice.doc('users/alice/manuscripts/a1').set(manuscript('alice')));
    await assertFails(alice.doc('users/alice/manuscripts/a1/sections/s1').set(section('alice', 'm1')));
    await assertFails(alice.doc('users/alice/manuscripts/a1/sections/s2').set(section('alice', 'a1')));
    await assertFails(alice.doc('users/alice/manuscripts/missing/snapshots/x').set(snapshot('alice', 'missing')));
  });

  it('rejects snapshot records pointing at another account’s storage path', async () => {
    await assertSucceeds(alice.doc('users/alice/manuscripts/a1').set(manuscript('alice')));
    await assertFails(
      alice.doc('users/alice/manuscripts/a1/snapshots/x').set({ ...snapshot('alice', 'a1'), storagePath: 'users/bob/manuscripts/m1/snapshots/snap.json' }),
    );
  });
});

describe('ownerId mutation', () => {
  it('cannot change ownerId on any owned document', async () => {
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(2, { ownerId: 'alice' })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').set(manuscript('alice', 2)));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s1').update(bump(2, { ownerId: 'alice' })));
    await assertFails(bob.doc('users/bob').update({ ownerId: 'alice' }));
  });
});

describe('permitted owner operations', () => {
  it('profile: create, read and rename only', async () => {
    await assertSucceeds(alice.doc('users/alice').set({ ownerId: 'alice', displayName: 'Alice', createdAt: NOW, updatedAt: NOW }));
    await assertSucceeds(alice.doc('users/alice').get());
    await assertSucceeds(alice.doc('users/alice').update({ displayName: 'Alice B.', updatedAt: NOW }));
    await assertFails(alice.doc('users/alice').update({ createdAt: 'later' }));
    await assertFails(alice.doc('users/alice').delete());
  });

  it('manuscripts: create, read, commit and soft-delete, but never hard-delete', async () => {
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1').get());
    await assertSucceeds(bob.collection('users/bob/manuscripts').get());
    await assertSucceeds(bob.doc('users/bob/manuscripts/m2').set(manuscript('bob')));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1').update(bump(2, { title: 'Renamed', structureRevision: 2 })));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1').update(bump(3, { deleted: true })));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1').update(bump(4, { deleted: false })));
    await assertFails(bob.doc('users/bob/manuscripts/m2').delete());
  });

  it('manuscripts: rejects stale or skipped revisions, unknown fields and client-chosen server fields', async () => {
    await assertFails(bob.doc('users/bob/manuscripts/m3').set(manuscript('bob', 2)));
    await assertFails(bob.doc('users/bob/manuscripts/m3').set(manuscript('bob', 1, { structureRevision: 2 })));
    await assertFails(bob.doc('users/bob/manuscripts/m3').set(manuscript('bob', 1, { deleted: true })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(1, { title: 'Stale' })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(3, { title: 'Skip' })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(2, { structureRevision: 3 })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(2, { createdAt: '2020-01-01T00:00:00.000Z' })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(2, { schemaVersion: 0 })));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update({ revision: 2, updatedAt: NOW }));
    await assertFails(bob.doc('users/bob/manuscripts/m1').update(bump(2, { recentOps: Array.from({ length: 21 }, (_, i) => `op-${i}`) })));
    await assertFails(bob.doc('users/bob/manuscripts/m4').set(manuscript('bob', 1, { isPro: true })));
    await assertFails(bob.doc('users/bob/manuscripts/m4').set(manuscript('bob', 1, { syncFormat: 'x' })));
  });

  it('sections: create, commit and tombstone, but never hard-delete', async () => {
    const s2 = { ...section('bob'), sectionId: 's2' };
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s2').set(s2));
    await assertSucceeds(bob.collection('users/bob/manuscripts/m1/sections').get());
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s1').update(bump(2, { contentHash: 'new', commitRevision: 2 })));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s1').update(bump(2, { contentHash: 'stale' })));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s2').update(bump(2, { deleted: true, chunkCount: 0, content: '', contentHash: '' })));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s2').update(bump(3, { deleted: true, chunkCount: 0, content: 'leftover text' })));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s2').delete());
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s3').set({ ...section('bob'), sectionId: 's3', chunkCount: 0 }));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s4').set({ ...section('bob'), sectionId: 's4', updatedAt: NOW }));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s5').set({ ...section('bob'), sectionId: 's5', section: { id: 's5' } }));
  });

  it('section chunks: owner-only, path-consistent', async () => {
    const chunk = { ownerId: 'bob', manuscriptId: 'm1', sectionId: 's1', revision: 1, index: 1, data: 'more text' };
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/1').set(chunk));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/1').set({ ...chunk, revision: 2 }));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/1').get());
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/2').set(chunk));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/0').set({ ...chunk, index: 0 }));
    await assertFails(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/3').set({ ...chunk, index: 3, sectionId: 's9' }));
    await assertFails(alice.doc('users/bob/manuscripts/m1/sections/s1/chunks/1').get());
    await assertFails(alice.doc('users/bob/manuscripts/m1/sections/s1/chunks/1').set({ ...chunk, ownerId: 'alice' }));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/sections/s1/chunks/1').delete());
  });

  it('snapshots: create, read and delete, but never edit; server sets the time', async () => {
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/snapshots/snap2').set(snapshot('bob')));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/snapshots/snap1').get());
    await assertFails(bob.doc('users/bob/manuscripts/m1/snapshots/snap1').update({ reason: 'periodic' }));
    await assertFails(bob.doc('users/bob/manuscripts/m1/snapshots/snap3').set({ ...snapshot('bob'), reason: 'whenever' }));
    await assertFails(bob.doc('users/bob/manuscripts/m1/snapshots/snap4').set({ ...snapshot('bob'), createdAt: NOW }));
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/snapshots/snap2').delete());
  });

  it('snapshot chunks: create and delete only, owner-only', async () => {
    const chunk = { ownerId: 'bob', manuscriptId: 'm1', snapshotId: 'snap1', index: 0, data: '{"schemaVersion":1}' };
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/snapshots/snap1/chunks/0').set(chunk));
    await assertFails(bob.doc('users/bob/manuscripts/m1/snapshots/snap1/chunks/0').set({ ...chunk, data: 'rewritten' }));
    await assertFails(bob.doc('users/bob/manuscripts/m1/snapshots/snap1/chunks/1').set(chunk));
    await assertFails(alice.doc('users/bob/manuscripts/m1/snapshots/snap1/chunks/0').get());
    await assertSucceeds(bob.doc('users/bob/manuscripts/m1/snapshots/snap1/chunks/0').delete());
  });
});

describe('restricted billing, entitlement and export records', () => {
  it('owners can read their own server-written records', async () => {
    await assertSucceeds(bob.doc('users/bob/entitlements/current').get());
    await assertSucceeds(bob.collection('users/bob/exportLedger').get());
    await assertSucceeds(bob.doc('users/bob/exports/e1').get());
  });

  it('clients cannot grant themselves Pro or change entitlements', async () => {
    await assertFails(bob.doc('users/bob/entitlements/current').update({ plan: 'pro' }));
    await assertFails(bob.doc('users/bob/entitlements/current').set({ plan: 'pro', status: 'active' }));
    await assertFails(alice.doc('users/alice/entitlements/current').set({ plan: 'pro' }));
    await assertFails(bob.doc('users/bob/entitlements/current').delete());
  });

  it('clients cannot add plan or admin fields to their profile', async () => {
    await assertFails(alice.doc('users/alice').set({ ownerId: 'alice', plan: 'pro' }));
    await assertFails(bob.doc('users/bob').update({ plan: 'pro', updatedAt: NOW }));
    await assertFails(bob.doc('users/bob').update({ isAdmin: true }));
  });

  it('clients cannot change export quota or forge export records', async () => {
    await assertFails(bob.doc('users/bob/exportLedger/r1').update({ count: 0 }));
    await assertFails(bob.doc('users/bob/exportLedger/r1').delete());
    await assertFails(bob.doc('users/bob/exportLedger/r2').set({ count: -5 }));
    await assertFails(bob.doc('users/bob/exports/e2').set({ status: 'ready', storagePath: 'users/bob/exports/e2/book.epub' }));
    await assertFails(bob.doc('users/bob/exports/e1').update({ status: 'ready' }));
  });

  it('billing and admin collections are closed to everyone, including owners', async () => {
    await assertFails(bob.doc('billing/bob').get());
    await assertFails(bob.doc('billing/bob').set({ customerId: 'cus_2' }));
    await assertFails(bob.doc('admin/config').get());
    await assertFails(bob.doc('admin/config').set({ flag: false }));
  });

  it('denies anything not explicitly modelled', async () => {
    await assertFails(bob.doc('anything/x').set({ a: 1 }));
    await assertFails(bob.doc('anything/x').get());
    await assertFails(bob.doc('users/bob/other/x').set({ ownerId: 'bob' }));
    await assertFails(bob.doc('users/bob/other/x').get());
  });
});
