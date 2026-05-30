# Desktop Validation Checklist

Use this checklist before a desktop release or after changes to reminders, tray behavior, file commands, folders, updater, or floating windows.

## Environment

- Run `pnpm tauri dev` from the project root.
- Use a real desktop session, not only the browser dev server.
- Start from a workspace with at least one task due today, one future task, one working folder, and reminders enabled.

## Reminder Flow

- Notifications permission allowed: create a task with a reminder due within a few minutes and confirm one system notification appears.
- Notifications permission denied: deny permission and confirm notifications are disabled in settings with visible feedback.
- Snooze: snooze a missed reminder for 10 minutes and confirm it does not immediately retrigger.
- Retry: force or mock a failed reminder, retry it from Reminder Center, and confirm fired or failed state updates visibly.
- Complete from reminder: complete a task from Reminder Center and confirm it leaves missed/upcoming groups.

## Tray And Window Behavior

- Close to tray enabled: close the main window and confirm the app remains available from the tray.
- Tray restore: click the tray icon or Open WhatToDo menu item and confirm the main window returns focused.
- Close to tray disabled: disable the setting and confirm closing the main window exits normally.
- Floating window: open a workspace floating window, collapse and expand it, toggle always-on-top, and close it.
- Floating window folder: open a folder from the floating window and confirm failures show inline if the path is invalid.

## Files And Folders

- Project folder: choose, save, and open a project working folder.
- Workspace folder: add, open, delete, and undo-delete a workspace folder.
- Default folder: set, save, and open the default working folder from Settings.
- Invalid folder path: set a stale path and confirm the UI shows an open-folder failure.

## Data Operations

- Export JSON backup and confirm the selected `.json` file is written.
- Export current workspace CSV and ICS and confirm the selected files are written.
- Import JSON backup and confirm a `whattodo-pre-import-*.json` backup is written before import.
- Cancel each dialog once and confirm no error is shown.
- Try importing an invalid JSON file and confirm import failure is visible.

## Release Notes

- Record any failed item in `PROJECT_ANALYSIS.md` or the release checklist before publishing.
- Run `pnpm test`, `pnpm build`, and `cd src-tauri && cargo check` after fixing desktop validation findings.
