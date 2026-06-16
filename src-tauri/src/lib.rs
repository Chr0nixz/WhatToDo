use std::fs::{create_dir_all, OpenOptions};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use rusqlite::Connection;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::config::Color,
    webview::PageLoadEvent,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_window_state::StateFlags;

const DB_FILE: &str = "ddl_todo.db";

struct DbResetFlag(bool);

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
    fs::write(path, contents).map_err(|err| err.to_string())
}

#[tauri::command]
async fn open_workspace_window(app: tauri::AppHandle, workspace_id: String, title: String) -> Result<(), String> {
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
            .map(|home| PathBuf::from(home).join("Library").join("Application Support"))
            .map_err(|_| "HOME environment variable not set".to_string())
    } else {
        std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|_| {
                std::env::var("HOME")
                    .map(|home| PathBuf::from(home).join(".local").join("share"))
                    .map_err(|_| "Neither XDG_DATA_HOME nor HOME environment variable set".to_string())
            })
    }?;

    Ok(data_dir.join("com.chronix.whattodo").join(DB_FILE))
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

    for &(version, description, sql) in migrations {
        if applied.contains(&version) {
            continue;
        }

        conn.execute("BEGIN TRANSACTION", [])
            .map_err(|e| format!("Failed to begin transaction for v{version}: {e}"))?;

        if let Err(e) = conn.execute_batch(sql) {
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

    let has_table = |name: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [name],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    let has_column = |table: &str, column: &str| -> bool {
        let sql = format!("PRAGMA table_info({table})");
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(_) => return false,
        };
        stmt.query_map([], |row| row.get::<_, String>(1))
            .map(|rows| rows.filter_map(|r| r.ok()).any(|name| name == column))
            .unwrap_or(false)
    };

    if has_table("projects") {
        applied.push(1);
    }
    if has_column("projects", "working_folder") {
        applied.push(2);
    }
    if has_column("tasks", "working_folder") {
        applied.push(3);
    }
    if has_table("workspaces") {
        applied.push(4);
    }
    if has_column("settings", "accent_color") {
        applied.push(5);
    }

    let has_idx = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_tasks_workspace_id'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if has_idx {
        applied.push(6);
    }

    if has_column("reminders", "failed_at") {
        applied.push(7);
    }
    if has_column("tasks", "recurrence_template_id") {
        applied.push(8);
    }

    let has_perf_idx = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_tasks_workspace_deleted_due_date'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if has_perf_idx {
        applied.push(9);
    }
    if has_column("settings", "default_saved_view_id") {
        applied.push(10);
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

fn reset_database(db_path: &Path) {
    for ext in ["", "-wal", "-shm"] {
        let path = db_path.with_extension(
            if ext.is_empty() {
                "db".to_string()
            } else {
                format!("db{}", ext)
            },
        );
        let _ = fs::remove_file(&path);
    }
}

fn init_database(migrations: &[(i64, &str, &str)]) -> Result<bool, String> {
    let db_path = resolve_db_path()?;

    if let Some(parent) = db_path.parent() {
        create_dir_all(parent).map_err(|e| format!("Failed to create data directory: {e}"))?;
    }

    match Connection::open(&db_path) {
        Ok(conn) => match apply_migrations(&conn, migrations) {
            Ok(()) => {
                let has_tracking = conn
                    .query_row(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_whattodo_migrations'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap_or(0)
                    > 0;

                if has_tracking {
                    return Ok(false);
                }

                let applied = infer_applied_migrations(&conn)?;
                bootstrap_migration_tracking(&conn, &applied)?;
                Ok(false)
            }
            Err(err) => {
                eprintln!("Migration failed: {err}. Resetting database.");
                drop(conn);
                reset_database(&db_path);
                let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
                apply_migrations(&conn, migrations)?;
                Ok(true)
            }
        },
        Err(err) => {
            eprintln!("Failed to open database: {err}. Resetting.");
            reset_database(&db_path);
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            apply_migrations(&conn, migrations)?;
            Ok(true)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations: Vec<(i64, &str, &str)> = vec![
        (1, "create_initial_whattodo_tables", INIT_SQL),
        (2, "add_project_working_folder", ADD_PROJECT_WORKING_FOLDER_SQL),
        (3, "add_task_and_default_working_folder", ADD_TASK_AND_DEFAULT_WORKING_FOLDER_SQL),
        (4, "add_workspaces_and_workspace_folders", ADD_WORKSPACES_SQL),
        (5, "add_settings_accent_color", ADD_SETTINGS_ACCENT_COLOR_SQL),
        (6, "add_workspace_query_indexes", ADD_WORKSPACE_QUERY_INDEXES_SQL),
        (7, "add_reminder_failure_and_saved_views", ADD_REMINDER_FAILURE_AND_SAVED_VIEWS_SQL),
        (8, "add_recurring_tasks", ADD_RECURRING_TASKS_SQL),
        (9, "add_performance_indexes", ADD_PERFORMANCE_INDEXES_SQL),
        (10, "add_default_saved_view_id", ADD_DEFAULT_SAVED_VIEW_ID_SQL),
    ];

    let db_reset = match init_database(&migrations) {
        Ok(reset) => reset,
        Err(err) => {
            eprintln!("Fatal: database initialization failed after reset: {err}");
            false
        }
    };

    tauri::Builder::default()
        .manage(CloseToTray(Arc::new(AtomicBool::new(true))))
        .manage(DbResetFlag(db_reset))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .build(),
        )
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

            if app.state::<DbResetFlag>().0 {
                let _ = app.emit("db-reset", ());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            open_workspace_window,
            read_text_file,
            write_text_file
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
