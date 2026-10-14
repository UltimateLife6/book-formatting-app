import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  test: {
    root: repoRoot,
    include: ['packages/*/src/**/*.test.ts', 'services/*/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
