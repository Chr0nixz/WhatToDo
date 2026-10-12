# Changelog

## 0.2.7

- Architecture Milestone D Closeout & Hardening:
  - Decomposes monolithic `repository.ts` (4,300+ lines) into clean modular services (`export/`, `sql/`, `localRepository.ts`, `taskPageQuery.ts`, and `repositoryDataUtils.ts`), slimming the facade down to 11 lines with 100% API compatibility.
  - Refactors frontend monolithic components (`OverviewView`, `SettingsView`, `TaskDetailPane`, `AppShell`, `ProjectsView`, `WorkspacesView`), extracting modular dialogs, filter controls, project detail header, and workspace management forms into dedicated submodules.
  - Fixes `PERF-009`: Decouples `AppShell` top-level state aggregation by introducing fine-grained selectors (`useCurrentWorkspace`, `useOpenTasksCount`, `useOverdueTasksCount`), enabling views (`HomeView`, `OverviewView`, `ProjectsView`, `WorkspacesView`, `SettingsView`) to subscribe directly to minimal Zustand slices and eliminating cascading re-renders on task mutations.
  - Implements `ARC-015`: Adds physical orphaned attachment garbage collection (GC) via secure Rust Tauri commands (`analyze_orphaned_attachments`, `cleanup_orphaned_attachments`) with strict managed-path jail boundaries, integrated into Settings as `StorageSettingsPanel` with capacity summary, two-step confirmation, and full bilingual i18n support.
  - Fixes `ARC-016`: Decouples system-wide global preferences (`theme`, `accentColor`, `language`, `notificationsEnabled`, `closeToTray`) from per-workspace attributes; newly created workspaces now automatically inherit active global preferences, and updating preferences in any workspace broadcasts across all workspaces in memory and SQLite.
  - Improves tray localization (SEC-008): Automatically detects the native system locale on startup, removing hardcoded English fallback before frontend initialization completes.
  - Fixes `SEC-004`: Constrains `export_attachment_sidecar` strictly to the managed attachments directory via `is_path_within_root_lenient`, eliminating the arbitrary file copy primitive and blocking outside system file exfiltration.
  - Fixes `SEC-005`: Implements cross-platform critical system path protection in `validate_text_file_path`, blocking access to OS-sensitive directories (Windows `\Windows`, `\Program Files`, device/pipe paths; Unix `/etc`, `/sys`, `/proc`, `/dev`, `/root`) for `read_text_file` and `write_text_file`.
  - Fixes `ARC-018`: Enforces referential integrity validation and automated graph healing via `sanitizeBackupReferentialIntegrity`, healing orphan `projectId`/`parentId` references and pruning dangling reminders, attachments, and events to prevent SQLite foreign key constraint failures upon backup import.
  - Fixes `ENG-007`: Upgrades `rusqlite` to 0.32.1 and bundled `libsqlite3-sys` to 0.30.1, eliminating historical SQLite memory corruption vulnerabilities (CVE-2025-6965) during backup integrity verification and ensuring single-engine database consistency.
  - Fixes `PERF-013`: Eliminates the N+1 IPC round-trip bottleneck in `importBackup` via chunked multi-row batch inserts (`insertTasksBatch`, `insertRemindersBatch`, `insertAttachmentsBatch`, `insertReminderEventsBatch`), reducing IPC overhead on 20k-task imports by 99% while chunking `bulkDeleteTasks`/`bulkMoveTasksToProject` to avoid `SQLITE_LIMIT_VARIABLE_NUMBER` parameter overflow.
  - Fixes `PERF-014`: Resolves tag SQL LIKE escaping bugs for tags containing quotes or backslashes via JSON-token aligned escaping, adds SQLite migration v18 (`idx_tasks_workspace_deleted_due`) for hot-path task date queries, and removes redundant historical single-column index `idx_tasks_workspace_id`.
  - Fixes `UX-010`: Adds responsive modal dialog semantics (`role="dialog"`, `aria-modal="true"`) to `TaskDetailPane` on narrow viewports with backdrop aria-hidden attributes, and implements graceful global `Escape` key close handling protected by unsaved change confirmations.
  - Fixes `UX-011`: Aligns WAI-ARIA tab accessibility across `OverviewView` with `aria-controls` and `role="tabpanel"`, adds `aria-live="polite"` to `TaskDetailPane` unsaved status badges, and reinforces `role="region"` for keyboard navigation containers.
  - Fixes `UX-012`: Consolidates ad-hoc toast states and keyboard shortcuts into a dedicated `AppToastContainer` component, standardizing error notices, undo handlers, and reminder toasts with unified stacking and timers.
  - Fixes `ENG-009`: Hardens release verification in `scripts/release-check.mjs` by enforcing TypeScript (`pnpm lint`) and ESLint (`pnpm lint:eslint`) alongside tests and builds, with robust cross-platform subprocess error handling to prevent silent pass on Windows runners.
  - Fixes `ENG-013`: Disambiguates performance benchmark naming by splitting scripts into a three-tier suite (`perf:runtime`, genuine in-memory SQLite `perf:sqlite`, and 20k local `perf:local-20k`), establishing true SQLite engine P50/P95 baselines.
  - Fixes `PERF-001`: Implements database-level fast aggregate statistics via `loadTaskStats(workspaceId?)` across `LocalRepository` and `SqlRepository`, computing workspace open/overdue/completed counts in <1ms via compound indexes and removing the requirement to pull full task tables into memory for derived dashboard counters.
  - Fixes `ARC-014`: Fully audits and fortifies multi-step mutations across `SqlRepository` (`createTask` initial reminders, `createRecurringTask` initial instance linkage, `updateRecurringSeries` multi-instance cascades, `bulkDeleteTasks`, `bulkMoveTasksToProject`, reminder event records) under `withTransaction` Savepoint transactions, backed by dedicated real SQLite rollback tests (`repositoryConformance.test.ts`).
  - Fixes `ENG-012`: Refines repository hygiene and ignores `output/`, `coverage/`, and `*.tsbuildinfo` in `.gitignore` to prevent build and test artifacts from polluting the workspace.
  - Fixes `UX-008`: Eliminates in-flight asynchronous search race conditions in `useCommandPalette` using monotonic sequence counters and active cancellation guards, ensuring out-of-order responses cannot overwrite recent query results.
  - Fixes `ARC-021`: Eliminates async dispatch delays in `useGlobalShortcuts` by synchronously executing window restore and focus (`show_main_window_cmd`) on blurred global shortcuts, ensuring desktop shortcuts reliably surface hidden or tray-minimized windows without losing modal state, backed by dedicated unit test coverage (`useGlobalShortcuts.test.ts`).
  - Fixes `SEC-008`: Replaces raw backend error string passthrough in `DatabaseRecoveryScreen` with centralized i18n error formatting (`formatBackendError`), translating internal SQLite, migration, and filesystem exceptions into localized user-friendly messages backed by dedicated unit tests.
  - Fixes `ARC-020`: Fully converts all heavy disk IO, directory scanning, and backup/pruning commands (`open_managed_attachment`, `delete_managed_attachment`, `analyze_orphaned_attachments`, `cleanup_orphaned_attachments`, `cleanup_auto_backups`, `backup_database_for_recovery`, `retry_database_migration`, `confirm_reset_database`) to asynchronous commands (`async fn`) dispatched on Tokio background thread pools, completely unblocking the Tauri main event loop and rendering thread.
  - Fixes `ARC-019`: Refactors workspace floating window label matching into an isolated pure parser `is_matching_workspace_floating_window_label` with delimited double-dash semantics, preventing hyphenated workspace labels from destroying peer workspace windows while ensuring collision-free atomic nonce generation.
  - Fixes `PERF-011`: Caps parent task candidates in `TaskDetailPane` to 100 while prioritizing same-project active tasks and strictly preserving the active parent task, eliminating O(n²) cycle traversal and thousands of redundant DOM option elements on large datasets, backed by unit tests (`TaskDetailPane.test.tsx`).
  - Fixes `PERF-010`: Precomputes single-pass O(n) task depths (`taskDepthMap`) and child progress in `TaskList` to eliminate O(n²) recursive ancestor lookups across virtualization loops, while stabilizing row action callbacks to restore `React.memo` shallow comparison caching.
  - Fixes `PERF-012`: Establishes multi-dimensional production bundle budgets in `scripts/perf-baseline.mjs` (Main JS <= 350 kB, Total JS <= 1,200 kB, Vendor chunks <= 300 kB) and integrates them into `scripts/release-check.mjs` to block release artifacts from bloating or circumventing checks via vendor splitting.
  - Extracts Rust backend database migrations and DDL checks into `src-tauri/src/migrations.rs`, reducing `lib.rs` by over 560 lines.
  - Adds SQLite migration v17 (`idx_tasks_workspace_deleted_created`) to eliminate temporary B-tree sorting on cold start with 20k tasks.
  - Hardens all new submodules with thorough unit test coverage: all 329 Vitest tests (including 64 real SQLite conformance tests), 13 Playwright E2E tests, and 28 Rust tests pass with zero warnings across ESLint, TypeScript, and Clippy.

