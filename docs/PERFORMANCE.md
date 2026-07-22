# Performance Baseline

WhatToDo targets smooth local desktop use with about 20k tasks in a single-user SQLite database.

## Checks

- `pnpm perf:build` runs the normal production build and reports JS/CSS asset sizes.
- `pnpm perf:fixture` writes `tmp/performance-backup-20000.json` and validates it with `parseBackupPayload()`.
- `pnpm perf:fixture:validate` re-checks an existing fixture file.
- `pnpm perf:runtime` — LocalRepository **2k** hot-path budgets (CI-friendly).
- `pnpm perf:sqlite` — LocalRepository **20k** fixture import + P50/P95 for load / `loadTaskPage` / toggle / `saveSettings` (not default CI; requires fixture).
- `pnpm test` covers repository, filtering, reminders, and UI behavior.
- `cd src-tauri && cargo check` validates the desktop runtime.

Desktop UI timing (cold start, view switching, memory peak) still requires `pnpm tauri dev` and must be logged in `PERFORMANCE_VALIDATION.md`.

## 20k Task Validation

1. Run `pnpm perf:fixture`.
2. Run `pnpm perf:sqlite` and record P50/P95 from the console output.
3. Start the desktop app with `pnpm tauri dev`.
4. Import `tmp/performance-backup-20000.json` from Settings.
5. Check Home, Overview, Projects, Workspaces, Reminder Center, and Settings view switching.
6. In Home, search for a task and verify the list uses the load-more control instead of rendering every task at once.
7. In Workspaces, open the existing-task picker and verify candidate tasks load only when the dialog opens.
8. Open a workspace floating window and verify its task list also uses the load-more control.
9. Record the result in `PERFORMANCE_VALIDATION.md`.

## Current Thresholds

### Bundle

- Initial main JS chunk must stay below 500 kB.
- The preferred target is below 450 kB.
- Large non-home views are loaded lazily so first screen work stays focused on the daily task surface.

### Data layer — 2k (`pnpm perf:runtime`)

| Path | Budget |
|---|---|
| `load` | &lt; 250 ms |
| `loadTaskPage` | &lt; 80 ms |
| `toggleTask` | &lt; 250 ms |

### Data layer — 20k (`pnpm perf:sqlite`, P95)

Fixture contains **20k tasks across 4 workspaces**; the active-workspace `AppData.tasks` snapshot is ~5k. Budgets apply to that LocalRepository path (unbounded in-memory storage stub in tests).

| Path | Budget (P95) |
|---|---|
| fixture `importBackup` (replace) | &lt; 8000 ms |
| `load` | &lt; 2500 ms |
| `loadTaskPage` (limit 50) | &lt; 250 ms |
| `toggleTask` | &lt; 500 ms |
| `saveSettings` | &lt; 500 ms |

Record P50 and P95 when filling `PERFORMANCE_VALIDATION.md`. These LocalRepository numbers do **not** include Tauri IPC or SQLite file I/O.

### FTS / PERF-004

**Wave 5 decision (2026-07-22): do not implement SQLite FTS5.** LocalRepository 20k `loadTaskPage` stayed well under budget; no Tauri desktop search timing showed a user-visible bottleneck. Short-term mitigation remains paged queries and non-text filter indexes. Revisit FTS5 only after a real desktop import + Home search pass.

## Runtime Hot Paths

- Main repository loading avoids cross-workspace candidate tasks and recovery data.
- Existing cross-workspace tasks are fetched only when the workspace picker opens.
- Deleted and archived recovery items are fetched only inside settings.
- Task filtering uses precomputed indexes for project and reminder lookups.
- Long task lists render in 150-item windows with an explicit load-more control.
- `loadTaskPage` provides a first repository-level page query for future view migration.
- List hydrate uses `TaskSummary` (no notes); detail uses `getTask(id)`.
- Tier-1 Sql mutations (settings / project / saved view / attachment / bulk task) use cache delta patches instead of full `readAll`.
- Tier-2 Sql mutations (workspace folder CRUD, `updateWorkspace` / `restoreWorkspace`, recurring create / template update / disable) also use cache delta patches. Still full `readAll`: `createWorkspace`, `deleteWorkspace`, `selectWorkspace`, `updateRecurringSeries(openFuture)`, `importBackup`.
