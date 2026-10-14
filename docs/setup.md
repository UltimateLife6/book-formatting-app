# Developer setup (Folio Loom 2.0 workspace)

The repository holds two things side by side:

- **Legacy app (1.x):** Create React App at the repository root (`src/`, `public/`). Vercel production deploys it from `main`.
- **2.0 workspace:** `apps/`, `packages/`, `services/`, `tooling/`, wired together with npm workspaces.

## Requirements

- Node.js **22.12 or newer** (24.x recommended; verified on 24.8.0) and npm 10 or 11
- For running on devices: Xcode (iOS Simulator) and/or Android Studio, or the Expo Go app (SDK 57)

## Install

```bash
npm install
```

One install covers every workspace.

If Vitest fails with `Cannot find native binding` (npm/cli#4828):

1. Delete `node_modules/.package-lock.json`.
2. Run `npm install` again.

Rolldown's platform bindings are pinned in `tooling/package.json`. Keep them on the same version as the `rolldown` that Vitest pulls in.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run ws:test` | Vitest for all packages and services (includes the QA fixtures in `qa/fixtures`) |
| `npm run ws:typecheck` | TypeScript for packages/services, the Next app, and the Expo app |
| `npm run ws:lint` | Biome lint for the new directories |
| `npm run ws:build:web` | Production build of `apps/web` |
| `npm run ws:export:mobile` | Metro iOS bundle of `apps/mobile` (proves the shared packages bundle for native) |
| `npm run ws:verify` | All of the above |
| `npm run dev -w @folio-loom/web` | Next dev server at http://localhost:3000 |
| `npm run start -w @folio-loom/mobile` | Expo dev server (press `i` / `a`, or scan with Expo Go) |

The legacy scripts work exactly as before:

```bash
npm start
npm test
npm run lint
npm run type-check
npm run build
```

## Adding a package

1. Create `packages/<name>/package.json` with `"name": "@folio-loom/<name>"`, `"type": "module"`, and `"exports": { ".": "./src/index.ts" }`.
2. Keep it platform-neutral. No React, DOM, React Native, or Node-only imports unless it's an explicit subpath like `import-engine/docx`.
3. Put tests next to the code as `src/*.test.ts`. Vitest and the packages typecheck pick them up automatically.
4. If the web app uses the package, add it to `transpilePackages` in `apps/web/next.config.ts`.

## Firebase

This milestone has no Firebase wiring.

- Never commit credentials. Service-account JSON, `google-services.json`, and `GoogleService-Info.plist` are gitignored.
- Development must use the Firebase Emulator Suite or a dedicated dev project.
- Production projects are off-limits to local development.

## Versions that must move together

- `react` and `react-dom` in the root, `apps/web`, and `apps/mobile` must equal the exact React version Expo requires (19.2.3 for SDK 57).
- `vitest` (pinned in `tooling`) and the `@rolldown/binding-*` optional dependencies next to it.