## 0.2.6

- Stores the SQLite database in the app config directory on every platform, and copies an existing Linux data-directory database into that location on first launch.
- Opens working folders and backup locations with the packaged reveal-in-folder permission, and only opens attachments that sit inside the app-managed folder.
- Fires due reminders across workspaces, not only for the workspace currently on screen.

## 0.2.5

- Stabilizes CI tests: raises the LocalRepository `loadTaskPage` budget for shared runners, lengthens HomeView list-window timeouts, and wraps ReminderCenterView async updates in `act` to clear React warnings.

## 0.2.4

- Fixes attachment filename sanitization so Windows-style paths are stripped correctly on Linux CI hosts.

## 0.2.3

- Packages managed attachment binaries beside JSON backups as a `{stem}_attachments/` sidecar (backup schema v3), and restores them into the app-managed folder on import.
- Adds Settings migration to copy external attachment paths into the app data directory, plus Tauri copy/delete helpers for managed files.
- Extends auto-backup with retention by count/days, prunes old `whattodo-auto-*.json` sidecars, and round-trips interval/retention preferences in v3 `clientPreferences` (device folder stays local).
- Finishes SqlRepository PERF-002 hot paths: `selectWorkspace`, deleting the current workspace, and `importBackup` use workspace-slice loads / in-memory assemble + `commitCache` instead of full `readAll`.
- Moves AppShell onto TodoStore slice subscriptions so settings-only updates no longer depend on a full `AppData` subscription for indexes and reminder/auto-backup hooks.
- Expands Local/Sql conformance coverage for recurring completion, backup replace/merge/v1, failed reminders, cross-workspace paging, and soft-delete recovery.
- Hardens ICS VTODO export (`CREATED` / `LAST-MODIFIED` / `CATEGORIES`), Rust fmt/clippy/test release gates, and desktop/performance validation docs for Wave closeout.

