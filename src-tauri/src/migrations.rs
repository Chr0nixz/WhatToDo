use rusqlite::Connection;
use std::time::{SystemTime, UNIX_EPOCH};

pub const INIT_SQL: &str = r#"
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
    deleted_at TEXT
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
    FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS settings (
    workspace_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    language TEXT NOT NULL,
    default_reminder_offset INTEGER NOT NULL,
    notifications_enabled INTEGER NOT NULL,
    close_to_tray INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
"#;

pub const ADD_PROJECT_WORKING_FOLDER_SQL: &str = r#"
ALTER TABLE projects ADD COLUMN working_folder TEXT;
"#;

pub const ADD_TASK_AND_DEFAULT_WORKING_FOLDER_SQL: &str = r#"
ALTER TABLE tasks ADD COLUMN working_folder TEXT;
ALTER TABLE settings ADD COLUMN default_working_folder TEXT;
"#;

pub const ADD_WORKSPACES_SQL: &str = r##"
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

INSERT OR IGNORE INTO workspaces
    (id, name, color, created_at, updated_at, deleted_at)
VALUES
    ('local-workspace', 'Default', '#4fb8d8', datetime('now'), datetime('now'), NULL);

CREATE INDEX IF NOT EXISTS idx_workspace_folders_workspace_id ON workspace_folders(workspace_id);
"##;

pub const ADD_SETTINGS_ACCENT_COLOR_SQL: &str = r#"
ALTER TABLE settings ADD COLUMN accent_color TEXT NOT NULL DEFAULT 'blue';
"#;

pub const ADD_WORKSPACE_QUERY_INDEXES_SQL: &str = r#"
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
"#;

pub const ADD_REMINDER_FAILURE_AND_SAVED_VIEWS_SQL: &str = r#"
ALTER TABLE reminders ADD COLUMN failed_at TEXT;
ALTER TABLE reminders ADD COLUMN last_error TEXT;
ALTER TABLE reminders ADD COLUMN last_attempted_at TEXT;

CREATE TABLE IF NOT EXISTS saved_views (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_saved_views_workspace_id ON saved_views(workspace_id);
"#;

pub const ADD_RECURRING_TASKS_SQL: &str = r#"
ALTER TABLE tasks ADD COLUMN recurrence_template_id TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_instance_date TEXT;

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
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_template_id ON tasks(recurrence_template_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_workspace_id ON recurring_task_templates(workspace_id);
"#;

pub const ADD_PERFORMANCE_INDEXES_SQL: &str = r#"
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_due_date ON tasks(workspace_id, deleted_at, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_status ON tasks(workspace_id, deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_deleted_due_date ON tasks(project_id, deleted_at, due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_task_enabled_fired ON reminders(task_id, enabled, fired_at);
"#;

pub const ADD_DEFAULT_SAVED_VIEW_ID_SQL: &str = r#"
ALTER TABLE settings ADD COLUMN default_saved_view_id TEXT;
"#;

pub const ADD_RECURRING_BY_WEEKDAY_SQL: &str = r#"
ALTER TABLE recurring_task_templates ADD COLUMN by_weekday TEXT;
"#;

pub const ADD_TASK_TAGS_AND_PARENT_SQL: &str = r#"
ALTER TABLE tasks ADD COLUMN parent_id TEXT;
ALTER TABLE tasks ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
"#;

pub const ADD_ATTACHMENTS_SQL: &str = r#"
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

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);
"#;

pub const ADD_REMINDER_EVENTS_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS reminder_events (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_events_reminder ON reminder_events(reminder_id, created_at DESC);
"#;

pub const ADD_STARTUP_TASK_QUERY_INDEXES_SQL: &str = r#"
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_created ON tasks(workspace_id, deleted_at, created_at DESC);
"#;

pub fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

pub fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    stmt.query_map([], |row| row.get::<_, String>(1))
        .map(|rows| rows.filter_map(|r| r.ok()).any(|name| name == column))
        .unwrap_or(false)
}

pub fn index_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
        [name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

pub fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    ddl_type: &str,
) -> Result<(), String> {
    if column_exists(conn, table, column) {
        return Ok(());
    }
    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {ddl_type}");
    conn.execute(&sql, [])
        .map_err(|e| format!("Failed to add column {table}.{column}: {e}"))?;
    Ok(())
}

pub fn ensure_index(conn: &Connection, name: &str, create_sql: &str) -> Result<(), String> {
    if index_exists(conn, name) {
        return Ok(());
    }
    conn.execute_batch(create_sql)
        .map_err(|e| format!("Failed to create index {name}: {e}"))?;
    Ok(())
}

pub fn apply_version_schema(conn: &Connection, version: i64) -> Result<(), String> {
    match version {
        1 => conn
            .execute_batch(INIT_SQL)
            .map_err(|e| format!("Migration v1 failed: {e}")),
        2 => ensure_column(conn, "projects", "working_folder", "TEXT"),
        3 => {
            ensure_column(conn, "tasks", "working_folder", "TEXT")?;
            ensure_column(conn, "settings", "default_working_folder", "TEXT")
        }
        4 => conn
            .execute_batch(ADD_WORKSPACES_SQL)
            .map_err(|e| format!("Migration v4 failed: {e}")),
        5 => ensure_column(
            conn,
            "settings",
            "accent_color",
            "TEXT NOT NULL DEFAULT 'blue'",
        ),
        6 => {
            ensure_index(
                conn,
                "idx_tasks_workspace_id",
                "CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);",
            )?;
            ensure_index(
                conn,
                "idx_projects_workspace_id",
                "CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);",
            )?;
            ensure_index(
                conn,
                "idx_reminders_task_id",
                "CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);",
            )
        }
        7 => {
            ensure_column(conn, "reminders", "failed_at", "TEXT")?;
            ensure_column(conn, "reminders", "last_error", "TEXT")?;
            ensure_column(conn, "reminders", "last_attempted_at", "TEXT")?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS saved_views (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    filters_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
                );",
            )
            .map_err(|e| format!("Migration v7 saved_views failed: {e}"))?;
            ensure_index(
                conn,
                "idx_saved_views_workspace_id",
                "CREATE INDEX IF NOT EXISTS idx_saved_views_workspace_id ON saved_views(workspace_id);",
            )
        }
        8 => {
            ensure_column(conn, "tasks", "recurrence_template_id", "TEXT")?;
            ensure_column(conn, "tasks", "recurrence_instance_date", "TEXT")?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS recurring_task_templates (
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
                    FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
                    FOREIGN KEY(project_id) REFERENCES projects(id)
                );",
            )
            .map_err(|e| format!("Migration v8 recurring_task_templates failed: {e}"))?;
            ensure_index(
                conn,
                "idx_tasks_recurrence_template_id",
                "CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_template_id ON tasks(recurrence_template_id);",
            )?;
            ensure_index(
                conn,
                "idx_recurring_templates_workspace_id",
                "CREATE INDEX IF NOT EXISTS idx_recurring_templates_workspace_id ON recurring_task_templates(workspace_id);",
            )
        }
        9 => conn
            .execute_batch(ADD_PERFORMANCE_INDEXES_SQL)
            .map_err(|e| format!("Migration v9 failed: {e}")),
        10 => ensure_column(conn, "settings", "default_saved_view_id", "TEXT"),
        11 => ensure_column(conn, "recurring_task_templates", "by_weekday", "TEXT"),
        12 => {
            ensure_column(conn, "tasks", "parent_id", "TEXT")?;
            ensure_column(conn, "tasks", "tags", "TEXT")?;
            ensure_index(
                conn,
                "idx_tasks_parent_id",
                "CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);",
            )
        }
        13 => conn
            .execute_batch(ADD_ATTACHMENTS_SQL)
            .map_err(|e| format!("Migration v13 failed: {e}")),
        14 => conn
            .execute_batch(ADD_REMINDER_EVENTS_SQL)
            .map_err(|e| format!("Migration v14 failed: {e}")),
        15 => {
            ensure_column(conn, "recurring_task_templates", "parent_id", "TEXT")?;
            ensure_column(conn, "recurring_task_templates", "tags", "TEXT")
        }
        16 => ensure_column(conn, "saved_views", "pinned", "INTEGER NOT NULL DEFAULT 0"),
        17 => conn
            .execute_batch(ADD_STARTUP_TASK_QUERY_INDEXES_SQL)
            .map_err(|e| format!("Migration v17 failed: {e}")),
        other => Err(format!("Unknown migration version: {other}")),
    }
}

pub fn repair_schema(conn: &Connection) -> Result<(), String> {
    for version in 1i64..=17 {
        apply_version_schema(conn, version)?;
    }
    Ok(())
}

pub fn apply_migrations(conn: &Connection, migrations: &[(i64, &str, &str)]) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _whattodo_migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )",
    )
    .map_err(|e| format!("Failed to create migration tracking table: {e}"))?;

    let applied: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT version FROM _whattodo_migrations ORDER BY version")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<Vec<i64>>();
        rows
    };

    for &(version, description, _sql) in migrations {
        if applied.contains(&version) {
            continue;
        }

        conn.execute("BEGIN TRANSACTION", [])
            .map_err(|e| format!("Failed to begin transaction for v{version}: {e}"))?;

        if let Err(e) = apply_version_schema(conn, version) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(format!("Migration v{version} ({description}) failed: {e}"));
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "0".to_string());

        if let Err(e) = conn.execute(
            "INSERT INTO _whattodo_migrations (version, description, applied_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![version, description, now],
        ) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(format!("Failed to record migration v{version}: {e}"));
        }

        conn.execute("COMMIT", [])
            .map_err(|e| format!("Failed to commit migration v{version}: {e}"))?;
    }

    Ok(())
}

