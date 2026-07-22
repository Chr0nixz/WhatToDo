import { DEFAULT_SETTINGS, normalizeTags } from "./repositoryContract";
import type {
  Attachment,
  Project,
  ProjectStatus,
  RecurringTaskTemplate,
  Reminder,
  SavedTaskView,
  Settings,
  Task,
  TaskStatus,
  TaskSummary,
  Workspace,
  WorkspaceFolder,
} from "./types";
import { toTaskSummary } from "./types";

export const DEFAULT_TASK_VIEW_FILTERS = {
  scope: "open",
  priority: "all",
  projectId: "all",
  reminder: "all",
  folder: "all",
  dateRange: "all",
  tags: [] as string[],
  tagMatch: "any" as "any" | "all" | "none",
  advancedFilter: null as import("./types").FilterGroup | null,
} as const;

export const boolToInt = (value: boolean) => (value ? 1 : 0);

export const intToBool = (value: unknown) => value === 1 || value === true;

export const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
export const VALID_TASK_STATUSES = new Set(["todo", "in_progress", "completed", "cancelled"]);
export const VALID_PROJECT_STATUSES = new Set(["active", "paused", "completed", "archived"]);
export const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);

export const assertEnum = (value: unknown, valid: Set<string>, field: string): string => {
  const str = String(value);
  if (!valid.has(str)) {
    throw new Error(`Invalid ${field} value: ${str}`);
  }
  return str;
};

export const parseByWeekday = (raw: unknown): number[] | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    const days = parsed.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return days.length > 0 ? Array.from(new Set(days)).sort((a, b) => a - b) : null;
  } catch {
    return null;
  }
};

export const serializeByWeekday = (byWeekday: number[] | null): string | null => {
  if (!byWeekday || byWeekday.length === 0) return null;
  return JSON.stringify(byWeekday);
};

export const parseTags = (raw: unknown): string[] => {
  if (raw === null || raw === undefined || raw === "") return [];
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return normalizeTags(parsed);
  } catch {
    return [];
  }
};

export const serializeTags = (tags: string[]): string | null => {
  if (!tags || tags.length === 0) return null;
  return JSON.stringify(tags);
};

export const rowToProject = (row: Record<string, unknown>): Project => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  name: String(row.name),
  color: String(row.color),
  status: assertEnum(row.status, VALID_PROJECT_STATUSES, "project status") as ProjectStatus,
  dueDate: row.due_date ? String(row.due_date) : null,
  workingFolder: row.working_folder ? String(row.working_folder) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  archivedAt: row.archived_at ? String(row.archived_at) : null,
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

export const rowToTask = (row: Record<string, unknown>): Task => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  projectId: row.project_id ? String(row.project_id) : null,
  workingFolder: row.working_folder ? String(row.working_folder) : null,
  title: String(row.title),
  notes: String(row.notes ?? ""),
  dueDate: String(row.due_date),
  dueTime: row.due_time ? String(row.due_time) : null,
  timezone: String(row.timezone ?? "UTC"),
  priority: assertEnum(row.priority, VALID_PRIORITIES, "priority") as Task["priority"],
  status: assertEnum(row.status, VALID_TASK_STATUSES, "status") as TaskStatus,
  completedAt: row.completed_at ? String(row.completed_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  recurrenceTemplateId: row.recurrence_template_id ? String(row.recurrence_template_id) : null,
  recurrenceInstanceDate: row.recurrence_instance_date ? String(row.recurrence_instance_date) : null,
  parentId: row.parent_id ? String(row.parent_id) : null,
  tags: parseTags(row.tags),
});

export const rowToTaskSummary = (row: Record<string, unknown>): TaskSummary => toTaskSummary(rowToTask(row));

/** List/page queries omit notes to shrink payloads; detail uses getTask / full cache rows. */
export const TASK_LIST_COLUMNS = [
  "id",
  "workspace_id",
  "project_id",
  "working_folder",
  "title",
  "due_date",
  "due_time",
  "timezone",
  "priority",
  "status",
  "completed_at",
  "created_at",
  "updated_at",
  "deleted_at",
  "recurrence_template_id",
  "recurrence_instance_date",
  "parent_id",
  "tags",
].join(", ");

export const rowToAttachment = (row: Record<string, unknown>): Attachment => ({
  id: String(row.id),
  task_id: String(row.task_id),
  filename: String(row.filename),
  path: String(row.path),
  mimeType: row.mime_type ? String(row.mime_type) : null,
  size: row.size === null || row.size === undefined ? null : Number(row.size),
  createdAt: String(row.created_at),
});

export const rowToRecurringTaskTemplate = (row: Record<string, unknown>): RecurringTaskTemplate => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  title: String(row.title),
  notes: String(row.notes ?? ""),
  projectId: row.project_id ? String(row.project_id) : null,
  workingFolder: row.working_folder ? String(row.working_folder) : null,
  dueTime: row.due_time ? String(row.due_time) : null,
  timezone: String(row.timezone),
  priority: row.priority as RecurringTaskTemplate["priority"],
  reminderOffset: row.reminder_offset === null ? null : Number(row.reminder_offset),
  frequency: assertEnum(row.frequency, VALID_FREQUENCIES, "recurrence frequency") as RecurringTaskTemplate["frequency"],
  interval: Number(row.interval ?? 1),
  byWeekday: parseByWeekday(row.by_weekday),
  anchorDate: String(row.anchor_date),
  endDate: row.end_date ? String(row.end_date) : null,
  enabled: intToBool(row.enabled),
  parentId: row.parent_id ? String(row.parent_id) : null,
  tags: parseTags(row.tags),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

export const rowToReminder = (row: Record<string, unknown>): Reminder => ({
  id: String(row.id),
  taskId: String(row.task_id),
  remindAt: String(row.remind_at),
  offsetMinutes: row.offset_minutes === null ? null : Number(row.offset_minutes),
  snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
  firedAt: row.fired_at ? String(row.fired_at) : null,
  failedAt: row.failed_at ? String(row.failed_at) : null,
  lastError: row.last_error ? String(row.last_error) : null,
  lastAttemptedAt: row.last_attempted_at ? String(row.last_attempted_at) : null,
  enabled: intToBool(row.enabled),
});

export const rowToSavedTaskView = (row: Record<string, unknown>): SavedTaskView => {
  const parsed = row.filters_json ? JSON.parse(String(row.filters_json)) : {};

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    filters: { ...DEFAULT_TASK_VIEW_FILTERS, ...parsed },
    pinned: intToBool(row.pinned),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

export const rowToWorkspace = (row: Record<string, unknown>): Workspace => ({
  id: String(row.id),
  name: String(row.name),
  color: String(row.color),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

export const rowToWorkspaceFolder = (row: Record<string, unknown>): WorkspaceFolder => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  name: String(row.name),
  path: String(row.path),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

export const rowToSettings = (row: Record<string, unknown>): Settings => ({
  theme: row.theme as Settings["theme"],
  accentColor: (row.accent_color as Settings["accentColor"] | undefined) ?? DEFAULT_SETTINGS.accentColor,
  language: row.language as Settings["language"],
  defaultReminderOffset: Number(row.default_reminder_offset),
  defaultWorkingFolder: row.default_working_folder ? String(row.default_working_folder) : null,
  defaultSavedViewId: row.default_saved_view_id ? String(row.default_saved_view_id) : null,
  notificationsEnabled: intToBool(row.notifications_enabled),
  closeToTray: intToBool(row.close_to_tray),
});
