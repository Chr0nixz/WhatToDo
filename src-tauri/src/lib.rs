use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::config::Color,
    webview::PageLoadEvent,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_window_state::StateFlags;

const DB_FILE: &str = "ddl_todo.db";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbInitStatus {
    state: String,
    reason: Option<String>,
    db_path: Option<String>,
    backup_path: Option<String>,
}

impl DbInitStatus {
    fn ready(db_path: &Path) -> Self {
        Self {
            state: "ready".to_string(),
            reason: None,
            db_path: Some(db_path.to_string_lossy().to_string()),
            backup_path: None,
        }
    }

    fn failed(
        reason: impl Into<String>,
        db_path: Option<&Path>,
        backup_path: Option<&Path>,
    ) -> Self {
        Self {
            state: "failed".to_string(),
            reason: Some(reason.into()),
            db_path: db_path.map(|p| p.to_string_lossy().to_string()),
            backup_path: backup_path.map(|p| p.to_string_lossy().to_string()),
        }
    }

    fn reset_completed(db_path: &Path, backup_path: &Path) -> Self {
        Self {
            state: "reset_completed".to_string(),
            reason: None,
            db_path: Some(db_path.to_string_lossy().to_string()),
            backup_path: Some(backup_path.to_string_lossy().to_string()),
        }
    }
}

struct DbInitState(Mutex<DbInitStatus>);

const INIT_SQL: &str = r#"
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

const ADD_PROJECT_WORKING_FOLDER_SQL: &str = r#"
ALTER TABLE projects ADD COLUMN working_folder TEXT;
"#;

const ADD_TASK_AND_DEFAULT_WORKING_FOLDER_SQL: &str = r#"
ALTER TABLE tasks ADD COLUMN working_folder TEXT;
ALTER TABLE settings ADD COLUMN default_working_folder TEXT;
"#;

const ADD_WORKSPACES_SQL: &str = r##"
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

const ADD_SETTINGS_ACCENT_COLOR_SQL: &str = r#"
ALTER TABLE settings ADD COLUMN accent_color TEXT NOT NULL DEFAULT 'blue';
"#;

const ADD_WORKSPACE_QUERY_INDEXES_SQL: &str = r#"
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
"#;

const ADD_REMINDER_FAILURE_AND_SAVED_VIEWS_SQL: &str = r#"
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

const ADD_RECURRING_TASKS_SQL: &str = r#"
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

const ADD_PERFORMANCE_INDEXES_SQL: &str = r#"
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_due_date ON tasks(workspace_id, deleted_at, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_deleted_status ON tasks(workspace_id, deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_deleted_due_date ON tasks(project_id, deleted_at, due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_task_enabled_fired ON reminders(task_id, enabled, fired_at);
"#;

const ADD_DEFAULT_SAVED_VIEW_ID_SQL: &str = r#"
ALTER TABLE settings ADD COLUMN default_saved_view_id TEXT;
"#;

const ADD_RECURRING_BY_WEEKDAY_SQL: &str = r#"
ALTER TABLE recurring_task_templates ADD COLUMN by_weekday TEXT;
"#;

const ADD_TASK_TAGS_AND_PARENT_SQL: &str = r#"
ALTER TABLE tasks ADD COLUMN parent_id TEXT;
ALTER TABLE tasks ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
"#;

const ADD_ATTACHMENTS_SQL: &str = r#"
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

const ADD_REMINDER_EVENTS_SQL: &str = r#"
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

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn floating_log_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("floating-window.log"))
}

fn append_floating_log(path: &Path, message: impl AsRef<str>) {
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        let _ = writeln!(file, "[{timestamp}] {}", message.as_ref());
    }
}

fn validate_text_file_path(path: &str, allowed_extensions: &[&str]) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required.".to_string());
    }

    let path = PathBuf::from(trimmed);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "File extension is required.".to_string())?;

    if !allowed_extensions.contains(&extension.as_str()) {
        return Err("Unsupported file extension.".to_string());
    }

    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal is not allowed.".to_string());
        }
    }

    Ok(path)
}

fn validate_workspace_id(workspace_id: &str) -> Result<String, String> {
    if workspace_id.is_empty() || workspace_id.len() > 128 {
        return Err("Invalid workspace id.".to_string());
    }

    if !workspace_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("Invalid workspace id.".to_string());
    }

    Ok(workspace_id.to_string())
}

