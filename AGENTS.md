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

- `docs/AUDIT.md` — current state, known issues, and priorities. This is the authoritative status document; read it first.
- `docs/PRODUCT.md`
- `docs/DESIGN.md`
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
- For frontend UI, follow `docs/DESIGN.md`: compact product surfaces, familiar controls, 8px-or-less radius, restrained accent usage, no decorative gradients or glassmorphism.

## Reminder-Specific Notes

Reminder fields:

- `remindAt`: base reminder time.
- `snoozedUntil`: effective reminder override when present.
- `firedAt`: marks a reminder as fired.
- `enabled`: disables or enables a reminder.

Current reminder actions:

- `markReminderFired(id)`
- `markReminderFailed(id, reason)`
- `snoozeReminder(id, untilIso)`
- `disableReminder(id)`
- `createTaskReminder(taskId, offsetMinutes)`
- `updateTaskReminder(taskId, offsetMinutes)`
- `deleteReminder(id)`
- `loadReminderEvents(reminderId)`

Reminder center rules:

- Effective time is `snoozedUntil ?? remindAt`.
- Groups are failed, missed, upcoming, and fired (see `src/data/reminderCenter.ts`).
- Deleted tasks are hidden.
- Completed tasks are excluded from missed/upcoming.
- Snooze choices are fixed: 10 minutes, 1 hour, tomorrow at 09:00 local time.

Known defect: reminders are scoped to the active workspace, so reminders for other
workspaces never fire. See `FUN-009` in `docs/AUDIT.md` before touching this area.

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

Maintained in `docs/AUDIT.md`, not here. Read section 4 (P0 发货级缺陷) and section 11
(分阶段整改路线) before planning work.

Two constraints that affect almost any change:

- Section 4 P0s are fixed in 0.2.6. Do not publish a later release while any of them is open again.
- `docs/DESKTOP_VALIDATION.md` has never been executed (0/24). Anything that depends on real
  Tauri runtime behavior is unverified — treat code reading as a hypothesis, not evidence.

## Release Notes

Release scripts are in `scripts/`:

- `sync-version.mjs`
- `release-check.mjs`
- `release-build.mjs`

Before release, update `CHANGELOG.md`, run release checks, and verify updater signing secrets are present outside the repository.
