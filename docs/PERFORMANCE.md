# Performance Baseline

WhatToDo targets smooth local desktop use with about 20k tasks in a single-user SQLite database.

## Checks

- `pnpm perf:build` runs the normal production build and reports JS/CSS asset sizes.
- `pnpm perf:fixture` writes `tmp/performance-backup-20000.json`, a synthetic backup for large-data validation.
- `pnpm test` covers repository, filtering, reminders, and UI behavior.
- `cd src-tauri && cargo check` validates the desktop runtime.

## 20k Task Validation

1. Run `pnpm perf:fixture`.
2. Start the desktop app with `pnpm tauri dev`.
3. Import `tmp/performance-backup-20000.json` from Settings.
4. Check Home, Overview, Projects, Workspaces, Reminder Center, and Settings view switching.
5. In Home, search for a task and verify the list uses the load-more control instead of rendering every task at once.
6. In Workspaces, open the existing-task picker and verify candidate tasks load only when the dialog opens.
7. Open a workspace floating window and verify its task list also uses the load-more control.
8. Record the result in `PERFORMANCE_VALIDATION.md`.

## Current Thresholds

- Initial main JS chunk must stay below 500 kB.
- The preferred target is below 450 kB.
- Large non-home views are loaded lazily so first screen work stays focused on the daily task surface.

## Runtime Hot Paths

- Main repository loading avoids cross-workspace candidate tasks and recovery data.
- Existing cross-workspace tasks are fetched only when the workspace picker opens.
- Deleted and archived recovery items are fetched only inside settings.
- Task filtering uses precomputed indexes for project and reminder lookups.
- Long task lists render in 150-item windows with an explicit load-more control.
- `loadTaskPage` provides a first repository-level page query for future view migration.
