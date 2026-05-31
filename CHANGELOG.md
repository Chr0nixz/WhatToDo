# Changelog

## 0.1.5

- Adds performance baseline scripts and a 20k-task fixture generator for large-data validation.
- Splits frontend bundles into lazy views and vendor chunks, removing the previous main-chunk size warning.
- Adds list windowing, load-more flows, app indexes, and on-demand loading for large task sets.
- Adds repository pagination and SQLite performance indexes for task-heavy views.
- Moves product, design, desktop, project, and performance documentation into `docs/`.

## 0.1.4

- Adds recurring task templates with daily, weekly, and monthly generation flows.
- Adds JSON backup import/export plus workspace CSV and ICS export support.
- Adds recovery center coverage for deleted tasks, deleted workspace folders, and archived projects.
- Improves reminder failure tracking, retry behavior, reminder editing, and localized reminder date display.
- Tightens Tauri file command validation, capability scope, desktop validation docs, and regression tests.

## 0.1.3

- Adds quick task entry parsing and richer overview filtering for faster task triage.
- Adds undo affordances for task deletion, workspace-folder deletion, and project archiving.
- Improves reminder failure tracking, reminder center behavior, and related regression coverage.
- Tightens desktop polish, settings interactions, dependency versions, and release documentation.

## 0.1.2

- Adds the Tauri updater integration and Settings page update workflow.
- Adds release version sync, release validation, signed updater build scripts, and GitHub Actions draft release publishing.
- Adds reminder center, reminder snooze/disable flows, desktop stability improvements, i18n/date formatting, and regression tests.

## 0.1.1

- Establishes the first updater-ready release line for WhatToDo.
- Adds the release checklist, version synchronization script, GitHub Release workflow, and in-app update panel.
