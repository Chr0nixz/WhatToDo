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

- [ ] Notifications permission allowed: create a task with a reminder due within a few minutes and confirm one system notification appears.
- [ ] Notifications permission denied: deny permission and confirm notifications are disabled in settings with visible feedback.
- [ ] Snooze: snooze a missed reminder for 10 minutes and confirm it does not immediately retrigger.
- [ ] Retry: force or mock a failed reminder, retry it from Reminder Center, and confirm fired or failed state updates visibly.
- [ ] Complete from reminder: complete a task from Reminder Center and confirm it leaves missed/upcoming groups.

## Tray And Window Behavior

- [ ] Close to tray enabled: close the main window and confirm the app remains available from the tray.
- [ ] Tray restore: click the tray icon or Open WhatToDo menu item and confirm the main window returns focused.
- [ ] Close to tray disabled: disable the setting and confirm closing the main window exits normally.
- [ ] Floating window: open a workspace floating window, collapse and expand it, toggle always-on-top, and close it.
- [ ] Floating window folder: open a folder from the floating window and confirm failures show inline if the path is invalid.

## Files And Folders

- [ ] Project folder: choose, save, and open a project working folder.
- [ ] Workspace folder: add, open, delete, and undo-delete a workspace folder.
- [ ] Default folder: set, save, and open the default working folder from Settings.
- [ ] Invalid folder path: set a stale path and confirm the UI shows an open-folder failure.

## Data Operations

- [ ] Export JSON backup and confirm the selected `.json` file is written.
- [ ] Export with managed attachments: confirm a sibling `{stem}_attachments/` folder is written next to the JSON.
- [ ] Export current workspace CSV and ICS and confirm the selected files are written.
- [ ] Import JSON backup and confirm a `whattodo-pre-import-*.json` backup (and sidecar when applicable) is written before import.
- [ ] Import a backup that includes an attachment sidecar and confirm the attachment opens after restore.
- [ ] Cancel each dialog once and confirm no error is shown.
- [ ] Try importing an invalid JSON file and confirm import failure is visible.

## Auto Backup

- [ ] Enable auto backup with a folder; run now; confirm JSON (+ sidecar when attachments exist) appears.
- [ ] Set retention count/days low, create several auto backups, confirm older `whattodo-auto-*.json` and matching `_attachments` folders are pruned.
- [ ] Import a v3 backup and confirm auto-backup interval/retention preferences restore without changing the local folder path.

## E2E Automated Coverage

Automated webview smoke tests live under `e2e/` and run via Playwright against the Vite dev server only. They do NOT drive the Tauri desktop process, native notifications, tray, or file dialogs; those still require the manual steps above.

- Run `pnpm test:e2e` before a release and confirm all smoke tests pass.
- Smoke scope: app mounts without a runtime crash, document title is `WhatToDo`, primary shell landmark renders, language toggle switches visible copy, and the create-task entry point is reachable.
- Tauri-only APIs (`invoke`, `@tauri-apps/plugin-*`) are expected to be unavailable in the webview smoke run; the smoke test asserts the React tree mounts and renders either the loading, error, or shell state — not full data flow.
- When adding a new top-level surface (e.g., a new view reachable from the sidebar), add a corresponding smoke assertion in `e2e/smoke.spec.ts`.
- Desktop-specific flows (reminders, tray, floating window, folder open, JSON/CSV/ICS export dialogs) remain manual and must be exercised against `pnpm tauri dev`.

## Release Notes

- Record any failed item in `PROJECT_ANALYSIS.md` or the release checklist before publishing.
- Run `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `cd src-tauri && cargo check` after fixing desktop validation findings.
