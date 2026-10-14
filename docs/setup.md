# Developer setup (Folio Loom 2.0 workspace)

The repository holds two things side by side:

- **Legacy app (1.x):** Create React App at the repository root (`src/`, `public/`). Vercel production deploys it from `main`.
- **2.0 workspace:** `apps/`, `packages/`, `services/`, `tooling/`, wired together with npm workspaces.

## Requirements

- Node.js **22.12 or newer** (24.x recommended; verified on 24.8.0) and npm 10 or 11
- **Java 21 or newer** for the Firestore and Storage emulators (verified with Temurin 21). Check with `java -version`; install with `brew install --cask temurin@21` or from [adoptium.net](https://adoptium.net).
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
| `npm run ws:emulators` | Local Auth, Firestore, and Storage emulators plus the Emulator UI (http://127.0.0.1:4000) |
| `npm run ws:test:emulators` | Starts throwaway emulators, runs the security-rules and auth suites, shuts them down |
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

## Firebase (emulator only)

The 2.0 apps talk **only** to the local Firebase Emulator Suite. There is no real Firebase project and nothing to sign in to.

- `firebase-tools` is a dev dependency of `tooling`, so `npm install` provides the CLI. A global `firebase` is not needed.
- The project ID is `demo-folio-loom` (`.firebaserc`). Firebase treats any `demo-*` ID as emulator-only: the SDKs and CLI refuse to reach real services for it, so a misconfigured machine fails closed.
- `packages/auth` enforces the same thing in app code. `resolveFirebaseConfig` throws unless the mode is `emulator` and the project ID starts with `demo-`. The API key is a placeholder, because the emulators accept any key.

### Running the apps against the emulators

```bash
npm run ws:emulators                     # terminal 1: Auth 9099, Firestore 8080, Storage 9199, UI 4000
npm run dev -w @folio-loom/web           # terminal 2: http://localhost:3000
npm run start -w @folio-loom/mobile      # or the Expo shell
```

Accounts you create live in the emulator until you stop it. Use the Emulator UI to inspect or delete them.

Optional overrides are in `apps/web/.env.example` (`NEXT_PUBLIC_FIREBASE_*`) and `apps/mobile/.env.example` (`EXPO_PUBLIC_FIREBASE_*`). Copy one to `.env.local` (web) or `.env` (mobile); both are gitignored. Where each device reaches the emulator:

- iOS Simulator and the web app use `127.0.0.1`.
- The Android emulator uses `10.0.2.2`, which the app picks automatically.
- A physical phone needs your computer's LAN IP in `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`. It also needs the emulators listening on that interface: temporarily change `"host"` in `firebase.json` to `0.0.0.0`, and don't commit that change.

If a port is taken (for example by another project's emulators), stop that process or change the port in `firebase.json` and the matching `*_PORT` env var.

### Security tests

`npm run ws:test:emulators` runs `firebase emulators:exec` with `firebase/firebase.test.json`. That config uses its own ports (Auth 9299, Firestore 8280, Storage 9399, hub 4600), so the tests can run while your dev emulators are up. It runs:

| Suite | What it proves |
| --- | --- |
| `firebase/tests/firestore.rules.emulator.test.ts` | Owner-only CRUD, immutable `ownerId`, revision rules, server-only entitlements/ledger/exports, default deny |
| `firebase/tests/storage.rules.emulator.test.ts` | Owner-scoped files, `ownerId` metadata, content-type and size limits, immutable files, server-only exports, default deny |
| `firebase/tests/session.emulator.test.ts` | Real Auth-emulator tokens: signed-out and deleted accounts lose access; another account can't read |
| `firebase/tests/rn-session-restoration.emulator.test.ts` | The React Native build of `@firebase/auth` restores a session from AsyncStorage-style storage after an app restart |
| `packages/auth/src/auth.emulator.test.ts` | Sign-up, sign-in, sign-out, invalid credentials, duplicate email, auth initialization |

The unit tests in `npm run ws:test` never need the emulators.

### Emulator vs. future staging

| | Emulator (now) | Staging (not built yet) |
| --- | --- | --- |
| Project ID | `demo-folio-loom` | A real, dedicated non-production project |
| Credentials | None; placeholder API key | Web config from env/EAS secrets; never committed |
| Data | In memory, wiped when the emulators stop | Persistent; test accounts only |
| Rules | Loaded from `firebase/*.rules` on start | Deployed from the same files after the emulator suite passes |
| App code | `mode=emulator` (the only mode `resolveFirebaseConfig` accepts) | Needs a new, reviewed `staging` branch in `resolveFirebaseConfig` |
| Admin/server writes | Tests use `withSecurityRulesDisabled` | Export worker service account (Admin SDK) |

Adding staging means adding a deliberate code path and secrets. It can't be reached by changing an env var.

### Rules for credentials

- Never commit credentials. Service-account JSON, `google-services.json`, `GoogleService-Info.plist`, and `.env`/`.env.local` files are gitignored.
- Production projects are off-limits to local development.

## Versions that must move together

- `react` and `react-dom` in the root, `apps/web`, and `apps/mobile` must equal the exact React version Expo requires (19.2.3 for SDK 57).
- `vitest` (pinned in `tooling`) and the `@rolldown/binding-*` optional dependencies next to it.
- `firebase` (root of the dependency tree for `@firebase/*`), the direct `@firebase/auth` pin in `apps/mobile`, and `@firebase/rules-unit-testing` in `tooling`. Exactly one copy of each `@firebase/*` package should be installed (`npm ls @firebase/auth`).
- `@react-native-async-storage/async-storage` stays on the version Expo SDK 57 pins (2.2.0), which `@firebase/auth`'s React Native persistence supports.
