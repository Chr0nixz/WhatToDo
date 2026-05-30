# AGENTS.md

This file gives coding agents the local project rules and current context for WhatToDo.

## Project Context

WhatToDo is a local-first desktop DDL/task planner built with Tauri 2, React, TypeScript, Vite, Tailwind CSS, and SQLite.

Product principles:

- Work-first desktop UI, no marketing-style landing surfaces inside the app.
- Calm, compact, dependable task management.
- Dates, task status, priority, project, folder, and reminder state should stay visible where useful.
- Chinese and English UI must remain supported.
- LocalRepository and SqlRepository should behave consistently.

Read these docs before planning larger changes:

- `PRODUCT.md`
- `DESIGN.md`
- `PROJECT_ANALYSIS.md`
- `README.md`

## Commands

Use these checks before handoff:

```bash
pnpm test
pnpm build
cd src-tauri
cargo check
```

Use these during development:

```bash
pnpm dev
pnpm tauri dev
pnpm test:watch
```

Tauri dev uses `scripts/tauri-before-dev.mjs`, which reuses an existing Vite dev server at `http://127.0.0.1:5173` when available.

## Code Map

- `src/data/types.ts`: shared app/domain types.
- `src/data/repository.ts`: Local and SQLite repository implementations.
- `src/data/date.ts`: core date and task date helpers.
- `src/data/dateFormat.ts`: localized date formatting.
- `src/data/reminderCenter.ts`: reminder center grouping and snooze-time helpers.
- `src/hooks/useTodos.ts`: repository-backed app state and actions.
- `src/hooks/useReminders.ts`: desktop reminder tick and notification logic.
- `src/components/app`: main app views and panels.
- `src/i18n/index.ts`: all visible UI copy for Chinese and English.
- `src-tauri/src/lib.rs`: migrations, Tauri commands, tray, windows, and plugin setup.

## Implementation Rules

- Keep edits scoped to the requested behavior.
- Preserve user changes and dirty worktree state. Do not revert unrelated files.
- Prefer existing components, layout patterns, and i18n keys over new abstractions.
- Add all visible user-facing copy to `src/i18n/index.ts`.
- Keep LocalRepository and SqlRepository semantics aligned for every data operation.
- Prefer pure helper functions for non-trivial grouping, sorting, date, or state logic, then test those helpers directly.
- Avoid adding migrations unless the feature truly needs new persisted data.
- For frontend UI, follow `DESIGN.md`: compact product surfaces, familiar controls, 8px-or-less radius, restrained accent usage, no decorative gradients or glassmorphism.

## Reminder-Specific Notes

Reminder fields:

- `remindAt`: base reminder time.
- `snoozedUntil`: effective reminder override when present.
- `firedAt`: marks a reminder as fired.
- `enabled`: disables or enables a reminder.

Current reminder actions:

- `markReminderFired(id)`
- `snoozeReminder(id, untilIso)`
- `disableReminder(id)`

Reminder center rules:

- Effective time is `snoozedUntil ?? remindAt`.
- Groups are missed, upcoming, and fired.
- Deleted tasks are hidden.
- Completed tasks are excluded from missed/upcoming.
- Snooze choices are fixed: 10 minutes, 1 hour, tomorrow at 09:00 local time.

## Testing Expectations

When touching repository logic:

- Test LocalRepository behavior.
- Test SQLite behavior with mocks or a test factory when SQL semantics matter.
- Cover workspace filtering and soft-delete behavior when relevant.

When touching reminders:

- Cover due filtering, snoozed reminders, fired reminders, disabled reminders, completed tasks, deleted tasks, and failure paths where applicable.

When touching UI:

- Cover duplicate-submit prevention for forms.
- Cover inline error or feedback states.
- Cover Chinese/English-visible text when adding new copy.
- Use browser smoke verification for significant UI changes.

## Current Known Gaps

- Tauri desktop runtime validation is not fully complete.
- Reminder notification failure is not yet persisted or visible in the reminder center.
- Delete/archive actions use confirmation, not undo.
- `workspace_folders.workspace_id` still needs an index in a future performance cleanup.
- Tauri CSP and capability scope still need release-hardening.

## Release Notes

Release scripts are in `scripts/`:

- `sync-version.mjs`
- `release-check.mjs`
- `release-build.mjs`

Before release, update `CHANGELOG.md`, run release checks, and verify updater signing secrets are present outside the repository.
