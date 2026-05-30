# WhatToDo

WhatToDo is a desktop task and deadline planner built with Tauri, React, TypeScript, and Vite.

## Development

```bash
pnpm install
pnpm tauri dev
```

## Scripts

- `pnpm dev` starts the Vite development server.
- `pnpm build` builds the web frontend.
- `pnpm test` runs the Vitest suite.
- `pnpm tauri` runs Tauri CLI commands.
- `pnpm release:sync-version <version>` syncs the version across npm, Tauri, and Cargo metadata.
- `pnpm release:check` verifies release metadata, updater configuration, changelog coverage, a clean Git tree, and updater signing secrets.
- `pnpm release:build` runs the release checks and builds signed Tauri updater artifacts.

## Release and updates

Releases are published by the GitHub Actions workflow in `.github/workflows/release.yml`. Push a tag like `app-v0.1.2`, or run the workflow manually, to build platform installers and a draft GitHub Release.

The app uses the Tauri v2 updater plugin and checks:

```text
https://github.com/Chr0nixz/WhatToDo/releases/latest/download/latest.json
```

Before publishing a release:

1. Run `pnpm release:sync-version <version>`.
2. Add release notes to `CHANGELOG.md`.
3. Commit the version and changelog changes.
4. Ensure GitHub Secrets contains `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
5. Push `app-v<version>` and verify the draft release artifacts.

The generated updater private key and password are intentionally local-only in `.tauri-updater-private-key.local` and `.tauri-updater-private-key-password.local`. The public key is committed in `src-tauri/tauri.conf.json`; the private key and password must stay in GitHub Secrets or another secure secret store.
