import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ID = 'demo-folio-loom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readRules(file: 'firestore.rules' | 'storage.rules'): string {
  return readFileSync(resolve(root, file), 'utf8');
}

/** `firebase emulators:exec` exports these; the defaults match firebase.json. */
function hostPort(variable: string, fallbackPort: number): { host: string; port: number } {
  const value = process.env[variable];
  if (!value) return { host: '127.0.0.1', port: fallbackPort };
  const index = value.lastIndexOf(':');
  return { host: value.slice(0, index), port: Number(value.slice(index + 1)) };
}

export const emulators = {
  auth: hostPort('FIREBASE_AUTH_EMULATOR_HOST', 9099),
  firestore: hostPort('FIRESTORE_EMULATOR_HOST', 8080),
  storage: hostPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
};

export const authEmulatorUrl = `http://${emulators.auth.host}:${emulators.auth.port}`;

export const demoAppOptions = {
  apiKey: 'demo-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  appId: `1:000000000000:web:${PROJECT_ID}`,
};

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}
