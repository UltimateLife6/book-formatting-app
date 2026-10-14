/**
 * Firebase configuration for M1-A. Only the local Emulator Suite is supported: the project ID
 * must be a `demo-*` ID, which Firebase guarantees never maps to a real project, and every
 * service is pointed at local emulators. Staging/production are rejected until they are
 * explicitly designed and approved.
 */
export interface FirebaseEnvInput {
  mode?: string | undefined;
  projectId?: string | undefined;
  emulatorHost?: string | undefined;
  authPort?: string | undefined;
  firestorePort?: string | undefined;
  storagePort?: string | undefined;
}

export interface EmulatorFirebaseConfig {
  mode: 'emulator';
  options: { apiKey: string; authDomain: string; projectId: string; storageBucket: string; appId: string };
  emulators: { host: string; authUrl: string; firestorePort: number; storagePort: number };
}

export const DEFAULT_DEMO_PROJECT_ID = 'demo-folio-loom';
export const DEFAULT_EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 } as const;

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseConfigError';
  }
}

const DEMO_PROJECT_ID = /^demo-[a-z0-9-]{1,40}$/;
const HOST = /^[A-Za-z0-9.-]+$/;

function port(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new FirebaseConfigError(`${name} must be a port number.`);
  return parsed;
}

export function resolveFirebaseConfig(env: FirebaseEnvInput, defaults: { emulatorHost: string }): EmulatorFirebaseConfig {
  const mode = env.mode && env.mode.length > 0 ? env.mode : 'emulator';
  if (mode !== 'emulator') {
    throw new FirebaseConfigError(`Firebase mode "${mode}" is not supported yet. Only "emulator" is available in this build.`);
  }
  const projectId = env.projectId && env.projectId.length > 0 ? env.projectId : DEFAULT_DEMO_PROJECT_ID;
  if (!DEMO_PROJECT_ID.test(projectId)) {
    throw new FirebaseConfigError(`Emulator mode requires a "demo-*" project ID (got "${projectId}"). Refusing to connect to a real project.`);
  }
  const host = env.emulatorHost && env.emulatorHost.length > 0 ? env.emulatorHost : defaults.emulatorHost;
  if (!HOST.test(host)) throw new FirebaseConfigError('Emulator host must be a hostname or IP address.');

  return {
    mode: 'emulator',
    options: {
      // Placeholder values: the emulators accept any API key, and demo projects have no real key.
      apiKey: 'demo-api-key',
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: `${projectId}.appspot.com`,
      appId: `1:000000000000:web:${projectId}`,
    },
    emulators: {
      host,
      authUrl: `http://${host}:${port(env.authPort, DEFAULT_EMULATOR_PORTS.auth, 'Auth emulator port')}`,
      firestorePort: port(env.firestorePort, DEFAULT_EMULATOR_PORTS.firestore, 'Firestore emulator port'),
      storagePort: port(env.storagePort, DEFAULT_EMULATOR_PORTS.storage, 'Storage emulator port'),
    },
  };
}
