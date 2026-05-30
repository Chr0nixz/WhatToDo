use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::config::Color,
    webview::PageLoadEvent,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_window_state::StateFlags;

const DB_URL: &str = "sqlite:ddl_todo.db";
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

struct CloseToTray(Arc<AtomicBool>);

#[tauri::command]
fn set_close_to_tray(state: tauri::State<CloseToTray>, value: bool) {
    state.0.store(value, Ordering::Relaxed);
}

#[tauri::command]
async fn open_workspace_window(app: tauri::AppHandle, workspace_id: String, title: String) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_whattodo_tables",
            sql: INIT_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_project_working_folder",
            sql: ADD_PROJECT_WORKING_FOLDER_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_task_and_default_working_folder",
            sql: ADD_TASK_AND_DEFAULT_WORKING_FOLDER_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_workspaces_and_workspace_folders",
            sql: ADD_WORKSPACES_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_settings_accent_color",
            sql: ADD_SETTINGS_ACCENT_COLOR_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_workspace_query_indexes",
            sql: ADD_WORKSPACE_QUERY_INDEXES_SQL,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(CloseToTray(Arc::new(AtomicBool::new(true))))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_close_to_tray, open_workspace_window])
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
