# WhatToDo

WhatToDo is a local-first desktop task and deadline planner built with Tauri 2, React, TypeScript, Vite, Tailwind CSS, and SQLite.

It is designed as a compact desktop command center for DDL work: daily tasks, projects, workspaces, working folders, system reminders, and a reminder center.

## Features

- Daily DDL calendar with month and week views.
- Task overview with project, priority, due date, due time, and reminder metadata.
- Project and workspace management.
- Working-folder shortcuts for projects and tasks.
- System notifications through Tauri.
- Reminder center with missed, upcoming, and fired reminder groups.
- Reminder actions: open task, complete task, snooze, and disable reminder.
- Chinese and English UI with localized date formatting.
- Light, dark, and system theme modes.
- Local SQLite storage in Tauri, with a localStorage fallback for browser development and tests.

## Development

Install dependencies:

```bash
pnpm install
```

Start the web app only:

```bash
pnpm dev
```

Start the Tauri desktop app:

```bash
pnpm tauri dev
```

Tauri dev uses `scripts/tauri-before-dev.mjs` as `beforeDevCommand`. The script reuses an existing Vite server at `http://127.0.0.1:5173` when possible, or starts one if needed.

## Scripts

- `pnpm dev` starts the Vite development server.
- `pnpm tauri:before-dev` runs the Tauri dev-server bootstrap script.
- `pnpm build` type-checks and builds the web frontend.
- `pnpm preview` previews the production web build.
- `pnpm test` runs the Vitest suite.
- `pnpm test:watch` runs Vitest in watch mode.
- `pnpm tauri` runs Tauri CLI commands.
- `pnpm release:sync-version <version>` syncs npm, Tauri, and Cargo versions.
- `pnpm release:check` verifies release metadata, updater configuration, changelog coverage, a clean Git tree, and updater signing secrets.
- `pnpm release:build` runs release checks and builds signed Tauri updater artifacts.

## Verification

Before handing off changes, run:

```bash
pnpm test
pnpm build
cd src-tauri
cargo check
```

Current automated baseline:

- `pnpm test`: 11 test files, 32 tests.
- `pnpm build`: frontend type-check and production build.
- `cargo check`: Tauri backend compile check.

Recommended browser smoke checks:

- Chinese and English UI switching.
- Home date formatting and selected-date task heading.
- Reminder center entry, empty state, missed/upcoming/fired groups.
- Reminder actions: snooze, disable, open task, complete task.
- Settings save states and inline errors.

Recommended Tauri desktop checks:

- Notification permission allowed and denied flows.
- Due reminders firing in the desktop runtime.
- Snoozed reminders do not immediately retrigger and fire again at the new time.
- Close-to-tray behavior.
- Tray menu restores the main window.
- Workspace floating window opens, stays on top, resizes, and closes.
- Opening project/task/default working folders.

## Architecture

Key areas:

- `src/data` contains domain types, date helpers, reminder center grouping, project calculations, and repository implementations.
- `src/hooks` contains application-level data, theme, and reminder tick logic.
- `src/components/app` contains the product UI surfaces.
- `src-tauri` contains migrations, desktop commands, tray handling, updater setup, and Tauri plugin wiring.

Storage:

- Tauri runtime uses SQLite via `@tauri-apps/plugin-sql`.
- Browser development and tests use localStorage fallback.
- Repository behavior should stay semantically consistent between Local and SQLite implementations.

Reminder model:

- `remindAt` stores the base reminder time.
- `snoozedUntil` overrides the effective reminder time when present.
- `firedAt` marks a reminder as fired.
- `enabled=false` disables a reminder.

Reminder center groups reminders by `effectiveAt = snoozedUntil ?? remindAt` into missed, upcoming, and fired groups.

## Release And Updates

Pull requests and pushes to `main` are verified by `.github/workflows/ci.yml`. The CI job installs dependencies, runs Vitest, builds the frontend, and runs `cargo check`.

Releases are published by `.github/workflows/release.yml`. Push a tag like `app-v0.1.3`, or run the workflow manually, to run verification checks, build the signed Windows NSIS installer, generate `latest.json`, and upload installer, signature, and updater metadata to GitHub Releases.

The app uses the Tauri v2 updater plugin and checks:

```text
https://github.com/Chr0nixz/WhatToDo/releases/latest/download/latest.json
```

Before publishing a release:

1. Run `pnpm release:sync-version <version>`.
2. Add release notes to `CHANGELOG.md`.
3. Commit the version and changelog changes.
4. Ensure GitHub Secrets contains `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
5. Push `app-v<version>` and verify the release assets.

The generated updater private key and password are intentionally local-only in `.tauri-updater-private-key.local` and `.tauri-updater-private-key-password.local`. The public key is committed in `src-tauri/tauri.conf.json`; the private key and password must stay in GitHub Secrets or another secure secret store.

## Current Priorities

See `PROJECT_ANALYSIS.md` for the detailed project analysis and roadmap. The current short-term priorities are:

1. Complete Tauri desktop runtime verification.
2. Add visible reminder failure state.
3. Add undo flows for task deletion, folder deletion, and project archive.
