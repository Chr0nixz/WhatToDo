-- Keep in sync with src-tauri/src/lib.rs INIT_SQL + apply_version_schema v2–v16.
-- Tests that open a real SQLite database must execute this file at startup.

PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    status TEXT NOT NULL,
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT,
    working_folder TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL,
    due_time TEXT,
    timezone TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    working_folder TEXT,
    recurrence_template_id TEXT,
    recurrence_instance_date TEXT,
    parent_id TEXT,
    tags TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    offset_minutes INTEGER,
    snoozed_until TEXT,
    fired_at TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    failed_at TEXT,
    last_error TEXT,
    last_attempted_at TEXT,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS settings (
    workspace_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    language TEXT NOT NULL,
    default_reminder_offset INTEGER NOT NULL,
    notifications_enabled INTEGER NOT NULL,
    close_to_tray INTEGER NOT NULL,
    accent_color TEXT NOT NULL DEFAULT 'blue',
    default_working_folder TEXT,
    default_saved_view_id TEXT
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS workspace_folders (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS saved_views (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS recurring_task_templates (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    project_id TEXT,
    working_folder TEXT,
    due_time TEXT,
    timezone TEXT NOT NULL,
    priority TEXT NOT NULL,
    reminder_offset INTEGER,
    frequency TEXT NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    anchor_date TEXT NOT NULL,
    end_date TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    by_weekday TEXT,
    parent_id TEXT,
    tags TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS reminder_events (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_workspace_id ON saved_views(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_template_id ON tasks(recurrence_template_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_workspace_id ON recurring_task_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_due_date ON tasks(workspace_id, deleted_at, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_status ON tasks(workspace_id, deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_deleted_due_date ON tasks(project_id, deleted_at, due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_task_enabled_fired ON reminders(task_id, enabled, fired_at);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_reminder_events_reminder ON reminder_events(reminder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_folders_workspace_id ON workspace_folders(workspace_id);

INSERT OR IGNORE INTO workspaces
    (id, name, color, created_at, updated_at, deleted_at)
VALUES
    ('local-workspace', 'Default', '#4fb8d8', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', NULL);

INSERT OR IGNORE INTO settings
    (workspace_id, theme, accent_color, language, default_reminder_offset, default_working_folder, default_saved_view_id, notifications_enabled, close_to_tray)
VALUES
    ('local-workspace', 'system', 'blue', 'zh', 30, NULL, NULL, 0, 1);
