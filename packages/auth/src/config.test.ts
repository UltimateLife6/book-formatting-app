import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_PROJECT_ID, FirebaseConfigError, resolveFirebaseConfig } from './config';

const defaults = { emulatorHost: '127.0.0.1' };

describe('resolveFirebaseConfig', () => {
  it('defaults to the emulator with the demo project', () => {
    const config = resolveFirebaseConfig({}, defaults);
    expect(config.mode).toBe('emulator');
    expect(config.options.projectId).toBe(DEFAULT_DEMO_PROJECT_ID);
    expect(config.emulators).toEqual({ host: '127.0.0.1', authUrl: 'http://127.0.0.1:9099', firestorePort: 8080, storagePort: 9199 });
  });

  it('treats empty env values as unset', () => {
    const config = resolveFirebaseConfig({ mode: '', projectId: '', emulatorHost: '', authPort: '' }, defaults);
    expect(config.options.projectId).toBe(DEFAULT_DEMO_PROJECT_ID);
    expect(config.emulators.authUrl).toBe('http://127.0.0.1:9099');
  });

  it('accepts a custom demo project, host and ports', () => {
    const config = resolveFirebaseConfig({ projectId: 'demo-alt', emulatorHost: '10.0.2.2', authPort: '9100', storagePort: '9200' }, defaults);
    expect(config.options.projectId).toBe('demo-alt');
    expect(config.options.storageBucket).toBe('demo-alt.appspot.com');
    expect(config.emulators.authUrl).toBe('http://10.0.2.2:9100');
    expect(config.emulators.storagePort).toBe(9200);
  });

  it.each(['folio-loom-prod', 'my-real-project', 'demo-', 'DEMO-folio', 'demo-folio/../x'])('refuses non-demo project ID %s', (projectId) => {
    expect(() => resolveFirebaseConfig({ projectId }, defaults)).toThrow(FirebaseConfigError);
  });

  it.each(['staging', 'production', 'live'])('refuses unsupported mode %s', (mode) => {
    expect(() => resolveFirebaseConfig({ mode }, defaults)).toThrow(/not supported/);
  });

  it('rejects invalid hosts and ports', () => {
    expect(() => resolveFirebaseConfig({ emulatorHost: 'http://evil.example' }, defaults)).toThrow(FirebaseConfigError);
    expect(() => resolveFirebaseConfig({ authPort: 'abc' }, defaults)).toThrow(FirebaseConfigError);
    expect(() => resolveFirebaseConfig({ firestorePort: '70000' }, defaults)).toThrow(FirebaseConfigError);
  });
});
