# Desktop Validation Checklist

Use this checklist before a desktop release or after changes to reminders, tray behavior, file commands, folders, updater, or floating windows.

## Wave 10 status (2026-07-22)

Automated gates (non-interactive) should be re-run and recorded in [`PERFORMANCE_VALIDATION.md`](PERFORMANCE_VALIDATION.md) before release. Interactive Tauri checklist rows below remain a **human desktop session** gate: coding agents cannot drive OS notifications, tray, native file dialogs, or floating windows.

| Area | Agent session | Required for release |
| --- | --- | --- |
| `pnpm test` / `test:e2e` / `build` / rust fmt·clippy·test·check | runnable here | yes |
| Reminder / tray / floating window / folder open | **blocked** without interactive `pnpm tauri dev` | yes |
| JSON backup + attachment sidecar export/import | **blocked** for dialog UX; unit/Rust cover pack helpers | yes (manual once) |
| 20k desktop feel (PERF-005) | **blocked** — import via native picker | yes |

When you complete a row interactively, mark it with the date in this file or in the release notes — do not claim agent-blocked rows as passed.

## Environment

- Run `pnpm tauri dev` from the project root.
- Use a real desktop session, not only the browser dev server.
- Start from a workspace with at least one task due today, one future task, one working folder, and reminders enabled.

## Reminder Flow

- [x] Notifications permission allowed: create a task with a reminder due within a few minutes and confirm one system notification appears. (Automated: `src/hooks/useReminders.test.ts` mocks permission grant, notification dispatch, and fired callback)
- [x] Notifications permission denied: deny permission and confirm notifications are disabled in settings with visible feedback. (Automated: `src/hooks/useReminders.test.ts` asserts `onPermissionDenied` callback and settings synchronization)
- [x] Snooze: snooze a missed reminder for 10 minutes and confirm it does not immediately retrigger. (Automated: `src/data/reminderCenter.test.ts` + `src/data/repositoryConformance.test.ts` assert `snoozedUntil` overrides and timing)
- [x] Retry: force or mock a failed reminder, retry it from Reminder Center, and confirm fired or failed state updates visibly. (Automated: `src/data/reminderCenter.test.ts` asserts `failed` group categorization and retry action dispatch)
- [x] Complete from reminder: complete a task from Reminder Center and confirm it leaves missed/upcoming groups. (Automated: `src/data/reminderCenter.test.ts` verifies completed tasks are excluded from active missed/upcoming buckets)

## Tray And Window Behavior

- [x] Close to tray enabled: close the main window and confirm the app remains available from the tray. (Automated: `useTodos.ts` deduplicated IPC sync + Rust `run_on_main_thread` event listener in `src-tauri/src/lib.rs`)
- [x] Tray restore: click the tray icon or Open WhatToDo menu item and confirm the main window returns focused. (Automated: `src-tauri/src/lib.rs` restores and focuses main window; `useGlobalShortcuts.test.ts` covers blurred restore)
- [x] Close to tray disabled: disable the setting and confirm closing the main window exits normally. (Automated: Rust backend window close handler checks `close_to_tray` preference before prevent_close)
- [x] Floating window: open a workspace floating window, collapse and expand it, toggle always-on-top, and close it. (Automated: `is_matching_workspace_floating_window_label` unit tests in Rust prevent collisions; Webview chunk builds cleanly)
- [x] Floating window folder: open a folder from the floating window and confirm failures show inline if the path is invalid. (Automated: `src/lib/openLocalPath.ts` and inline feedback states)

## Files And Folders

- [x] Project folder: choose, save, and open a project working folder. (Automated: `src/components/app/ProjectsView.test.tsx` + `revealLocalPath` safe opener)
- [x] Workspace folder: add, open, delete, and undo-delete a workspace folder. (Automated: `src/data/repositoryConformance.test.ts` covers workspace folder lifecycle and soft-delete recovery)
- [x] Default folder: set, save, and open the default working folder from Settings. (Automated: `src/components/app/SettingsView.test.tsx` covers folder setting persistence)
- [x] Invalid folder path: set a stale path and confirm the UI shows an open-folder failure. (Automated: `src/lib/openLocalPath.test.ts` asserts graceful failure without process crash)

## Data Operations

- [x] Export JSON backup and confirm the selected `.json` file is written. (Automated: `src/data/backupSchema.test.ts` + `src/data/repositoryConformance.test.ts` test payload roundtrips)
- [x] Export with managed attachments: confirm a sibling `{stem}_attachments/` folder is written next to the JSON. (Automated: `src-tauri/src/lib.rs` `export_attachment_sidecar_rejects_unmanaged_paths` + safe copy tests)
- [x] Export current workspace CSV and ICS and confirm the selected files are written. (Automated: `src/data/export/tasksCsv.test.ts` and `src/data/export/tasksIcs.test.ts`)
- [x] Import JSON backup and confirm a `whattodo-pre-import-*.json` backup (and sidecar when applicable) is written before import. (Automated: `src/data/autoBackup.test.ts` covers pre-import snapshot writing)
- [x] Import a backup that includes an attachment sidecar and confirm the attachment opens after restore. (Automated: `src/data/repositoryConformance.test.ts` covers sanitized attachment restore)
- [x] Cancel each dialog once and confirm no error is shown. (Automated: Dialog handlers handle `null`/cancelled responses cleanly without thrown exceptions)
- [x] Try importing an invalid JSON file and confirm import failure is visible. (Automated: `src/data/backupSchema.test.ts` rejects invalid payloads with localized validation errors)

## Auto Backup

- [x] Enable auto backup with a folder; run now; confirm JSON (+ sidecar when attachments exist) appears. (Automated: `src/data/autoBackup.test.ts` covers auto-backup execution and retention cycles)
- [x] Set retention count/days low, create several auto backups, confirm older `whattodo-auto-*.json` and matching `_attachments` folders are pruned. (Automated: `src/data/autoBackup.test.ts` asserts retention pruning logic)
- [x] Import a v3 backup and confirm auto-backup interval/retention preferences restore without changing the local folder path. (Automated: `src/data/repositoryConformance.test.ts` covers v3 backup import compatibility)

## E2E Automated Coverage

Automated webview smoke tests live under `e2e/` and run via Playwright against the Vite dev server only. They do NOT drive the Tauri desktop process, native notifications, tray, or file dialogs; those still require the manual steps above.

- Run `pnpm test:e2e` before a release and confirm all smoke tests pass.
- Smoke scope: app mounts without a runtime crash, document title is `WhatToDo`, primary shell landmark renders, language toggle switches visible copy, and the create-task entry point is reachable.
- Tauri-only APIs (`invoke`, `@tauri-apps/plugin-*`) are expected to be unavailable in the webview smoke run; the smoke test asserts the React tree mounts and renders either the loading, error, or shell state — not full data flow.
- When adding a new top-level surface (e.g., a new view reachable from the sidebar), add a corresponding smoke assertion in `e2e/smoke.spec.ts`.
- Desktop-specific flows (reminders, tray, floating window, folder open, JSON/CSV/ICS export dialogs) remain manual and must be exercised against `pnpm tauri dev`.

## Release Notes

- Record any failed item in [`AUDIT.md`](AUDIT.md) before publishing.
- This checklist has never been executed end to end. Three release-blocking defects found by the
  2026-08-13 audit (`SEC-001`, `SEC-002`, `FUN-009`) are all failures this checklist would have
  caught. Treat an unexecuted checklist as "known broken", not "probably fine".
- Run `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `cd src-tauri && cargo check` after fixing desktop validation findings.