pub fn infer_applied_migrations(conn: &Connection) -> Result<Vec<i64>, String> {
    let mut applied = Vec::new();

    if table_exists(conn, "projects") {
        applied.push(1);
    }
    if column_exists(conn, "projects", "working_folder") {
        applied.push(2);
    }
    if column_exists(conn, "tasks", "working_folder")
        && column_exists(conn, "settings", "default_working_folder")
    {
        applied.push(3);
    }
    if table_exists(conn, "workspaces") {
        applied.push(4);
    }
    if column_exists(conn, "settings", "accent_color") {
        applied.push(5);
    }
    if index_exists(conn, "idx_tasks_workspace_id") {
        applied.push(6);
    }
    if column_exists(conn, "reminders", "failed_at")
        && column_exists(conn, "reminders", "last_error")
        && column_exists(conn, "reminders", "last_attempted_at")
        && table_exists(conn, "saved_views")
    {
        applied.push(7);
    }
    if column_exists(conn, "tasks", "recurrence_template_id")
        && column_exists(conn, "tasks", "recurrence_instance_date")
        && table_exists(conn, "recurring_task_templates")
    {
        applied.push(8);
    }
    if index_exists(conn, "idx_tasks_workspace_deleted_due_date") {
        applied.push(9);
    }
    if column_exists(conn, "settings", "default_saved_view_id") {
        applied.push(10);
    }
    if column_exists(conn, "recurring_task_templates", "by_weekday") {
        applied.push(11);
    }
    if column_exists(conn, "tasks", "parent_id") && column_exists(conn, "tasks", "tags") {
        applied.push(12);
    }
    if table_exists(conn, "attachments") {
        applied.push(13);
    }
    if table_exists(conn, "reminder_events") {
        applied.push(14);
    }
    if column_exists(conn, "recurring_task_templates", "parent_id")
        && column_exists(conn, "recurring_task_templates", "tags")
    {
        applied.push(15);
    }
    if column_exists(conn, "saved_views", "pinned") {
        applied.push(16);
    }
    if index_exists(conn, "idx_tasks_workspace_deleted_created") {
        applied.push(17);
    }

    Ok(applied)
}

pub fn bootstrap_migration_tracking(conn: &Connection, applied: &[i64]) -> Result<(), String> {
    let all_migrations: Vec<(i64, &str)> = vec![
        (1, "create_initial_whattodo_tables"),
        (2, "add_project_working_folder"),
        (3, "add_task_and_default_working_folder"),
        (4, "add_workspaces_and_workspace_folders"),
        (5, "add_settings_accent_color"),
        (6, "add_workspace_query_indexes"),
        (7, "add_reminder_failure_and_saved_views"),
        (8, "add_recurring_tasks"),
        (9, "add_performance_indexes"),
        (10, "add_default_saved_view_id"),
        (11, "add_recurring_by_weekday"),
        (12, "add_task_tags_and_parent"),
        (13, "add_attachments"),
        (14, "add_reminder_events"),
        (15, "add_recurring_template_tags_parent"),
        (16, "add_saved_view_pinned"),
        (17, "add_startup_task_query_indexes"),
    ];

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _whattodo_migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )",
    )
    .map_err(|e| e.to_string())?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    for &(version, description) in &all_migrations {
        if applied.contains(&version) {
            conn.execute(
                "INSERT OR IGNORE INTO _whattodo_migrations (version, description, applied_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![version, description, now],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