fn sanitize_window_title(title: &str) -> String {
    let title = title
        .chars()
        .filter(|ch| !ch.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(80)
        .collect::<String>();

    if title.is_empty() {
        "Workspace".to_string()
    } else {
        title
    }
}

struct CloseToTray(Arc<AtomicBool>);

#[tauri::command]
fn set_close_to_tray(state: tauri::State<CloseToTray>, value: bool) {
    state.0.store(value, Ordering::Relaxed);
}

/// Rebuild the tray menu with localized labels. Called from the frontend
/// whenever the user changes the UI language so the tray stays in sync.
#[tauri::command]
fn update_tray_menu(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let (open_label, quit_label) = match language.as_str() {
        "zh" => ("打开 WhatToDo", "退出"),
        _ => ("Open WhatToDo", "Quit"),
    };

    let open = MenuItem::with_id(&app, "open", open_label, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(&app, "quit", quit_label, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(&app, &[&open, &quit]).map_err(|e| e.to_string())?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let path = validate_text_file_path(&path, &["json"])?;
    if !path.is_file() {
        return Err("File does not exist.".to_string());
    }

    fs::read_to_string(path).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = validate_text_file_path(&path, &["json", "csv", "ics", "txt"])?;

    // Atomic write: write to a sibling temp file, then rename. This prevents
    // data corruption if the process is killed mid-write (e.g. system crash
    // during a backup export). On Windows, rename over an existing file is
    // atomic when both files are on the same volume.
    let dir = path
        .parent()
        .ok_or_else(|| "Invalid file path.".to_string())?;
    let tmp = dir.join(format!(
        ".{}~",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("whattodo_tmp")
    ));

    fs::write(&tmp, &contents).map_err(|e| format!("Failed to write temp file: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| {
        // Best-effort cleanup of the temp file if rename failed.
        let _ = fs::remove_file(&tmp);
        format!("Failed to rename temp file: {e}")
    })?;
    Ok(())
}

#[tauri::command]
async fn open_workspace_window(
    app: tauri::AppHandle,
    workspace_id: String,
    title: String,
) -> Result<(), String> {
    let workspace_id = validate_workspace_id(&workspace_id)?;
    let title = sanitize_window_title(&title);
    let log_path = floating_log_path(&app);
    let legacy_label = format!("workspace-{}", workspace_id);
    let label_prefix = format!("workspace-{}--", workspace_id);
    let previous_label_prefix = format!("workspace-{}-", workspace_id);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let label = format!("{}{}", label_prefix, nonce);
    let workspace_id_json = serde_json::to_string(&workspace_id).map_err(|err| err.to_string())?;
    let init_script = format!(
        r#"
window.__WHATTODO_FLOATING_WINDOW__ = true;
window.__WHATTODO_FLOATING_WORKSPACE_ID__ = {};
window.__DDL_TODO_FLOATING_WINDOW__ = true;
window.__DDL_TODO_FLOATING_WORKSPACE_ID__ = {};
(function () {{
  function show(message) {{
    var root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = '<div style="box-sizing:border-box;min-height:100vh;padding:16px;display:flex;align-items:center;justify-content:center;background:#f4f8fa;color:#263238;font:13px system-ui, sans-serif;"><div style="max-width:320px;border:1px solid #c7d4dc;background:#edf4f7;border-radius:8px;padding:12px;line-height:1.45;"><strong>WhatToDo floating window</strong><br><span>' + String(message).replace(/[<>&]/g, function (ch) {{ return {{'<':'&lt;','>':'&gt;','&':'&amp;'}}[ch]; }}) + '</span></div></div>';
  }}
  window.addEventListener('error', function (event) {{
    show(event.message || 'Script error');
  }});
  window.addEventListener('unhandledrejection', function (event) {{
    show((event.reason && (event.reason.message || String(event.reason))) || 'Unhandled promise rejection');
  }});
  document.addEventListener('DOMContentLoaded', function () {{
    setTimeout(function () {{
      var root = document.getElementById('root');
      if (root && !root.hasChildNodes()) {{
        show('Loading workspace...');
      }}
    }}, 300);
  }});
}})();
"#,
        workspace_id_json, workspace_id_json
    );

    for (existing_label, window) in app.webview_windows() {
        if existing_label == legacy_label
            || existing_label.starts_with(&label_prefix)
            || existing_label.starts_with(&previous_label_prefix)
        {
            if let Some(path) = &log_path {
                append_floating_log(path, format!("destroy stale window label={existing_label}"));
            }
            let _ = window.destroy();
        }
    }

    let window_url = format!("index.html?floating=1&workspaceId={}", workspace_id);
    if let Some(path) = &log_path {
        append_floating_log(
            path,
            format!("open requested label={label} workspace_id={workspace_id} url={window_url}"),
        );
    }

    let navigation_log_path = log_path.clone();
    let load_log_path = log_path.clone();

    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(window_url.into()))
        .title(format!("WhatToDo - {}", title))
        .inner_size(380.0, 560.0)
        .min_inner_size(320.0, 96.0)
        .decorations(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .closable(true)
        .always_on_top(true)
        .center()
        .focused(true)
        .skip_taskbar(false)
        .visible(false)
        .on_navigation(move |url| {
            if let Some(path) = &navigation_log_path {
                append_floating_log(path, format!("navigation url={url}"));
            }
            true
        })
        .on_page_load(move |window, payload| {
            if let Some(path) = &load_log_path {
                append_floating_log(
                    path,
                    format!("page_load event={:?} url={}", payload.event(), payload.url()),
                );
            }

            if matches!(payload.event(), PageLoadEvent::Finished) {
                if let Some(path) = &load_log_path {
                    let eval_log_path = path.clone();
                    let _ = window.eval_with_callback(
                        r#"
JSON.stringify({
  href: window.location.href,
  readyState: document.readyState,
  hasRoot: Boolean(document.getElementById('root')),
  rootChildCount: document.getElementById('root') ? document.getElementById('root').childNodes.length : -1,
  bodyText: document.body ? document.body.innerText.slice(0, 240) : ''
})
"#,
                        move |result| {
                            append_floating_log(&eval_log_path, format!("page_eval result={result}"));
                        },
                    );

                    let delayed_window = window.clone();
                    let delayed_log_path = path.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(3));
                        let _ = delayed_window.eval_with_callback(
                            r#"
JSON.stringify({
  href: window.location.href,
  readyState: document.readyState,
  hasRoot: Boolean(document.getElementById('root')),
  rootChildCount: document.getElementById('root') ? document.getElementById('root').childNodes.length : -1,
  bodyText: document.body ? document.body.innerText.slice(0, 240) : ''
})
"#,
                            move |result| {
                                append_floating_log(
                                    &delayed_log_path,
                                    format!("delayed_page_eval result={result}"),
                                );
                            },
                        );
                    });
                }
            }
        })
        .initialization_script(init_script)
        .build()
        .map(|window| {
            let _ = window.center();
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            let focus_window = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(250));
                let _ = focus_window.set_always_on_top(false);
                let _ = focus_window.set_always_on_top(true);
                let _ = focus_window.center();
                let _ = focus_window.show();
                let _ = focus_window.set_focus();
            });
        })
        .map_err(|err| err.to_string())
}

