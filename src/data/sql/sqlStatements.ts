import type { SqliteClient } from "../sqliteClient";
import { boolToInt, serializeByWeekday, serializeTags } from "../repositoryMappers";
import type {
  Attachment,
  Project,
  RecurringTaskTemplate,
  Reminder,
  ReminderEvent,
  ReminderEventType,
  SavedTaskView,
  Settings,
  Task,
  Workspace,
  WorkspaceFolder,
} from "../types";

export type DatabaseHandle = SqliteClient;

export const insertTask = (db: DatabaseHandle, task: Task) =>
  db.execute(
    `INSERT INTO tasks
     (id, workspace_id, project_id, working_folder, title, notes, due_date, due_time, timezone, priority, status, completed_at, created_at, updated_at, deleted_at, recurrence_template_id, recurrence_instance_date, parent_id, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.workspaceId,
      task.projectId,
      task.workingFolder,
      task.title,
      task.notes,
      task.dueDate,
      task.dueTime,
      task.timezone,
      task.priority,
      task.status,
      task.completedAt,
      task.createdAt,
      task.updatedAt,
      task.deletedAt,
      task.recurrenceTemplateId,
      task.recurrenceInstanceDate,
      task.parentId,
      serializeTags(task.tags),
    ],
  );

export const insertAttachment = (db: DatabaseHandle, attachment: Attachment) =>
  db.execute(
    `INSERT INTO attachments (id, task_id, filename, path, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      attachment.id,
      attachment.task_id,
      attachment.filename,
      attachment.path,
      attachment.mimeType,
      attachment.size,
      attachment.createdAt,
    ],
  );

export const insertRecurringTaskTemplate = (db: DatabaseHandle, template: RecurringTaskTemplate) =>
  db.execute(
    `INSERT INTO recurring_task_templates
     (id, workspace_id, title, notes, project_id, working_folder, due_time, timezone, priority, reminder_offset, frequency, interval, by_weekday, anchor_date, end_date, enabled, created_at, updated_at, deleted_at, parent_id, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      template.id,
      template.workspaceId,
      template.title,
      template.notes,
      template.projectId,
      template.workingFolder,
      template.dueTime,
      template.timezone,
      template.priority,
      template.reminderOffset,
      template.frequency,
      template.interval,
      serializeByWeekday(template.byWeekday),
      template.anchorDate,
      template.endDate,
      boolToInt(template.enabled),
      template.createdAt,
      template.updatedAt,
      template.deletedAt,
      template.parentId,
      serializeTags(template.tags),
    ],
  );

export const insertSettings = (db: DatabaseHandle, workspaceId: string, settings: Settings) =>
  db.execute(
    `INSERT OR IGNORE INTO settings
     (workspace_id, theme, accent_color, language, default_reminder_offset, default_working_folder, default_saved_view_id, notifications_enabled, close_to_tray)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workspaceId,
      settings.theme,
      settings.accentColor,
      settings.language,
      settings.defaultReminderOffset,
      settings.defaultWorkingFolder,
      settings.defaultSavedViewId,
      boolToInt(settings.notificationsEnabled),
      boolToInt(settings.closeToTray),
    ],
  );

export const insertReminder = (db: DatabaseHandle, reminder: Reminder) =>
  db.execute(
    `INSERT INTO reminders
     (id, task_id, remind_at, offset_minutes, snoozed_until, fired_at, failed_at, last_error, last_attempted_at, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.taskId,
      reminder.remindAt,
      reminder.offsetMinutes,
      reminder.snoozedUntil,
      reminder.firedAt,
      reminder.failedAt,
      reminder.lastError,
      reminder.lastAttemptedAt,
      boolToInt(reminder.enabled),
    ],
  );

export const insertReminderEvent = (db: DatabaseHandle, event: ReminderEvent) =>
  db.execute(
    `INSERT INTO reminder_events (id, reminder_id, task_id, event_type, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.id, event.reminderId, event.taskId, event.eventType, event.detail, event.createdAt],
  );