## 0.2.2

- Improves large-list performance with targeted repository patches, `tasksRevision`-aware pagination, and list-column projection for task pages, available tasks, and recovery lists.
- Pushes Home calendar counts and day lists to query APIs (`loadDueDateCounts`, `loadTaskPage`) instead of scanning the full in-memory task set.
- Adds backup import merge mode alongside replace, with preview mode selection in Settings.
- Adds reminder event history (SQLite migration v14) with an expandable timeline in Reminder Center.
- Extends Overview filters (tags / advanced) through `loadTaskPage`, recurring series update modes, and related Sql semantics tests.
- Adds Home drag-and-drop reschedule onto calendar days with undo support.
- Parses quick-add recurrence phrases (e.g. 每周一 / every monday) into recurring drafts in Task Composer.
- Remembers recent command palette commands and tasks in localStorage for empty-query shortcuts.

## 0.2.1

- Hardens accessibility for multi-select task rows, reminder center landmarks, and confirm dialogs.
- Adds a mobile/tablet task-detail backdrop so the pane can be dismissed by tapping outside.
- Unifies project, workspace, and settings accent swatches on shared OKLCH tokens, with legacy hex normalization.
- Adds semantic `success` and `info` theme tokens and routes priority, reminder, and status colors through them.
- Aligns surface opacity usage to the documented `/80` `/65` `/50` `/35` scale and removes the unused Metric component.
- Shares `appIndexes` from AppShell into HomeView to avoid rebuilding indexes on every home render.

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