fn resolve_db_path() -> Result<PathBuf, String> {
    let data_dir = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .map_err(|_| "APPDATA environment variable not set".to_string())
    } else if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(|home| {
                PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
            })
            .map_err(|_| "HOME environment variable not set".to_string())
    } else {
        std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|_| {
                std::env::var("HOME")
                    .map(|home| PathBuf::from(home).join(".local").join("share"))
                    .map_err(|_| {
                        "Neither XDG_DATA_HOME nor HOME environment variable set".to_string()
                    })
            })
    }?;

    Ok(data_dir.join("com.chronix.whattodo").join(DB_FILE))
}

fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    // table name comes from our migration constants only — not user input.
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    stmt.query_map([], |row| row.get::<_, String>(1))
        .map(|rows| rows.filter_map(|r| r.ok()).any(|name| name == column))
        .unwrap_or(false)
}

fn index_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
        [name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

fn ensure_column(
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

fn ensure_index(conn: &Connection, name: &str, create_sql: &str) -> Result<(), String> {
    if index_exists(conn, name) {
        return Ok(());
    }
    conn.execute_batch(create_sql)
        .map_err(|e| format!("Failed to create index {name}: {e}"))?;
    Ok(())
}

/// Apply one migration version idempotently via ensure_* (no string-based "already applied").
fn apply_version_schema(conn: &Connection, version: i64) -> Result<(), String> {
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
            .map_err(|e| format!("Migration v8 templates failed: {e}"))?;
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
        other => Err(format!("Unknown migration version: {other}")),
    }
}

/// Heal databases that recorded a version while schema objects were still missing.
fn repair_schema(conn: &Connection) -> Result<(), String> {
    for version in 1i64..=16 {
        apply_version_schema(conn, version)?;
    }
    Ok(())
}

fn apply_migrations(conn: &Connection, migrations: &[(i64, &str, &str)]) -> Result<(), String> {
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

fn infer_applied_migrations(conn: &Connection) -> Result<Vec<i64>, String> {
    let mut applied = Vec::new();

    if table_exists(conn, "projects") {
        applied.push(1);
    }
    if column_exists(conn, "projects", "working_folder") {
        applied.push(2);
    }
    // Require both columns so incomplete v3 is not treated as applied.
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

    Ok(applied)
}

fn bootstrap_migration_tracking(conn: &Connection, applied: &[i64]) -> Result<(), String> {
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

fn database_sidecar_paths(db_path: &Path) -> [PathBuf; 3] {
    [
        db_path.to_path_buf(),
        db_path.with_extension("db-wal"),
        db_path.with_extension("db-shm"),
    ]
}

fn reset_database(db_path: &Path) {
    for path in database_sidecar_paths(db_path) {
        let _ = fs::remove_file(&path);
    }
}

fn verify_backup_integrity(backup_path: &Path) -> Result<(), String> {
    let conn = Connection::open(backup_path)
        .map_err(|e| format!("Failed to open backup for integrity check: {e}"))?;
    let result: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("Failed to run integrity check: {e}"))?;
    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!("Backup integrity check failed: {result}"))
    }
}

fn backup_database_verified(db_path: &Path) -> Result<PathBuf, String> {
    if !db_path.exists() {
        return Err("Database file does not exist; cannot create a backup.".to_string());
    }

    let data_dir = db_path
        .parent()
        .ok_or_else(|| "Database path has no parent directory.".to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to read system time: {e}"))?
        .as_secs();
    let backup_path = data_dir.join(format!("ddl_todo_backup_{ts}.db"));

    // Checkpoint WAL into the main db file so the backup is complete.
    if let Ok(conn) = Connection::open(db_path) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        drop(conn);
    }

    fs::copy(db_path, &backup_path).map_err(|e| format!("Failed to copy database backup: {e}"))?;

    if let Err(err) = verify_backup_integrity(&backup_path) {
        let _ = fs::remove_file(&backup_path);
        return Err(err);
    }

    Ok(backup_path)
}

fn apply_connection_pragmas(conn: &Connection) {
    if let Err(e) = conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA busy_timeout=5000;
         PRAGMA foreign_keys=ON;",
    ) {
        eprintln!("Warning: failed to apply connection PRAGMAs: {e}");
    }
}