export const rowToReminderEvent = (row: Record<string, unknown>): ReminderEvent => ({
  id: String(row.id),
  reminderId: String(row.reminder_id),
  taskId: String(row.task_id),
  eventType: String(row.event_type) as ReminderEventType,
  detail: row.detail == null ? null : String(row.detail),
  createdAt: String(row.created_at),
});

export const upsertWorkspace = (db: DatabaseHandle, workspace: Workspace) =>
  db.execute(
    `INSERT INTO workspaces (id, name, color, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [workspace.id, workspace.name, workspace.color, workspace.createdAt, workspace.updatedAt, workspace.deletedAt],
  );

export const upsertWorkspaceFolder = (db: DatabaseHandle, folder: WorkspaceFolder) =>
  db.execute(
    `INSERT INTO workspace_folders (id, workspace_id, name, path, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       name = excluded.name,
       path = excluded.path,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [folder.id, folder.workspaceId, folder.name, folder.path, folder.createdAt, folder.updatedAt, folder.deletedAt],
  );

export const upsertProject = (db: DatabaseHandle, project: Project) =>
  db.execute(
    `INSERT INTO projects
     (id, workspace_id, name, color, status, due_date, working_folder, created_at, updated_at, archived_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       name = excluded.name,
       color = excluded.color,
       status = excluded.status,
       due_date = excluded.due_date,
       working_folder = excluded.working_folder,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       archived_at = excluded.archived_at,
       deleted_at = excluded.deleted_at`,
    [
      project.id,
      project.workspaceId,
      project.name,
      project.color,
      project.status,
      project.dueDate,
      project.workingFolder,
      project.createdAt,
      project.updatedAt,
      project.archivedAt,
      project.deletedAt,
    ],
  );

export const upsertTask = (db: DatabaseHandle, task: Task) =>
  db.execute(
    `INSERT INTO tasks
     (id, workspace_id, project_id, working_folder, title, notes, due_date, due_time, timezone, priority, status, completed_at, created_at, updated_at, deleted_at, recurrence_template_id, recurrence_instance_date, parent_id, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       project_id = excluded.project_id,
       working_folder = excluded.working_folder,
       title = excluded.title,
       notes = excluded.notes,
       due_date = excluded.due_date,
       due_time = excluded.due_time,
       timezone = excluded.timezone,
       priority = excluded.priority,
       status = excluded.status,
       completed_at = excluded.completed_at,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       recurrence_template_id = excluded.recurrence_template_id,
       recurrence_instance_date = excluded.recurrence_instance_date,
       parent_id = excluded.parent_id,
       tags = excluded.tags`,
    [
      task.id,
      task.workspaceId,
      task.projectId,
      task.workingFolder,
      task.title,
      task.notes,
      task.dueDate,
      task.dueTime,
      task.timezone,
      task.priority,
      task.status,
      task.completedAt,
      task.createdAt,
      task.updatedAt,
      task.deletedAt,
      task.recurrenceTemplateId,
      task.recurrenceInstanceDate,
      task.parentId,
      serializeTags(task.tags),
    ],
  );

export const upsertAttachment = (db: DatabaseHandle, attachment: Attachment) =>
  db.execute(
    `INSERT INTO attachments (id, task_id, filename, path, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       task_id = excluded.task_id,
       filename = excluded.filename,
       path = excluded.path,
       mime_type = excluded.mime_type,
       size = excluded.size,
       created_at = excluded.created_at`,
    [
      attachment.id,
      attachment.task_id,
      attachment.filename,
      attachment.path,
      attachment.mimeType,
      attachment.size,
      attachment.createdAt,
    ],
  );

export const upsertRecurringTaskTemplate = (db: DatabaseHandle, template: RecurringTaskTemplate) =>
  db.execute(
    `INSERT INTO recurring_task_templates
     (id, workspace_id, title, notes, project_id, working_folder, due_time, timezone, priority, reminder_offset, frequency, interval, by_weekday, anchor_date, end_date, enabled, created_at, updated_at, deleted_at, parent_id, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       title = excluded.title,
       notes = excluded.notes,
       project_id = excluded.project_id,
       working_folder = excluded.working_folder,
       due_time = excluded.due_time,
       timezone = excluded.timezone,
       priority = excluded.priority,
       reminder_offset = excluded.reminder_offset,
       frequency = excluded.frequency,
       interval = excluded.interval,
       by_weekday = excluded.by_weekday,
       anchor_date = excluded.anchor_date,
       end_date = excluded.end_date,
       enabled = excluded.enabled,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       parent_id = excluded.parent_id,
       tags = excluded.tags`,
    [
      template.id,
      template.workspaceId,
      template.title,
      template.notes,
      template.projectId,
      template.workingFolder,
      template.dueTime,
      template.timezone,
      template.priority,
      template.reminderOffset,
      template.frequency,
      template.interval,
      serializeByWeekday(template.byWeekday),
      template.anchorDate,
      template.endDate,
      boolToInt(template.enabled),
      template.createdAt,
      template.updatedAt,
      template.deletedAt,
      template.parentId,
      serializeTags(template.tags),
    ],
  );

export const upsertSettings = (db: DatabaseHandle, workspaceId: string, settings: Settings) =>
  db.execute(
    `INSERT INTO settings
     (workspace_id, theme, accent_color, language, default_reminder_offset, default_working_folder, default_saved_view_id, notifications_enabled, close_to_tray)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET
       theme = excluded.theme,
       accent_color = excluded.accent_color,
       language = excluded.language,
       default_reminder_offset = excluded.default_reminder_offset,
       default_working_folder = excluded.default_working_folder,
       default_saved_view_id = excluded.default_saved_view_id,
       notifications_enabled = excluded.notifications_enabled,
       close_to_tray = excluded.close_to_tray`,
    [
      workspaceId,
      settings.theme,
      settings.accentColor,
      settings.language,
      settings.defaultReminderOffset,
      settings.defaultWorkingFolder,
      settings.defaultSavedViewId,
      boolToInt(settings.notificationsEnabled),
      boolToInt(settings.closeToTray),
    ],
  );

export const upsertReminder = (db: DatabaseHandle, reminder: Reminder) =>
  db.execute(
    `INSERT INTO reminders
     (id, task_id, remind_at, offset_minutes, snoozed_until, fired_at, failed_at, last_error, last_attempted_at, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       task_id = excluded.task_id,
       remind_at = excluded.remind_at,
       offset_minutes = excluded.offset_minutes,
       snoozed_until = excluded.snoozed_until,
       fired_at = excluded.fired_at,
       failed_at = excluded.failed_at,
       last_error = excluded.last_error,
       last_attempted_at = excluded.last_attempted_at,
       enabled = excluded.enabled`,
    [
      reminder.id,
      reminder.taskId,
      reminder.remindAt,
      reminder.offsetMinutes,
      reminder.snoozedUntil,
      reminder.firedAt,
      reminder.failedAt,
      reminder.lastError,
      reminder.lastAttemptedAt,
      boolToInt(reminder.enabled),
    ],
  );

export const upsertSavedView = (db: DatabaseHandle, view: SavedTaskView) =>
  db.execute(
    `INSERT INTO saved_views (id, workspace_id, name, filters_json, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       name = excluded.name,
       filters_json = excluded.filters_json,
       pinned = excluded.pinned,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    [
      view.id,
      view.workspaceId,
      view.name,
      JSON.stringify(view.filters),
      boolToInt(view.pinned ?? false),
      view.createdAt,
      view.updatedAt,
    ],
  );

export const upsertReminderEvent = (db: DatabaseHandle, event: ReminderEvent) =>
  db.execute(
    `INSERT INTO reminder_events (id, reminder_id, task_id, event_type, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       reminder_id = excluded.reminder_id,
       task_id = excluded.task_id,
       event_type = excluded.event_type,
       detail = excluded.detail,
       created_at = excluded.created_at`,
    [event.id, event.reminderId, event.taskId, event.eventType, event.detail, event.createdAt],
  );
