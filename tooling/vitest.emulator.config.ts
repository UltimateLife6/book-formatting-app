import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Run through `firebase emulators:exec`, which sets the *_EMULATOR_HOST variables. */
export default defineConfig({
  test: {
    root: repoRoot,
    include: ['firebase/tests/**/*.emulator.test.ts', 'packages/*/src/**/*.emulator.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Suites share one emulator instance and clear data between tests.
    fileParallelism: false,
  },
});