fn open_and_migrate(db_path: &Path, migrations: &[(i64, &str, &str)]) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {e}"))?;
    apply_connection_pragmas(&conn);
    apply_migrations(&conn, migrations)?;

    let has_tracking = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_whattodo_migrations'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_tracking {
        let applied = infer_applied_migrations(&conn)?;
        bootstrap_migration_tracking(&conn, &applied)?;
    }

    // Heal DBs that recorded a version while schema objects were still missing (ARC-002).
    repair_schema(&conn)?;

    Ok(())
}

/// Initialize the database without deleting it on failure.
fn init_database_at(db_path: &Path, migrations: &[(i64, &str, &str)]) -> DbInitStatus {
    if let Some(parent) = db_path.parent() {
        if let Err(e) = create_dir_all(parent) {
            return DbInitStatus::failed(
                format!("Failed to create data directory: {e}"),
                Some(db_path),
                None,
            );
        }
    }

    match open_and_migrate(db_path, migrations) {
        Ok(()) => DbInitStatus::ready(db_path),
        Err(err) => {
            eprintln!("Database initialization failed (original database preserved): {err}");
            DbInitStatus::failed(err, Some(db_path), None)
        }
    }
}

fn init_database(migrations: &[(i64, &str, &str)]) -> DbInitStatus {
    match resolve_db_path() {
        Ok(db_path) => init_database_at(&db_path, migrations),
        Err(err) => DbInitStatus::failed(err, None, None),
    }
}

fn confirm_reset_database_at(
    db_path: &Path,
    backup_path: &Path,
    migrations: &[(i64, &str, &str)],
) -> Result<DbInitStatus, String> {
    if !backup_path.is_file() {
        return Err(
            "Verified backup file is missing. Create a backup before resetting.".to_string(),
        );
    }
    verify_backup_integrity(backup_path)?;

    reset_database(db_path);
    open_and_migrate(db_path, migrations)?;
    Ok(DbInitStatus::reset_completed(db_path, backup_path))
}

fn app_migrations() -> Vec<(i64, &'static str, &'static str)> {
    vec![
        (1, "create_initial_whattodo_tables", INIT_SQL),
        (
            2,
            "add_project_working_folder",
            ADD_PROJECT_WORKING_FOLDER_SQL,
        ),
        (
            3,
            "add_task_and_default_working_folder",
            ADD_TASK_AND_DEFAULT_WORKING_FOLDER_SQL,
        ),
        (
            4,
            "add_workspaces_and_workspace_folders",
            ADD_WORKSPACES_SQL,
        ),
        (
            5,
            "add_settings_accent_color",
            ADD_SETTINGS_ACCENT_COLOR_SQL,
        ),
        (
            6,
            "add_workspace_query_indexes",
            ADD_WORKSPACE_QUERY_INDEXES_SQL,
        ),
        (
            7,
            "add_reminder_failure_and_saved_views",
            ADD_REMINDER_FAILURE_AND_SAVED_VIEWS_SQL,
        ),
        (8, "add_recurring_tasks", ADD_RECURRING_TASKS_SQL),
        (9, "add_performance_indexes", ADD_PERFORMANCE_INDEXES_SQL),
        (
            10,
            "add_default_saved_view_id",
            ADD_DEFAULT_SAVED_VIEW_ID_SQL,
        ),
        (11, "add_recurring_by_weekday", ADD_RECURRING_BY_WEEKDAY_SQL),
        (12, "add_task_tags_and_parent", ADD_TASK_TAGS_AND_PARENT_SQL),
        (13, "add_attachments", ADD_ATTACHMENTS_SQL),
        (14, "add_reminder_events", ADD_REMINDER_EVENTS_SQL),
        (15, "add_recurring_template_tags_parent", ""),
        (16, "add_saved_view_pinned", ""),
    ]
}

#[tauri::command]
fn join_backup_path(folder: String, filename: String) -> Result<String, String> {
    let folder = folder.trim();
    let filename = filename.trim();
    if folder.is_empty() {
        return Err("Backup folder is required.".to_string());
    }
    if filename.is_empty() {
        return Err("Backup filename is required.".to_string());
    }
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Backup filename must be a plain file name.".to_string());
    }
    Ok(PathBuf::from(folder)
        .join(filename)
        .to_string_lossy()
        .to_string())
}

fn sanitize_attachment_filename(filename: &str) -> Result<String, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err("Attachment filename is required.".to_string());
    }
    let name = Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Attachment filename must be a plain file name.".to_string())?;
    if name == "." || name == ".." || name.contains("..") {
        return Err("Attachment filename must be a plain file name.".to_string());
    }
    Ok(name.to_string())
}

fn sanitize_attachment_id(attachment_id: &str) -> Result<String, String> {
    let trimmed = attachment_id.trim();
    if trimmed.is_empty() {
        return Err("Attachment id is required.".to_string());
    }
    if trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
        || Path::new(trimmed).components().count() != 1
    {
        return Err("Attachment id must be a plain identifier.".to_string());
    }
    Ok(trimmed.to_string())
}

fn managed_attachments_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("attachments"))
        .map_err(|err| format!("Unable to resolve app data directory: {err}"))
}

