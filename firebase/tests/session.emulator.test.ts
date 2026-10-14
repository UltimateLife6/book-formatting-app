import { deleteApp, type FirebaseApp, initializeApp } from 'firebase/app';
import {
  type Auth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, type Firestore, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { connectStorageEmulator, type FirebaseStorage, getStorage, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authEmulatorUrl, demoAppOptions, emulators, uniqueEmail } from './env';

/**
 * Uses the real client SDK and real Auth-emulator ID tokens (not the rules-unit-testing token
 * shortcut) to prove that a signed-out or deleted session loses access immediately on the client.
 */
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

const PASSWORD = 'correct horse battery';
const NOW = '2026-10-14T00:00:00.000Z';
const manuscript = (uid: string) => ({ ownerId: uid, schemaVersion: 1, title: 'Session test', revision: 1, createdAt: NOW, updatedAt: NOW });
const docxMetadata = (uid: string) => ({
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  customMetadata: { ownerId: uid },
});

async function denied(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
  throw new Error('Expected the request to be denied');
}

beforeAll(() => {
  app = initializeApp(demoAppOptions, `session-${Date.now()}`);
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  db = getFirestore(app);
  connectFirestoreEmulator(db, emulators.firestore.host, emulators.firestore.port);
  storage = getStorage(app);
  connectStorageEmulator(storage, emulators.storage.host, emulators.storage.port);
});

afterAll(async () => {
  await deleteApp(app);
});

describe('real Auth-emulator sessions against the security rules', () => {
  it('loses access after sign-out and regains it after signing back in', async () => {
    const email = uniqueEmail('session');
    const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    const manuscriptRef = doc(db, `users/${user.uid}/manuscripts/m1`);
    await setDoc(manuscriptRef, manuscript(user.uid));
    await uploadBytes(ref(storage, `users/${user.uid}/imports/book.docx`), new Uint8Array([1, 2, 3]), docxMetadata(user.uid));
    expect((await getDoc(manuscriptRef)).data()?.title).toBe('Session test');

    await signOut(auth);
    expect(auth.currentUser).toBeNull();
    expect(await denied(getDoc(manuscriptRef))).toBe('permission-denied');
    expect(await denied(uploadBytes(ref(storage, `users/${user.uid}/imports/two.docx`), new Uint8Array([1]), docxMetadata(user.uid)))).toBe(
      'storage/unauthorized',
    );

    await signInWithEmailAndPassword(auth, email, PASSWORD);
    expect((await getDoc(manuscriptRef)).exists()).toBe(true);
  });

  it('a deleted account is signed out, denied, and cannot sign in again', async () => {
    const email = uniqueEmail('deleted');
    const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    const manuscriptRef = doc(db, `users/${user.uid}/manuscripts/m1`);
    await setDoc(manuscriptRef, manuscript(user.uid));

    await deleteUser(user);
    expect(auth.currentUser).toBeNull();
    expect(await denied(getDoc(manuscriptRef))).toBe('permission-denied');
    expect(await denied(setDoc(doc(db, `users/${user.uid}/manuscripts/m2`), manuscript(user.uid)))).toBe('permission-denied');
    expect(await denied(signInWithEmailAndPassword(auth, email, PASSWORD))).toMatch(/auth\/(user-not-found|invalid-credential)/);
  });

  it('a different real account cannot read the first account’s data', async () => {
    const owner = await createUserWithEmailAndPassword(auth, uniqueEmail('owner'), PASSWORD);
    const ownerRef = doc(db, `users/${owner.user.uid}/manuscripts/m1`);
    await setDoc(ownerRef, manuscript(owner.user.uid));
    await signOut(auth);

    await createUserWithEmailAndPassword(auth, uniqueEmail('intruder'), PASSWORD);
    expect(await denied(getDoc(ownerRef))).toBe('permission-denied');
    await signOut(auth);
  });
});
