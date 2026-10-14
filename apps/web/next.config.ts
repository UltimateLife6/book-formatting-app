import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(process.cwd(), '../..');

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@folio-loom/book-model',
    '@folio-loom/chapter-engine',
    '@folio-loom/export-epub',
    '@folio-loom/formatting',
    '@folio-loom/import-engine',
    '@folio-loom/validation',
  ],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
};

export default nextConfig;