fn is_path_within_root(path: &Path, root: &Path) -> bool {
    let Ok(canonical_path) = path.canonicalize() else {
        return false;
    };
    let Ok(canonical_root) = root.canonicalize() else {
        return false;
    };
    canonical_path.starts_with(&canonical_root)
}

fn is_path_within_root_lenient(path: &Path, root: &Path) -> bool {
    if is_path_within_root(path, root) {
        return true;
    }
    // Fall back when the file does not exist yet or canonicalize fails.
    path.starts_with(root)
}

#[tauri::command]
fn copy_managed_attachment(
    app: tauri::AppHandle,
    source_path: String,
    attachment_id: String,
    filename: String,
) -> Result<String, String> {
    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err("Source attachment file was not found.".to_string());
    }
    let id = sanitize_attachment_id(&attachment_id)?;
    let safe_filename = sanitize_attachment_filename(&filename)?;
    let root = managed_attachments_root(&app)?;
    let dest_dir = root.join(&id);
    create_dir_all(&dest_dir)
        .map_err(|err| format!("Unable to create attachment directory: {err}"))?;
    let dest = dest_dir.join(&safe_filename);
    fs::copy(&source, &dest).map_err(|err| format!("Unable to copy attachment: {err}"))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_managed_attachment(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Attachment path is required.".to_string());
    }
    let target = PathBuf::from(trimmed);
    let root = managed_attachments_root(&app)?;
    if !root.exists() {
        return Err("Managed attachments directory does not exist.".to_string());
    }
    if !is_path_within_root_lenient(&target, &root) {
        return Err(
            "Refusing to delete a path outside the managed attachments directory.".to_string(),
        );
    }
    if target.is_file() {
        fs::remove_file(&target)
            .map_err(|err| format!("Unable to delete attachment file: {err}"))?;
    }
    if let Some(parent) = target.parent() {
        if is_path_within_root_lenient(parent, &root) && parent != root {
            let _ = fs::remove_dir(parent);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentSidecarItem {
    id: String,
    filename: String,
    #[serde(default)]
    source_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentSidecarImportResult {
    id: String,
    path: String,
}

fn sidecar_dir_for_backup_json(backup_json_path: &Path) -> Result<PathBuf, String> {
    let parent = backup_json_path
        .parent()
        .ok_or_else(|| "Invalid backup JSON path.".to_string())?;
    let stem = backup_json_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Backup JSON stem is required.".to_string())?;
    Ok(parent.join(format!("{stem}_attachments")))
}

fn remove_dir_all_best_effort(path: &Path) {
    if path.exists() {
        let _ = fs::remove_dir_all(path);
    }
}

#[tauri::command]
fn export_attachment_sidecar(
    backup_json_path: String,
    items: Vec<AttachmentSidecarItem>,
) -> Result<Vec<String>, String> {
    let json_path = PathBuf::from(backup_json_path.trim());
    if json_path.as_os_str().is_empty() {
        return Err("Backup JSON path is required.".to_string());
    }
    let sidecar_root = sidecar_dir_for_backup_json(&json_path)?;
    create_dir_all(&sidecar_root)
        .map_err(|err| format!("Unable to create attachment sidecar directory: {err}"))?;

    let mut exported = Vec::new();
    for item in items {
        let id = match sanitize_attachment_id(&item.id) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let filename = match sanitize_attachment_filename(&item.filename) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let source = PathBuf::from(item.source_path.trim());
        if !source.is_file() {
            continue;
        }
        let dest_dir = sidecar_root.join(&id);
        if create_dir_all(&dest_dir).is_err() {
            continue;
        }
        let dest = dest_dir.join(&filename);
        if fs::copy(&source, &dest).is_ok() {
            exported.push(id);
        }
    }
    Ok(exported)
}

#[tauri::command]
fn import_attachment_sidecar(
    app: tauri::AppHandle,
    backup_json_path: String,
    items: Vec<AttachmentSidecarItem>,
) -> Result<Vec<AttachmentSidecarImportResult>, String> {
    let json_path = PathBuf::from(backup_json_path.trim());
    if json_path.as_os_str().is_empty() {
        return Err("Backup JSON path is required.".to_string());
    }
    let sidecar_root = sidecar_dir_for_backup_json(&json_path)?;
    if !sidecar_root.exists() {
        return Ok(Vec::new());
    }

    let managed_root = managed_attachments_root(&app)?;
    create_dir_all(&managed_root)
        .map_err(|err| format!("Unable to create managed attachments directory: {err}"))?;

    let mut restored = Vec::new();
    for item in items {
        let id = match sanitize_attachment_id(&item.id) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let filename = match sanitize_attachment_filename(&item.filename) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let source = sidecar_root.join(&id).join(&filename);
        if !source.is_file() {
            continue;
        }
        let dest_dir = managed_root.join(&id);
        if create_dir_all(&dest_dir).is_err() {
            continue;
        }
        let dest = dest_dir.join(&filename);
        if fs::copy(&source, &dest).is_ok() {
            restored.push(AttachmentSidecarImportResult {
                id,
                path: dest.to_string_lossy().to_string(),
            });
        }
    }
    Ok(restored)
}

#[tauri::command]
fn cleanup_auto_backups(
    folder: String,
    retention_count: u32,
    retention_days: u32,
) -> Result<u32, String> {
    let folder = folder.trim();
    if folder.is_empty() {
        return Err("Backup folder is required.".to_string());
    }
    let dir = PathBuf::from(folder);
    if !dir.is_dir() {
        return Err("Backup folder does not exist.".to_string());
    }

    let mut backups = Vec::new();
    let entries =
        fs::read_dir(&dir).map_err(|err| format!("Unable to read backup folder: {err}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("whattodo-auto-") || !name.ends_with(".json") || !path.is_file() {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        backups.push((path, modified));
    }

    backups.sort_by_key(|b| std::cmp::Reverse(b.1));
    let now = std::time::SystemTime::now();
    let max_age = std::time::Duration::from_secs(u64::from(retention_days.max(1)) * 24 * 60 * 60);
    let keep_count = retention_count.max(1) as usize;
    let mut deleted = 0u32;

    for (index, (path, modified)) in backups.into_iter().enumerate() {
        let too_old = now
            .duration_since(modified)
            .map(|age| age > max_age)
            .unwrap_or(false);
        let over_count = index >= keep_count;
        if !too_old && !over_count {
            continue;
        }
        let sidecar = match sidecar_dir_for_backup_json(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if fs::remove_file(&path).is_ok() {
            deleted += 1;
        }
        remove_dir_all_best_effort(&sidecar);
    }

    Ok(deleted)
}

#[tauri::command]
fn get_db_init_status(state: tauri::State<'_, DbInitState>) -> Result<DbInitStatus, String> {
    state
        .0
        .lock()
        .map(|guard| guard.clone())
        .map_err(|_| "Database init state lock is poisoned.".to_string())
}

#[tauri::command]
fn backup_database_for_recovery(
    state: tauri::State<'_, DbInitState>,
) -> Result<DbInitStatus, String> {
    let mut status = state
        .0
        .lock()
        .map_err(|_| "Database init state lock is poisoned.".to_string())?;

    let db_path = status
        .db_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "Database path is unknown; cannot create a backup.".to_string())?;

    let backup_path = backup_database_verified(&db_path)?;
    status.backup_path = Some(backup_path.to_string_lossy().to_string());
    if status.state != "reset_completed" {
        status.state = "failed".to_string();
    }
    Ok(status.clone())
}

#[tauri::command]
fn retry_database_migration(state: tauri::State<'_, DbInitState>) -> Result<DbInitStatus, String> {
    let mut status = state
        .0
        .lock()
        .map_err(|_| "Database init state lock is poisoned.".to_string())?;

    let db_path = status
        .db_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "Database path is unknown; cannot retry migration.".to_string())?;

    let migrations = app_migrations();
    match open_and_migrate(&db_path, &migrations) {
        Ok(()) => {
            *status = DbInitStatus {
                state: "ready".to_string(),
                reason: None,
                db_path: Some(db_path.to_string_lossy().to_string()),
                backup_path: status.backup_path.clone(),
            };
            Ok(status.clone())
        }
        Err(err) => {
            status.state = "failed".to_string();
            status.reason = Some(err.clone());
            Err(err)
        }
    }
}

#[tauri::command]
fn confirm_reset_database(state: tauri::State<'_, DbInitState>) -> Result<DbInitStatus, String> {
    let mut status = state
        .0
        .lock()
        .map_err(|_| "Database init state lock is poisoned.".to_string())?;

    let db_path = status
        .db_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "Database path is unknown; cannot reset.".to_string())?;
    let backup_path = status
        .backup_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| {
            "No verified backup is available. Create a backup before resetting the database."
                .to_string()
        })?;

    let migrations = app_migrations();
    let next = confirm_reset_database_at(&db_path, &backup_path, &migrations)?;
    *status = next;
    Ok(status.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = app_migrations();
    let db_init = init_database(&migrations);

    tauri::Builder::default()
        .manage(CloseToTray(Arc::new(AtomicBool::new(true))))
        .manage(DbInitState(Mutex::new(db_init)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all())
                .with_filter(|label| label == "main")
                .build(),
        )
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open WhatToDo", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("WhatToDo")
                .menu(&menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }

            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main_window(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    show_main_window(tray.app_handle());
                }
            })
            .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            update_tray_menu,
            open_workspace_window,
            read_text_file,
            write_text_file,
            join_backup_path,
            copy_managed_attachment,
            delete_managed_attachment,
            export_attachment_sidecar,
            import_attachment_sidecar,
            cleanup_auto_backups,
            get_db_init_status,
            backup_database_for_recovery,
            retry_database_migration,
            confirm_reset_database
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }

                let close_to_tray = window
                    .app_handle()
                    .state::<CloseToTray>()
                    .0
                    .load(Ordering::Relaxed);

                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        apply_migrations, apply_version_schema, backup_database_verified, cleanup_auto_backups,
        column_exists, confirm_reset_database_at, database_sidecar_paths, ensure_column,
        export_attachment_sidecar, init_database_at, is_path_within_root_lenient, join_backup_path,
        repair_schema, sanitize_attachment_filename, sanitize_attachment_id,
        sidecar_dir_for_backup_json, table_exists, validate_text_file_path, INIT_SQL,
    };
    use rusqlite::Connection;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    #[test]
    fn validate_text_file_path_accepts_valid_json_path() {
        let result = validate_text_file_path("/tmp/backup.json", &["json"]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().to_str().unwrap(), "/tmp/backup.json");
    }

    #[test]
    fn validate_text_file_path_rejects_empty_path() {
        let result = validate_text_file_path("   ", &["json"]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Path is required.");
    }

    #[test]
    fn validate_text_file_path_rejects_missing_extension() {
        let result = validate_text_file_path("/tmp/backup", &["json"]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "File extension is required.");
    }

    #[test]
    fn validate_text_file_path_rejects_unsupported_extension() {
        let result = validate_text_file_path("/tmp/backup.exe", &["json", "csv", "ics", "txt"]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Unsupported file extension.");
    }

    #[test]
    fn validate_text_file_path_rejects_path_traversal() {
        let cases = [
            "../secret.json",
            "data/../outside.json",
            "/tmp/../etc/passwd.json",
            "a/b/../../escape.json",
        ];
        for case in cases {
            let result = validate_text_file_path(case, &["json"]);
            assert!(result.is_err(), "expected {case} to be rejected");
            assert_eq!(result.unwrap_err(), "Path traversal is not allowed.");
        }
    }

    #[test]
    fn validate_text_file_path_accepts_absolute_and_relative_paths_without_traversal() {
        let cases = [
            "/tmp/data.json",
            "data/backup.json",
            "./local.json",
            "backup.json",
        ];
        for case in cases {
            let result = validate_text_file_path(case, &["json"]);
            assert!(result.is_ok(), "expected {case} to be accepted");
        }
    }

    fn seed_db(db_path: &Path) {
        let conn = Connection::open(db_path).expect("open seed db");
        conn.execute_batch(INIT_SQL).expect("seed init sql");
        conn.execute(
            "INSERT INTO projects (id, workspace_id, name, color, status, created_at, updated_at)
             VALUES ('p1', 'w1', 'Demo', '#000', 'active', '0', '0')",
            [],
        )
        .expect("seed project");
    }

    fn assert_db_files_present(db_path: &Path) {
        assert!(db_path.exists(), "main database should still exist");
        for path in database_sidecar_paths(db_path) {
            // wal/shm may be absent depending on journal mode; only assert main file.
            let _ = path;
        }
    }

    #[test]
    fn backup_failure_does_not_delete_database() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);

        let missing = dir.path().join("missing").join("ddl_todo.db");
        let err = backup_database_verified(&missing).expect_err("backup should fail");
        assert!(err.contains("does not exist") || err.contains("Failed to copy"));
        assert_db_files_present(&db_path);
    }

    #[test]
    fn migration_failure_preserves_database() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);

        let migrations = [
            (1, "create_initial_whattodo_tables", INIT_SQL),
            (999, "unknown_broken", "ignored"),
        ];
        let status = init_database_at(&db_path, &migrations);
        assert_eq!(status.state, "failed");
        assert!(status.reason.is_some());
        assert_db_files_present(&db_path);

        let conn = Connection::open(&db_path).expect("reopen preserved db");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("count projects");
        assert_eq!(count, 1);
    }

    #[test]
    fn confirm_reset_rejects_missing_backup() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);
        let missing_backup = dir.path().join("no_such_backup.db");

        let migrations = [(1, "create_initial_whattodo_tables", INIT_SQL)];
        let err = confirm_reset_database_at(&db_path, &missing_backup, &migrations)
            .expect_err("reset without backup must fail");
        assert!(err.contains("missing") || err.contains("Backup"));
        assert_db_files_present(&db_path);

        let conn = Connection::open(&db_path).expect("reopen preserved db");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("count projects");
        assert_eq!(count, 1);
    }

    #[test]
    fn verified_backup_allows_reset() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);

        let backup = backup_database_verified(&db_path).expect("verified backup");
        assert!(backup.exists());

        let migrations = [(1, "create_initial_whattodo_tables", INIT_SQL)];
        let status = confirm_reset_database_at(&db_path, &backup, &migrations).expect("reset");
        assert_eq!(status.state, "reset_completed");
        assert_eq!(
            status.backup_path.as_deref(),
            Some(backup.to_string_lossy().as_ref())
        );

        assert!(backup.exists());
        let backup_conn = Connection::open(&backup).expect("open backup");
        let backup_count: i64 = backup_conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("backup projects");
        assert_eq!(backup_count, 1);

        let conn = Connection::open(&db_path).expect("open reset db");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("reset projects");
        assert_eq!(count, 0);
        let _ = fs::metadata(&db_path).expect("reset db exists");
    }

    #[test]
    fn ensure_column_completes_partial_v3() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);

        let conn = Connection::open(&db_path).expect("open");
        ensure_column(&conn, "tasks", "working_folder", "TEXT").expect("add tasks.working_folder");
        assert!(column_exists(&conn, "tasks", "working_folder"));
        assert!(!column_exists(&conn, "settings", "default_working_folder"));

        apply_version_schema(&conn, 3).expect("apply v3");
        assert!(column_exists(&conn, "tasks", "working_folder"));
        assert!(column_exists(&conn, "settings", "default_working_folder"));

        apply_version_schema(&conn, 3).expect("re-apply v3");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 1);
    }

    #[test]
    fn repair_schema_heals_recorded_v7_missing_saved_views() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);

        let conn = Connection::open(&db_path).expect("open");
        apply_version_schema(&conn, 4).expect("workspaces");
        ensure_column(&conn, "reminders", "failed_at", "TEXT").expect("failed_at");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS _whattodo_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );
            INSERT INTO _whattodo_migrations (version, description, applied_at)
            VALUES (7, 'add_reminder_failure_and_saved_views', '0');",
        )
        .expect("mark v7");
        assert!(!table_exists(&conn, "saved_views"));

        repair_schema(&conn).expect("repair");
        assert!(table_exists(&conn, "saved_views"));
        assert!(column_exists(&conn, "reminders", "last_error"));
        assert!(column_exists(&conn, "reminders", "last_attempted_at"));
    }

    #[test]
    fn apply_migrations_records_v3_only_after_both_columns() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("ddl_todo.db");
        seed_db(&db_path);

        let conn = Connection::open(&db_path).expect("open");
        let migrations = [
            (1, "create_initial_whattodo_tables", INIT_SQL),
            (3, "add_task_and_default_working_folder", ""),
        ];
        apply_migrations(&conn, &migrations).expect("migrate");
        assert!(column_exists(&conn, "tasks", "working_folder"));
        assert!(column_exists(&conn, "settings", "default_working_folder"));
        let recorded: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _whattodo_migrations WHERE version = 3",
                [],
                |row| row.get(0),
            )
            .expect("count v3");
        assert_eq!(recorded, 1);
    }

    #[test]
    fn join_backup_path_preserves_unc_prefix() {
        let joined = join_backup_path(
            r"\\server\share\backups".to_string(),
            "whattodo.json".to_string(),
        )
        .expect("join");
        assert!(joined.contains(r"\\server\share") || joined.contains("//server/share"));
        assert!(joined.ends_with("whattodo.json"));
    }

    #[test]
    fn sidecar_dir_for_backup_json_uses_stem_suffix() {
        let path = PathBuf::from("/tmp/whattodo-auto-1.json");
        let sidecar = sidecar_dir_for_backup_json(&path).expect("sidecar");
        assert!(sidecar.ends_with("whattodo-auto-1_attachments"));
    }

    #[test]
    fn export_attachment_sidecar_copies_existing_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let json_path = dir.path().join("whattodo-backup.json");
        fs::write(&json_path, "{}").expect("json");
        let source = dir.path().join("source.txt");
        fs::write(&source, "hello").expect("source");

        let exported = export_attachment_sidecar(
            json_path.to_string_lossy().to_string(),
            vec![super::AttachmentSidecarItem {
                id: "att_1".to_string(),
                filename: "source.txt".to_string(),
                source_path: source.to_string_lossy().to_string(),
            }],
        )
        .expect("export");
        assert_eq!(exported, vec!["att_1".to_string()]);
        let copied = sidecar_dir_for_backup_json(&json_path)
            .expect("sidecar")
            .join("att_1")
            .join("source.txt");
        assert_eq!(fs::read_to_string(copied).expect("read"), "hello");
    }

    #[test]
    fn cleanup_auto_backups_respects_retention_count() {
        let dir = tempfile::tempdir().expect("tempdir");
        for i in 0..5 {
            let name = format!("whattodo-auto-{i}.json");
            let path = dir.path().join(&name);
            fs::write(&path, "{}").expect("write");
            let sidecar = dir.path().join(format!("whattodo-auto-{i}_attachments"));
            fs::create_dir_all(&sidecar).expect("mkdir");
            fs::write(sidecar.join("marker.txt"), "x").expect("marker");
            std::thread::sleep(Duration::from_millis(15));
        }
        let deleted = cleanup_auto_backups(dir.path().to_string_lossy().to_string(), 2, 3650)
            .expect("cleanup");
        assert_eq!(deleted, 3);
        let remaining_json = fs::read_dir(dir.path())
            .expect("read")
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext == "json")
            })
            .count();
        assert_eq!(remaining_json, 2);
    }

    #[test]
    fn sanitize_attachment_filename_strips_path_components() {
        assert_eq!(
            sanitize_attachment_filename(r"C:\temp\notes.pdf").expect("ok"),
            "notes.pdf"
        );
        assert_eq!(
            sanitize_attachment_filename("folder/notes.pdf").expect("ok"),
            "notes.pdf"
        );
        assert!(sanitize_attachment_filename("").is_err());
        assert!(sanitize_attachment_filename("..").is_err());
    }

    #[test]
    fn sanitize_attachment_id_rejects_traversal() {
        assert_eq!(
            sanitize_attachment_id("attachment_1").expect("ok"),
            "attachment_1"
        );
        assert!(sanitize_attachment_id("../escape").is_err());
        assert!(sanitize_attachment_id("a/b").is_err());
        assert!(sanitize_attachment_id("").is_err());
    }

    #[test]
    fn managed_path_prefix_rejects_outside_root() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path().join("attachments");
        fs::create_dir_all(&root).expect("mkdir");
        let inside = root.join("attachment_1").join("file.txt");
        fs::create_dir_all(inside.parent().unwrap()).expect("mkdir id");
        fs::write(&inside, b"ok").expect("write");
        let outside = dir.path().join("other.txt");
        fs::write(&outside, b"no").expect("write");

        assert!(is_path_within_root_lenient(&inside, &root));
        assert!(!is_path_within_root_lenient(&outside, &root));
    }
}
