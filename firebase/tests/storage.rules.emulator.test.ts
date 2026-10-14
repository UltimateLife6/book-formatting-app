import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulators, PROJECT_ID, readRules } from './env';

type Storage = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['storage']>;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MB = 1024 * 1024;
const bytes = (size = 16) => new Uint8Array(size).fill(65);

let env: RulesTestEnvironment;
let alice: Storage;
let bob: Storage;
let anon: Storage;

/** UploadTask is thenable but not a Promise; assert helpers need a real Promise. */
function upload(storage: Storage, path: string, data: Uint8Array, contentType: string, ownerId?: string) {
  const metadata = { contentType, ...(ownerId ? { customMetadata: { ownerId } } : {}) };
  return Promise.resolve(storage.ref(path).put(data, metadata));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: readRules('storage.rules'), ...emulators.storage },
  });
  alice = env.authenticatedContext('alice').storage();
  bob = env.authenticatedContext('bob').storage();
  anon = env.unauthenticatedContext().storage();
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage();
    await upload(storage, 'users/bob/imports/book.docx', bytes(), DOCX, 'bob');
    await upload(storage, 'users/bob/manuscripts/m1/snapshots/snap.json', bytes(), 'application/json', 'bob');
    await upload(storage, 'users/bob/exports/e1/book.epub', bytes(), 'application/epub+zip', 'bob');
  });
});

describe('unauthenticated access', () => {
  it('cannot read, list, upload or delete', async () => {
    await assertFails(anon.ref('users/bob/imports/book.docx').getDownloadURL());
    await assertFails(anon.ref('users/bob/imports/book.docx').getMetadata());
    await assertFails(anon.ref('users/bob/imports').listAll());
    await assertFails(upload(anon, 'users/bob/imports/new.docx', bytes(), DOCX, 'bob'));
    await assertFails(anon.ref('users/bob/imports/book.docx').delete());
  });
});

describe('cross-user access (alice → bob)', () => {
  it('cannot read or list another account’s files', async () => {
    await assertFails(alice.ref('users/bob/imports/book.docx').getDownloadURL());
    await assertFails(alice.ref('users/bob/imports').listAll());
    await assertFails(alice.ref('users/bob/manuscripts/m1/snapshots/snap.json').getMetadata());
    await assertFails(alice.ref('users/bob/exports/e1/book.epub').getDownloadURL());
  });

  it('cannot upload into or delete from another account, even claiming its ownerId', async () => {
    await assertFails(upload(alice, 'users/bob/imports/evil.docx', bytes(), DOCX, 'bob'));
    await assertFails(upload(alice, 'users/bob/imports/evil.docx', bytes(), DOCX, 'alice'));
    await assertFails(alice.ref('users/bob/imports/book.docx').delete());
    await assertFails(alice.ref('users/bob/manuscripts/m1/snapshots/snap.json').delete());
  });
});

describe('ownership forgery and file validation', () => {
  it('requires ownerId metadata matching the path owner', async () => {
    await assertFails(upload(alice, 'users/alice/imports/a.docx', bytes(), DOCX));
    await assertFails(upload(alice, 'users/alice/imports/a.docx', bytes(), DOCX, 'bob'));
  });

  it('enforces import content types and size limits', async () => {
    await assertFails(upload(alice, 'users/alice/imports/a.exe', bytes(), 'application/x-msdownload', 'alice'));
    await assertFails(upload(alice, 'users/alice/imports/a.html', bytes(), 'text/html', 'alice'));
    await assertFails(upload(alice, 'users/alice/imports/empty.txt', new Uint8Array(0), 'text/plain', 'alice'));
    await assertFails(upload(alice, 'users/alice/imports/huge.txt', bytes(20 * MB + 1), 'text/plain', 'alice'));
  });

  it('enforces snapshot content types', async () => {
    await assertFails(upload(alice, 'users/alice/manuscripts/a1/snapshots/s.txt', bytes(), 'text/plain', 'alice'));
  });

  it('files are immutable once written', async () => {
    await assertFails(upload(bob, 'users/bob/imports/book.docx', bytes(32), DOCX, 'bob'));
    await assertFails(upload(bob, 'users/bob/manuscripts/m1/snapshots/snap.json', bytes(32), 'application/json', 'bob'));
    await assertFails(bob.ref('users/bob/imports/book.docx').updateMetadata({ customMetadata: { ownerId: 'alice' } }));
  });
});

describe('permitted owner operations', () => {
  it('can upload, read, list and delete own imports', async () => {
    await assertSucceeds(upload(alice, 'users/alice/imports/a.docx', bytes(), DOCX, 'alice'));
    await assertSucceeds(upload(alice, 'users/alice/imports/a.txt', bytes(), 'text/plain; charset=utf-8', 'alice'));
    await assertSucceeds(alice.ref('users/alice/imports/a.docx').getDownloadURL());
    await assertSucceeds(alice.ref('users/alice/imports').listAll());
    await assertSucceeds(alice.ref('users/alice/imports/a.docx').delete());
  });

  it('can upload, read and delete own snapshots', async () => {
    await assertSucceeds(upload(bob, 'users/bob/manuscripts/m1/snapshots/s2.json', bytes(), 'application/json', 'bob'));
    await assertSucceeds(upload(bob, 'users/bob/manuscripts/m1/snapshots/s3.gz', bytes(), 'application/gzip', 'bob'));
    await assertSucceeds(bob.ref('users/bob/manuscripts/m1/snapshots/snap.json').getMetadata());
    await assertSucceeds(bob.ref('users/bob/manuscripts/m1/snapshots/s2.json').delete());
  });
});

describe('server-written exports', () => {
  it('owners can read their export artifacts', async () => {
    await assertSucceeds(bob.ref('users/bob/exports/e1/book.epub').getDownloadURL());
  });

  it('clients cannot write, replace or delete export artifacts', async () => {
    await assertFails(upload(bob, 'users/bob/exports/e2/book.epub', bytes(), 'application/epub+zip', 'bob'));
    await assertFails(upload(bob, 'users/bob/exports/e1/book.epub', bytes(32), 'application/epub+zip', 'bob'));
    await assertFails(bob.ref('users/bob/exports/e1/book.epub').delete());
  });
});

describe('default deny', () => {
  it('denies paths outside the modelled tree', async () => {
    await assertFails(upload(bob, 'public/logo.png', bytes(), 'image/png', 'bob'));
    await assertFails(upload(bob, 'users/bob/other/x.txt', bytes(), 'text/plain', 'bob'));
    await assertFails(upload(bob, 'users/bob/billing/entitlement.json', bytes(), 'application/json', 'bob'));
    await assertFails(bob.ref('users/bob').listAll());
  });
});
