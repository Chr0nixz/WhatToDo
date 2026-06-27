# Changelog

## 0.2.0

- Adds multi-status tasks (todo, in progress, completed, cancelled) and subtask support via parent-child relationships.
- Adds tag management for tasks with any/all/none matching in filters.
- Adds file attachments to tasks with local storage and metadata tracking.
- Adds advanced filter system with composable AND/OR/negate condition groups.
- Adds yearly recurrence frequency and byWeekday rules for recurring templates.
- Adds quick-add parsing that extracts dates, projects, priorities, and tags from natural-language input.
- Adds backup schema validation and auto-backup hook for safer data management.
- Adds ICS import schema support for calendar-based task creation.
- Adds ErrorBoundary and ImportPreviewDialog components for better error handling and import workflows.
- Adds Zustand-based task store (useTodoStore) alongside existing hooks for flexible state access.
- Expands SettingsView with new preference sections and TaskDetailPane with richer metadata display.
- Adds TaskList virtualization and repository performance tests for large-data scenarios.
- Sets up Playwright E2E testing infrastructure and expands unit test coverage across filters, recurrence, and repository.

## 0.1.6

- Adds command palette with global shortcuts and fuzzy search for fast navigation across views.
- Adds project and workspace edit dialogs for inline metadata editing.
- Adds saved views support for reusable filter presets.
- Adds automatic database reset and user notification when migration fails, replacing the previous hard crash.
- Extracts AppShell into its own component and improves overview filtering.
- Adds i18n extensions for dynamic translation support.

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
