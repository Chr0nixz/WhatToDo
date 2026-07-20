import Database from "@tauri-apps/plugin-sql";

import { endOfWeek } from "date-fns";

import { buildReminderDate, parseDateKey, todayKey, toDateKey } from "./date";
import { clearDefaultSavedViewIfNeeded } from "./savedViews";
import { buildTaskFromRecurringTemplate, getNextRecurrenceDate } from "./recurrence";
import { taskMatchesFilters } from "./taskFilters";
import type {
  AppData,
  AppDataKey,
  Attachment,
  BackupPayload,
  CreateAttachmentInput,
  CreateRecurringTaskInput,
  CreateSavedTaskViewInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  CreateProjectInput,
  CreateTaskInput,
  FilterCondition,
  FilterGroup,
  ImportBackupMode,
  Project,
  ProjectStatus,
  RecurringTaskTemplate,
  RecoveryItems,
  Reminder,
  ReminderEvent,
  ReminderEventType,
  RepositoryPatch,
  RepositoryResult,
  SavedTaskView,
  Settings,
  Task,
  TaskPageInput,
  TaskPageResult,
  TaskStatus,
  TaskViewFilters,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceFolder,
} from "./types";

const DB_URL = "sqlite:ddl_todo.db";
const LOCAL_KEY = "whattodo:data";
const LEGACY_LOCAL_KEY = "ddl-todo:data";
const DEFAULT_WORKSPACE_ID = "local-workspace";
const DEFAULT_WORKSPACE_NAME = "Default";

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accentColor: "blue",
  language: "zh",
  defaultReminderOffset: 30,
  defaultWorkingFolder: null,
  defaultSavedViewId: null,
  notificationsEnabled: false,
  closeToTray: true,
};

export const CANNOT_DELETE_LAST_WORKSPACE = "CANNOT_DELETE_LAST_WORKSPACE";

const ALL_APP_DATA_KEYS: AppDataKey[] = [
  "workspaceId",
  "workspaces",
  "workspaceFolders",
  "projects",
  "tasks",
  "deletedTasks",
  "deletedWorkspaceFolders",
  "availableTasks",
  "reminders",
  "savedViews",
  "recurringTaskTemplates",
  "attachments",
  "settings",
  "settingsByWorkspace",
];

const buildFullPatch = (): RepositoryPatch => ({ affectedKeys: ALL_APP_DATA_KEYS });

const diffPatch = (prev: AppData, next: AppData): RepositoryPatch => {
  if (prev.workspaceId !== next.workspaceId) {
    return buildFullPatch();
  }
  const affectedKeys: AppDataKey[] = [];
  (Object.keys(next) as AppDataKey[]).forEach((key) => {
    if (prev[key] !== next[key]) {
      affectedKeys.push(key);
    }
  });
  return { affectedKeys };
};

const DEFAULT_TASK_VIEW_FILTERS = {
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

type DatabaseHandle = Awaited<ReturnType<typeof Database.load>>;

const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const nowIso = () => new Date().toISOString();

let transactionDepth = 0;

const withTransaction = async <T>(db: DatabaseHandle, operation: () => Promise<T>) => {
  // Use SAVEPOINT for nested transactions to avoid "cannot start a transaction
  // within a transaction" errors. The outermost call uses BEGIN/COMMIT/ROLLBACK.
  if (transactionDepth > 0) {
    const savepoint = `sp_${transactionDepth}`;
    transactionDepth++;
    try {
      await db.execute(`SAVEPOINT ${savepoint}`);
      const result = await operation();
      await db.execute(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (err) {
      await db.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await db.execute(`RELEASE SAVEPOINT ${savepoint}`);
      throw err;
    } finally {
      transactionDepth--;
    }
  }

  transactionDepth++;
  await db.execute("BEGIN TRANSACTION");
  try {
    const result = await operation();
    await db.execute("COMMIT");
    return result;
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  } finally {
    transactionDepth--;
  }
};

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const normalizeTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((item) => String(item).trim()).filter(Boolean)));
};

const normalizeData = (data: Partial<AppData> | null): AppData => ({
  workspaceId: data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
  workspaces:
    data?.workspaces && data.workspaces.length > 0
      ? data.workspaces.map((workspace) => ({
          ...workspace,
          deletedAt: workspace.deletedAt ?? null,
        }))
      : [
          {
            id: DEFAULT_WORKSPACE_ID,
            name: DEFAULT_WORKSPACE_NAME,
            color: "#4fb8d8",
            createdAt: nowIso(),
            updatedAt: nowIso(),
            deletedAt: null,
          },
        ],
  workspaceFolders: (data?.workspaceFolders ?? []).map((folder) => ({
    ...folder,
    deletedAt: folder.deletedAt ?? null,
  })),
  projects: (data?.projects ?? []).map((project) => ({
    ...project,
    workspaceId: project.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: project.workingFolder ?? null,
  })),
  tasks: (data?.tasks ?? []).map((task) => ({
    ...task,
    workspaceId: task.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: task.workingFolder ?? null,
    recurrenceTemplateId: task.recurrenceTemplateId ?? null,
    recurrenceInstanceDate: task.recurrenceInstanceDate ?? null,
    parentId: task.parentId ?? null,
    tags: normalizeTags(task.tags),
  })),
  deletedTasks: (data?.deletedTasks ?? []).map((task) => ({
    ...task,
    workspaceId: task.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: task.workingFolder ?? null,
    recurrenceTemplateId: task.recurrenceTemplateId ?? null,
    recurrenceInstanceDate: task.recurrenceInstanceDate ?? null,
    parentId: task.parentId ?? null,
    tags: normalizeTags(task.tags),
  })),
  deletedWorkspaceFolders: (data?.deletedWorkspaceFolders ?? []).map((folder) => ({
    ...folder,
    workspaceId: folder.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    deletedAt: folder.deletedAt ?? null,
  })),
  availableTasks: (data?.availableTasks ?? []).map((task) => ({
    ...task,
    workspaceId: task.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: task.workingFolder ?? null,
    recurrenceTemplateId: task.recurrenceTemplateId ?? null,
    recurrenceInstanceDate: task.recurrenceInstanceDate ?? null,
    parentId: task.parentId ?? null,
    tags: normalizeTags(task.tags),
  })),
  reminders: (data?.reminders ?? []).map((reminder) => ({
    ...reminder,
    failedAt: reminder.failedAt ?? null,
    lastError: reminder.lastError ?? null,
    lastAttemptedAt: reminder.lastAttemptedAt ?? null,
  })),
  savedViews: (data?.savedViews ?? []).map((view) => ({
    ...view,
    workspaceId: view.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    filters: { ...DEFAULT_TASK_VIEW_FILTERS, ...view.filters },
  })),
  recurringTaskTemplates: (data?.recurringTaskTemplates ?? []).map((template) => ({
    ...template,
    workspaceId: template.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    notes: template.notes ?? "",
    projectId: template.projectId ?? null,
    workingFolder: template.workingFolder ?? null,
    dueTime: template.dueTime ?? null,
    reminderOffset: template.reminderOffset ?? null,
    interval: template.interval ?? 1,
    byWeekday: template.byWeekday ?? null,
    endDate: template.endDate ?? null,
    enabled: template.enabled ?? true,
    deletedAt: template.deletedAt ?? null,
  })),
  attachments: (data?.attachments ?? []).map((attachment) => ({
    ...attachment,
    mimeType: attachment.mimeType ?? null,
    size: attachment.size ?? null,
  })),
  settingsByWorkspace: (() => {
    const map: Record<string, Settings> = { ...(data?.settingsByWorkspace ?? {}) };
    const fallbackSettings: Settings = {
      ...DEFAULT_SETTINGS,
      ...data?.settings,
      defaultSavedViewId: data?.settings?.defaultSavedViewId ?? null,
    };
    if (!map[DEFAULT_WORKSPACE_ID]) {
      map[DEFAULT_WORKSPACE_ID] = fallbackSettings;
    }
    return map;
  })(),
  settings: (() => {
    const settingsByWorkspace = data?.settingsByWorkspace ?? {};
    const fallbackSettings: Settings = {
      ...DEFAULT_SETTINGS,
      ...data?.settings,
      defaultSavedViewId: data?.settings?.defaultSavedViewId ?? null,
    };
    const currentWorkspaceId = data?.workspaceId ?? DEFAULT_WORKSPACE_ID;
    return settingsByWorkspace[currentWorkspaceId] ?? fallbackSettings;
  })(),
});

const boolToInt = (value: boolean) => (value ? 1 : 0);

const intToBool = (value: unknown) => value === 1 || value === true;

const normalizeTaskPageInput = (input: TaskPageInput, fallbackWorkspaceId: string) => ({
  ...input,
  workspaceId: input.workspaceId ?? fallbackWorkspaceId,
  limit: Math.max(1, Math.min(Math.trunc(input.limit), 500)),
  offset: Math.max(0, Math.trunc(input.offset)),
  query: input.query?.trim().toLowerCase() ?? "",
  date: input.date || null,
  projectId: input.projectId ?? null,
  priority: input.priority ?? DEFAULT_TASK_VIEW_FILTERS.priority,
  reminder: input.reminder ?? DEFAULT_TASK_VIEW_FILTERS.reminder,
  folder: input.folder ?? DEFAULT_TASK_VIEW_FILTERS.folder,
  dateRange: input.dateRange ?? DEFAULT_TASK_VIEW_FILTERS.dateRange,
  referenceDate: input.referenceDate ?? todayKey(),
  tags: Array.isArray(input.tags) ? input.tags.filter((tag) => tag.trim().length > 0) : [],
  tagMatch: input.tagMatch ?? DEFAULT_TASK_VIEW_FILTERS.tagMatch,
  advancedFilter: input.advancedFilter ?? null,
});

const taskPageFiltersFromInput = (input: ReturnType<typeof normalizeTaskPageInput>): TaskViewFilters => ({
  scope: input.scope,
  priority: input.priority,
  projectId: input.projectId ?? DEFAULT_TASK_VIEW_FILTERS.projectId,
  reminder: input.reminder,
  folder: input.folder,
  dateRange: input.dateRange,
  tags: input.tags,
  tagMatch: input.tagMatch,
  advancedFilter: input.advancedFilter,
});

const escapeSqlLikeTag = (tag: string) => tag.replace(/[%_\\]/g, "\\$&").replace(/"/g, '\\"');

const appendTagFiltersSql = (
  where: string[],
  values: unknown[],
  tags: string[],
  tagMatch: TaskViewFilters["tagMatch"],
) => {
  if (tags.length === 0) {
    return;
  }
  const clauses = tags.map(() => `tags LIKE ? ESCAPE '\\'`);
  const patterns = tags.map((tag) => `%"${escapeSqlLikeTag(tag)}"%`);
  if (tagMatch === "all") {
    where.push(...clauses);
    values.push(...patterns);
    return;
  }
  if (tagMatch === "none") {
    where.push(`NOT (${clauses.join(" OR ")})`);
    values.push(...patterns);
    return;
  }
  where.push(`(${clauses.join(" OR ")})`);
  values.push(...patterns);
};

const sqlConditionForFilter = (condition: FilterCondition, where: string[], values: unknown[]): boolean => {
  const { field, op, value } = condition;
  switch (field) {
    case "priority":
    case "status":
      if (op === "eq") {
        where.push(`${field === "priority" ? "priority" : "status"} = ?`);
        values.push(value);
        return true;
      }
      if (op === "neq") {
        where.push(`${field === "priority" ? "priority" : "status"} <> ?`);
        values.push(value);
        return true;
      }
      if (op === "in" && Array.isArray(value) && value.length > 0) {
        where.push(`${field === "priority" ? "priority" : "status"} IN (${value.map(() => "?").join(", ")})`);
        values.push(...value);
        return true;
      }
      if (op === "notIn" && Array.isArray(value) && value.length > 0) {
        where.push(`${field === "priority" ? "priority" : "status"} NOT IN (${value.map(() => "?").join(", ")})`);
        values.push(...value);
        return true;
      }
      return false;
    case "projectId":
      if (op === "eq") {
        where.push("project_id = ?");
        values.push(value);
        return true;
      }
      if (op === "neq") {
        where.push("(project_id IS NULL OR project_id <> ?)");
        values.push(value);
        return true;
      }
      if (op === "isEmpty") {
        where.push("project_id IS NULL");
        return true;
      }
      if (op === "isNotEmpty") {
        where.push("project_id IS NOT NULL");
        return true;
      }
      return false;
    case "parentId":
      if (op === "eq") {
        where.push("parent_id = ?");
        values.push(value);
        return true;
      }
      if (op === "isEmpty") {
        where.push("parent_id IS NULL");
        return true;
      }
      if (op === "isNotEmpty") {
        where.push("parent_id IS NOT NULL");
        return true;
      }
      return false;
    case "dueDate":
      if (op === "eq") {
        where.push("due_date = ?");
        values.push(value);
        return true;
      }
      if (op === "neq") {
        where.push("due_date <> ?");
        values.push(value);
        return true;
      }
      if (op === "before") {
        where.push("due_date < ?");
        values.push(value);
        return true;
      }
      if (op === "after") {
        where.push("due_date > ?");
        values.push(value);
        return true;
      }
      return false;
    case "hasReminder":
      if (op === "eq") {
        const exists = value === "true";
        where.push(
          `${exists ? "" : "NOT "}EXISTS (SELECT 1 FROM reminders WHERE reminders.task_id = tasks.id AND reminders.enabled = 1)`,
        );
        return true;
      }
      return false;
    case "hasFolder":
      if (op === "eq") {
        if (value === "true") {
          where.push("working_folder IS NOT NULL AND working_folder <> ''");
        } else {
          where.push("(working_folder IS NULL OR working_folder = '')");
        }
        return true;
      }
      return false;
    case "tags":
      if (op === "contains") {
        where.push(`tags LIKE ? ESCAPE '\\'`);
        values.push(`%"${escapeSqlLikeTag(String(value))}"%`);
        return true;
      }
      if (op === "notContains") {
        where.push(`tags NOT LIKE ? ESCAPE '\\'`);
        values.push(`%"${escapeSqlLikeTag(String(value))}"%`);
        return true;
      }
      if (op === "isEmpty") {
        where.push(`(tags IS NULL OR tags = '' OR tags = '[]')`);
        return true;
      }
      if (op === "isNotEmpty") {
        where.push(`(tags IS NOT NULL AND tags <> '' AND tags <> '[]')`);
        return true;
      }
      if ((op === "in" || op === "notIn") && Array.isArray(value) && value.length > 0) {
        const clauses = value.map(() => `tags LIKE ? ESCAPE '\\'`);
        const patterns = value.map((tag) => `%"${escapeSqlLikeTag(String(tag))}"%`);
        where.push(op === "in" ? `(${clauses.join(" OR ")})` : `NOT (${clauses.join(" OR ")})`);
        values.push(...patterns);
        return true;
      }
      return false;
    default:
      return false;
  }
};

const appendAdvancedFilterSql = (where: string[], values: unknown[], group: FilterGroup | null) => {
  if (!group) {
    return;
  }
  const parts: string[] = [];
  const partValues: unknown[] = [];
  for (const condition of group.conditions) {
    const localWhere: string[] = [];
    const localValues: unknown[] = [];
    if (sqlConditionForFilter(condition, localWhere, localValues)) {
      parts.push(...localWhere);
      partValues.push(...localValues);
    }
  }
  for (const child of group.groups) {
    const childWhere: string[] = [];
    const childValues: unknown[] = [];
    appendAdvancedFilterSql(childWhere, childValues, child);
    if (childWhere.length > 0) {
      parts.push(`(${childWhere.join(` ${child.operator} `)})`);
      partValues.push(...childValues);
    }
  }
  if (parts.length === 0) {
    return;
  }
  const joined = parts.join(` ${group.operator} `);
  where.push(group.negate ? `NOT (${joined})` : `(${joined})`);
  values.push(...partValues);
};

const priorityRank: Record<Task["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const taskStatusRank: Record<Task["status"], number> = { todo: 0, in_progress: 1, completed: 2, cancelled: 3 };

const taskPageComparator = (sort: TaskPageInput["sort"]) => (a: Task, b: Task) => {
  if (sort === "createdDesc") {
    return b.createdAt.localeCompare(a.createdAt);
  }

  if (sort === "overview" && a.status !== b.status) {
    return taskStatusRank[a.status] - taskStatusRank[b.status];
  }

  const dueDate = a.dueDate.localeCompare(b.dueDate);
  if (dueDate !== 0) {
    return dueDate;
  }

  const dueTime = (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
  if (dueTime !== 0) {
    return dueTime;
  }

  const priority = priorityRank[a.priority] - priorityRank[b.priority];
  if (priority !== 0) {
    return priority;
  }

  return a.createdAt.localeCompare(b.createdAt);
};

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_TASK_STATUSES = new Set(["todo", "in_progress", "completed", "cancelled"]);
const VALID_PROJECT_STATUSES = new Set(["active", "paused", "completed", "archived"]);
const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);

const assertEnum = (value: unknown, valid: Set<string>, field: string): string => {
  const str = String(value);
  if (!valid.has(str)) {
    throw new Error(`Invalid ${field} value: ${str}`);
  }
  return str;
};

const parseByWeekday = (raw: unknown): number[] | null => {
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

const serializeByWeekday = (byWeekday: number[] | null): string | null => {
  if (!byWeekday || byWeekday.length === 0) return null;
  return JSON.stringify(byWeekday);
};

const parseTags = (raw: unknown): string[] => {
  if (raw === null || raw === undefined || raw === "") return [];
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return normalizeTags(parsed);
  } catch {
    return [];
  }
};

const serializeTags = (tags: string[]): string | null => {
  if (!tags || tags.length === 0) return null;
  return JSON.stringify(tags);
};

const rowToProject = (row: Record<string, unknown>): Project => ({
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

const rowToTask = (row: Record<string, unknown>): Task => ({
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

/** List/page queries omit notes to shrink payloads; detail uses full readAll/cache rows. */
const TASK_LIST_COLUMNS = [
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

const rowToAttachment = (row: Record<string, unknown>): Attachment => ({
  id: String(row.id),
  task_id: String(row.task_id),
  filename: String(row.filename),
  path: String(row.path),
  mimeType: row.mime_type ? String(row.mime_type) : null,
  size: row.size === null || row.size === undefined ? null : Number(row.size),
  createdAt: String(row.created_at),
});

const rowToRecurringTaskTemplate = (row: Record<string, unknown>): RecurringTaskTemplate => ({
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
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

const rowToReminder = (row: Record<string, unknown>): Reminder => ({
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

const rowToSavedTaskView = (row: Record<string, unknown>): SavedTaskView => {
  const parsed = row.filters_json ? JSON.parse(String(row.filters_json)) : {};

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    filters: { ...DEFAULT_TASK_VIEW_FILTERS, ...parsed },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

const rowToWorkspace = (row: Record<string, unknown>): Workspace => ({
  id: String(row.id),
  name: String(row.name),
  color: String(row.color),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

const rowToWorkspaceFolder = (row: Record<string, unknown>): WorkspaceFolder => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  name: String(row.name),
  path: String(row.path),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
});

const rowToSettings = (row: Record<string, unknown>): Settings => ({
  theme: row.theme as Settings["theme"],
  accentColor: (row.accent_color as Settings["accentColor"] | undefined) ?? DEFAULT_SETTINGS.accentColor,
  language: row.language as Settings["language"],
  defaultReminderOffset: Number(row.default_reminder_offset),
  defaultWorkingFolder: row.default_working_folder ? String(row.default_working_folder) : null,
  defaultSavedViewId: row.default_saved_view_id ? String(row.default_saved_view_id) : null,
  notificationsEnabled: intToBool(row.notifications_enabled),
  closeToTray: intToBool(row.close_to_tray),
});

export interface TodoRepository {
  load(workspaceId?: string): Promise<AppData>;
  selectWorkspace(workspaceId: string): Promise<RepositoryResult>;
  loadAvailableTasks(workspaceId?: string): Promise<Task[]>;
  loadRecoveryItems(): Promise<RecoveryItems>;
  loadTaskPage(input: TaskPageInput): Promise<TaskPageResult>;
  loadDueDateCounts(input: { workspaceId?: string; from: string; to: string }): Promise<Record<string, number>>;
  createWorkspace(input: CreateWorkspaceInput): Promise<RepositoryResult>;
  updateWorkspace(id: string, patch: UpdateWorkspaceInput): Promise<RepositoryResult>;
  deleteWorkspace(id: string): Promise<RepositoryResult>;
  restoreWorkspace(id: string): Promise<RepositoryResult>;
  createWorkspaceFolder(input: CreateWorkspaceFolderInput): Promise<RepositoryResult>;
  deleteWorkspaceFolder(id: string): Promise<RepositoryResult>;
  restoreWorkspaceFolder(id: string): Promise<RepositoryResult>;
  saveSettings(settings: Settings): Promise<RepositoryResult>;
  createProject(input: CreateProjectInput): Promise<RepositoryResult>;
  updateProject(
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ): Promise<RepositoryResult>;
  archiveProject(id: string): Promise<RepositoryResult>;
  unarchiveProject(id: string): Promise<RepositoryResult>;
  createTask(input: CreateTaskInput): Promise<RepositoryResult>;
  createRecurringTask(input: CreateRecurringTaskInput): Promise<RepositoryResult>;
  updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput): Promise<RepositoryResult>;
  updateRecurringSeries(
    id: string,
    patch: UpdateRecurringTaskTemplateInput,
    mode: "template" | "openFuture",
  ): Promise<RepositoryResult>;
  disableRecurringTaskTemplate(id: string): Promise<RepositoryResult>;
  moveTaskToWorkspace(taskId: string, workspaceId: string): Promise<RepositoryResult>;
  updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
  ): Promise<RepositoryResult>;
  setTaskParent(taskId: string, parentId: string | null): Promise<RepositoryResult>;
  updateTaskReminder(taskId: string, offsetMinutes: number | null): Promise<RepositoryResult>;
  toggleTask(id: string): Promise<RepositoryResult>;
  setTaskStatus(id: string, status: TaskStatus): Promise<RepositoryResult>;
  bulkSetTaskStatus(ids: string[], status: TaskStatus): Promise<RepositoryResult>;
  bulkDeleteTasks(ids: string[]): Promise<RepositoryResult>;
  bulkMoveTasksToProject(ids: string[], projectId: string | null): Promise<RepositoryResult>;
  deleteTask(id: string): Promise<RepositoryResult>;
  restoreTask(id: string): Promise<RepositoryResult>;
  addAttachment(input: CreateAttachmentInput): Promise<RepositoryResult>;
  deleteAttachment(id: string): Promise<RepositoryResult>;
  markReminderFired(id: string): Promise<RepositoryResult>;
  markReminderFailed(id: string, reason: string): Promise<RepositoryResult>;
  snoozeReminder(id: string, untilIso: string): Promise<RepositoryResult>;
  disableReminder(id: string): Promise<RepositoryResult>;
  loadReminderEvents(reminderId: string): Promise<ReminderEvent[]>;
  createTaskReminder(taskId: string, offsetMinutes: number): Promise<RepositoryResult>;
  deleteReminder(id: string): Promise<RepositoryResult>;
  createSavedView(input: CreateSavedTaskViewInput): Promise<RepositoryResult>;
  updateSavedView(id: string, input: CreateSavedTaskViewInput): Promise<RepositoryResult>;
  deleteSavedView(id: string): Promise<RepositoryResult>;
  exportBackup(): Promise<BackupPayload>;
  importBackup(payload: BackupPayload, mode?: ImportBackupMode): Promise<RepositoryResult>;
  exportCurrentWorkspaceCsv(): Promise<string>;
  exportCurrentWorkspaceIcs(): Promise<string>;
}

class LocalRepository implements TodoRepository {
  private data: AppData = normalizeData(null);
  private workspaceId = DEFAULT_WORKSPACE_ID;
  private prevData: AppData | null = null;
  private reminderEvents: ReminderEvent[] = [];

  async load(workspaceId?: string) {
    const raw = localStorage.getItem(LOCAL_KEY) ?? localStorage.getItem(LEGACY_LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AppData> & { reminderEvents?: ReminderEvent[] }) : null;
    this.data = normalizeData(parsed);
    this.reminderEvents = normalizeReminderEvents(parsed?.reminderEvents);
    this.workspaceId = this.resolveWorkspaceId(workspaceId ?? this.data.workspaceId);
    this.prevData = this.data;
    return this.snapshot();
  }

  async selectWorkspace(workspaceId: string) {
    this.workspaceId = this.resolveWorkspaceId(workspaceId);
    return this.persist();
  }

  async loadAvailableTasks(workspaceId = this.workspaceId) {
    return this.data.tasks.filter((task) => task.workspaceId !== workspaceId && task.deletedAt === null);
  }

  async loadRecoveryItems() {
    return {
      deletedTasks: this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt !== null),
      deletedWorkspaceFolders: this.data.workspaceFolders.filter(
        (folder) => folder.workspaceId === this.workspaceId && folder.deletedAt !== null,
      ),
      deletedWorkspaces: this.data.workspaces.filter((workspace) => workspace.deletedAt !== null),
      archivedProjects: this.data.projects.filter(
        (project) => project.workspaceId === this.workspaceId && project.status === "archived" && project.deletedAt === null,
      ),
    };
  }

  async loadTaskPage(input: TaskPageInput) {
    const normalized = normalizeTaskPageInput(input, this.workspaceId);
    const filters = taskPageFiltersFromInput(normalized);
    const reminderTaskIds = new Set(
      this.data.reminders.filter((reminder) => reminder.enabled).map((reminder) => reminder.taskId),
    );
    const projectsById = new Map(this.data.projects.map((project) => [project.id, project]));
    const filtered = this.data.tasks.filter((task) => {
      if (task.workspaceId !== normalized.workspaceId || task.deletedAt !== null) {
        return false;
      }

      if (normalized.date && task.dueDate !== normalized.date) {
        return false;
      }

      if (!taskMatchesFilters(task, { reminderTaskIds }, filters, normalized.referenceDate)) {
        return false;
      }

      if (normalized.query) {
        const projectName = task.projectId ? projectsById.get(task.projectId)?.name ?? "" : "";
        const haystack = [task.title, task.notes, task.dueDate, task.dueTime ?? "", projectName].join(" ").toLowerCase();
        if (!haystack.includes(normalized.query)) {
          return false;
        }
      }

      return true;
    });
    const sorted = [...filtered].sort(taskPageComparator(normalized.sort));
    const tasks = sorted.slice(normalized.offset, normalized.offset + normalized.limit);
    const taskIds = new Set(tasks.map((task) => task.id));

    return {
      tasks,
      total: sorted.length,
      reminders: this.data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
    };
  }

  async loadDueDateCounts(input: { workspaceId?: string; from: string; to: string }) {
    const workspaceId = input.workspaceId ?? this.workspaceId;
    const counts: Record<string, number> = {};
    for (const task of this.data.tasks) {
      if (task.workspaceId !== workspaceId || task.deletedAt !== null) {
        continue;
      }
      if (task.dueDate < input.from || task.dueDate > input.to) {
        continue;
      }
      counts[task.dueDate] = (counts[task.dueDate] ?? 0) + 1;
    }
    return counts;
  }

  async createWorkspace(input: CreateWorkspaceInput) {
    const timestamp = nowIso();
    const workspace: Workspace = {
      id: createId("workspace"),
      name: input.name,
      color: input.color,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    const newSettings = { ...DEFAULT_SETTINGS };
    this.workspaceId = workspace.id;
    this.data = {
      ...this.data,
      workspaces: [workspace, ...this.data.workspaces],
      settings: newSettings,
      settingsByWorkspace: { ...this.data.settingsByWorkspace, [workspace.id]: newSettings },
    };
    return this.persist();
  }

  async updateWorkspace(id: string, patch: UpdateWorkspaceInput) {
    this.data = {
      ...this.data,
      workspaces: this.data.workspaces.map((workspace) =>
        workspace.id === id ? { ...workspace, ...patch, updatedAt: nowIso() } : workspace,
      ),
    };
    return this.persist();
  }

  async deleteWorkspace(id: string) {
    const activeWorkspaces = this.data.workspaces.filter((workspace) => workspace.deletedAt === null);
    if (activeWorkspaces.length <= 1 && activeWorkspaces.some((workspace) => workspace.id === id)) {
      throw new Error(CANNOT_DELETE_LAST_WORKSPACE);
    }

    const timestamp = nowIso();
    this.data = {
      ...this.data,
      workspaces: this.data.workspaces.map((workspace) =>
        workspace.id === id ? { ...workspace, deletedAt: timestamp, updatedAt: timestamp } : workspace,
      ),
    };

    if (this.workspaceId === id) {
      const nextWorkspace = this.data.workspaces.find((workspace) => workspace.deletedAt === null && workspace.id !== id);
      if (nextWorkspace) {
        this.workspaceId = nextWorkspace.id;
      }
    }

    return this.persist();
  }

  async restoreWorkspace(id: string) {
    this.data = {
      ...this.data,
      workspaces: this.data.workspaces.map((workspace) =>
        workspace.id === id ? { ...workspace, deletedAt: null, updatedAt: nowIso() } : workspace,
      ),
    };
    return this.persist();
  }

  async createWorkspaceFolder(input: CreateWorkspaceFolderInput) {
    const timestamp = nowIso();
    const folder: WorkspaceFolder = {
      id: createId("folder"),
      workspaceId: this.workspaceId,
      name: input.name,
      path: input.path,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.data = { ...this.data, workspaceFolders: [folder, ...this.data.workspaceFolders] };
    return this.persist();
  }

  async deleteWorkspaceFolder(id: string) {
    this.data = {
      ...this.data,
      workspaceFolders: this.data.workspaceFolders.map((folder) =>
        folder.id === id ? { ...folder, deletedAt: nowIso(), updatedAt: nowIso() } : folder,
      ),
    };
    return this.persist();
  }

  async restoreWorkspaceFolder(id: string) {
    this.data = {
      ...this.data,
      workspaceFolders: this.data.workspaceFolders.map((folder) =>
        folder.id === id ? { ...folder, deletedAt: null, updatedAt: nowIso() } : folder,
      ),
    };
    return this.persist();
  }

  async saveSettings(settings: Settings) {
    this.data = {
      ...this.data,
      settings,
      settingsByWorkspace: { ...this.data.settingsByWorkspace, [this.workspaceId]: settings },
    };
    return this.persist();
  }

  async createProject(input: CreateProjectInput) {
    const timestamp = nowIso();
    const project: Project = {
      id: createId("project"),
      workspaceId: this.workspaceId,
      name: input.name,
      color: input.color,
      status: "active",
      dueDate: input.dueDate ?? null,
      workingFolder: input.workingFolder ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      deletedAt: null,
    };

    this.data = { ...this.data, projects: [project, ...this.data.projects] };
    return this.persist();
  }

  async updateProject(
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ) {
    this.data = {
      ...this.data,
      projects: this.data.projects.map((project) =>
        project.id === id ? { ...project, ...patch, updatedAt: nowIso() } : project,
      ),
    };
    return this.persist();
  }

  async archiveProject(id: string) {
    const timestamp = nowIso();
    this.data = {
      ...this.data,
      projects: this.data.projects.map((project) =>
        project.id === id
          ? { ...project, status: "archived", archivedAt: timestamp, updatedAt: timestamp }
          : project,
      ),
    };
    return this.persist();
  }

  async unarchiveProject(id: string) {
    this.data = {
      ...this.data,
      projects: this.data.projects.map((project) =>
        project.id === id ? { ...project, status: "active", archivedAt: null, updatedAt: nowIso() } : project,
      ),
    };
    return this.persist();
  }

  async createTask(input: CreateTaskInput) {
    const timestamp = nowIso();
    const task: Task = {
      id: createId("task"),
      workspaceId: this.workspaceId,
      projectId: input.projectId ?? null,
      workingFolder: input.workingFolder ?? null,
      title: input.title,
      notes: input.notes ?? "",
      dueDate: input.dueDate,
      dueTime: input.dueTime ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      priority: input.priority ?? "medium",
      status: "todo",
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      recurrenceTemplateId: null,
      recurrenceInstanceDate: null,
      parentId: input.parentId ?? null,
      tags: normalizeTags(input.tags ?? []),
    };
    const reminder = createReminder(task, input.reminderOffset ?? null);

    this.data = {
      ...this.data,
      tasks: [task, ...this.data.tasks],
      reminders: reminder ? [reminder, ...this.data.reminders] : this.data.reminders,
    };
    return this.persist();
  }

  async createRecurringTask(input: CreateRecurringTaskInput) {
    const timestamp = nowIso();
    const template = createRecurringTemplate(input, this.workspaceId, timestamp);
    const task = buildTaskFromRecurringTemplate(template, input.dueDate, timestamp, () => createId("task"));
    const reminder = createReminder(task, template.reminderOffset);

    this.data = {
      ...this.data,
      recurringTaskTemplates: [template, ...this.data.recurringTaskTemplates],
      tasks: [task, ...this.data.tasks],
      reminders: reminder ? [reminder, ...this.data.reminders] : this.data.reminders,
    };
    return this.persist();
  }

  async updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput) {
    this.data = {
      ...this.data,
      recurringTaskTemplates: this.data.recurringTaskTemplates.map((template) =>
        template.id === id ? { ...template, ...patch, updatedAt: nowIso() } : template,
      ),
    };
    return this.persist();
  }

  async updateRecurringSeries(
    id: string,
    patch: UpdateRecurringTaskTemplateInput,
    mode: "template" | "openFuture",
  ) {
    const timestamp = nowIso();
    const currentTemplate = this.data.recurringTaskTemplates.find((template) => template.id === id);
    if (!currentTemplate) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }

    const nextTemplate = { ...currentTemplate, ...patch, updatedAt: timestamp };
    let tasks = this.data.tasks;
    let reminders = this.data.reminders;

    if (mode === "openFuture") {
      const openIds = new Set(
        this.data.tasks
          .filter(
            (task) =>
              task.recurrenceTemplateId === id &&
              task.deletedAt === null &&
              (task.status === "todo" || task.status === "in_progress"),
          )
          .map((task) => task.id),
      );

      tasks = this.data.tasks.map((task) => {
        if (!openIds.has(task.id)) {
          return task;
        }
        return {
          ...task,
          title: nextTemplate.title,
          notes: nextTemplate.notes,
          projectId: nextTemplate.projectId,
          workingFolder: nextTemplate.workingFolder,
          dueTime: nextTemplate.dueTime,
          priority: nextTemplate.priority,
          updatedAt: timestamp,
        };
      });

      reminders = this.data.reminders.filter((reminder) => !openIds.has(reminder.taskId));
      if (nextTemplate.reminderOffset !== null) {
        for (const task of tasks) {
          if (!openIds.has(task.id)) {
            continue;
          }
          const reminder = createReminder(task, nextTemplate.reminderOffset);
          if (reminder) {
            reminders = [reminder, ...reminders];
          }
        }
      }
    }

    this.data = {
      ...this.data,
      recurringTaskTemplates: this.data.recurringTaskTemplates.map((template) =>
        template.id === id ? nextTemplate : template,
      ),
      tasks,
      reminders,
    };
    return this.persist();
  }

  async disableRecurringTaskTemplate(id: string) {
    this.data = {
      ...this.data,
      recurringTaskTemplates: this.data.recurringTaskTemplates.map((template) =>
        template.id === id ? { ...template, enabled: false, updatedAt: nowIso() } : template,
      ),
    };
    return this.persist();
  }

  async moveTaskToWorkspace(taskId: string, workspaceId: string) {
    const targetWorkspaceId = this.resolveWorkspaceId(workspaceId);
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) =>
        task.id === taskId
          ? { ...task, workspaceId: targetWorkspaceId, projectId: null, updatedAt: nowIso() }
          : task,
      ),
    };
    return this.persist();
  }

  async updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
  ) {
    let updatedTask: Task | null = null;
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        updatedTask = { ...task, ...patch, updatedAt: nowIso() };
        return updatedTask;
      }),
    };

    if (updatedTask) {
      this.data = {
        ...this.data,
        reminders: this.data.reminders.map((reminder) =>
          reminder.taskId === id && reminder.offsetMinutes !== null
            ? {
                ...reminder,
                remindAt: buildReminderDate(updatedTask as Task, reminder.offsetMinutes),
                firedAt: null,
                failedAt: null,
                lastError: null,
                lastAttemptedAt: null,
              }
            : reminder,
        ),
      };
    }

    return this.persist();
  }

  async setTaskParent(taskId: string, parentId: string | null) {
    if (parentId === taskId) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) =>
        task.id === taskId ? { ...task, parentId, updatedAt: nowIso() } : task,
      ),
    };
    return this.persist();
  }

  async addAttachment(input: CreateAttachmentInput) {
    const attachment: Attachment = {
      id: createId("attachment"),
      task_id: input.taskId,
      filename: input.filename,
      path: input.path,
      mimeType: input.mimeType ?? null,
      size: input.size ?? null,
      createdAt: nowIso(),
    };
    this.data = {
      ...this.data,
      attachments: [attachment, ...this.data.attachments],
    };
    return this.persist();
  }

  async deleteAttachment(id: string) {
    this.data = {
      ...this.data,
      attachments: this.data.attachments.filter((attachment) => attachment.id !== id),
    };
    return this.persist();
  }

  async updateTaskReminder(taskId: string, offsetMinutes: number | null) {
    const task = this.data.tasks.find((item) => item.id === taskId && item.deletedAt === null);
    if (!task) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }

    if (offsetMinutes === null) {
      this.data = {
        ...this.data,
        reminders: this.data.reminders.map((reminder) =>
          reminder.taskId === taskId ? { ...reminder, enabled: false } : reminder,
        ),
      };
      return this.persist();
    }

    const existing = this.data.reminders.find((reminder) => reminder.taskId === taskId);
    if (!existing) {
      const reminder = createReminder(task, offsetMinutes);
      this.data = {
        ...this.data,
        reminders: reminder ? [reminder, ...this.data.reminders] : this.data.reminders,
      };
      return this.persist();
    }

    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === existing.id
          ? {
              ...reminder,
              remindAt: buildReminderDate(task, offsetMinutes),
              offsetMinutes,
              snoozedUntil: null,
              firedAt: null,
              failedAt: null,
              lastError: null,
              lastAttemptedAt: null,
              enabled: true,
            }
          : reminder,
      ),
    };
    return this.persist();
  }

  async createTaskReminder(taskId: string, offsetMinutes: number) {
    const task = this.data.tasks.find((item) => item.id === taskId && item.deletedAt === null);
    if (!task) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    const reminder = createReminder(task, offsetMinutes);
    if (!reminder) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    this.data = {
      ...this.data,
      reminders: [...this.data.reminders, reminder],
    };
    return this.persist();
  }

  async deleteReminder(id: string) {
    this.data = {
      ...this.data,
      reminders: this.data.reminders.filter((reminder) => reminder.id !== id),
    };
    return this.persist();
  }

  async toggleTask(id: string) {
    const timestamp = nowIso();
    let completedTask: Task | null = null;
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        // toggle: any non-completed state -> completed; completed -> todo
        const nextStatus: TaskStatus = task.status === "completed" ? "todo" : "completed";
        const nextTask: Task = {
          ...task,
          status: nextStatus,
          completedAt: nextStatus === "completed" ? timestamp : null,
          updatedAt: timestamp,
        };
        if (nextStatus === "completed") {
          completedTask = nextTask;
        }
        return nextTask;
      }),
    };
    if (completedTask) {
      this.generateNextRecurringInstance(completedTask, timestamp);
    }
    return this.persist();
  }

  async setTaskStatus(id: string, status: TaskStatus) {
    const timestamp = nowIso();
    let completedTask: Task | null = null;
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const nextTask: Task = {
          ...task,
          status,
          completedAt: status === "completed" ? timestamp : null,
          updatedAt: timestamp,
        };
        if (status === "completed") {
          completedTask = nextTask;
        }
        return nextTask;
      }),
    };
    if (completedTask) {
      this.generateNextRecurringInstance(completedTask, timestamp);
    }
    return this.persist();
  }

  async bulkSetTaskStatus(ids: string[], status: TaskStatus) {
    if (ids.length === 0) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    const timestamp = nowIso();
    const idSet = new Set(ids);
    const completedTasks: Task[] = [];
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => {
        if (!idSet.has(task.id)) {
          return task;
        }
        const nextTask: Task = {
          ...task,
          status,
          completedAt: status === "completed" ? timestamp : null,
          updatedAt: timestamp,
        };
        if (status === "completed") {
          completedTasks.push(nextTask);
        }
        return nextTask;
      }),
    };
    for (const completedTask of completedTasks) {
      this.generateNextRecurringInstance(completedTask, timestamp);
    }
    return this.persist();
  }

  async bulkDeleteTasks(ids: string[]) {
    if (ids.length === 0) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    const timestamp = nowIso();
    const idSet = new Set(ids);
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => (idSet.has(task.id) ? { ...task, deletedAt: timestamp } : task)),
    };
    return this.persist();
  }

  async bulkMoveTasksToProject(ids: string[], projectId: string | null) {
    if (ids.length === 0) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    const timestamp = nowIso();
    const idSet = new Set(ids);
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => (idSet.has(task.id) ? { ...task, projectId, updatedAt: timestamp } : task)),
    };
    return this.persist();
  }

  async deleteTask(id: string) {
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => (task.id === id ? { ...task, deletedAt: nowIso() } : task)),
    };
    return this.persist();
  }

  async restoreTask(id: string) {
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) =>
        task.id === id ? { ...task, deletedAt: null, updatedAt: nowIso() } : task,
      ),
    };
    return this.persist();
  }

  async markReminderFired(id: string) {
    const current = this.data.reminders.find((reminder) => reminder.id === id);
    const timestamp = nowIso();
    const eventType: ReminderEventType = current?.failedAt ? "retry" : "fired";
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id
          ? { ...reminder, firedAt: timestamp, failedAt: null, lastError: null, lastAttemptedAt: timestamp }
          : reminder,
      ),
    };
    this.appendLocalReminderEvent(id, current?.taskId ?? "", eventType, null, timestamp);
    return this.persist();
  }

  async markReminderFailed(id: string, reason: string) {
    const timestamp = nowIso();
    const current = this.data.reminders.find((reminder) => reminder.id === id);
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, failedAt: timestamp, lastAttemptedAt: timestamp, lastError: reason } : reminder,
      ),
    };
    this.appendLocalReminderEvent(id, current?.taskId ?? "", "failed", reason, timestamp);
    return this.persist();
  }

  async snoozeReminder(id: string, untilIso: string) {
    const current = this.data.reminders.find((reminder) => reminder.id === id);
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id
          ? { ...reminder, snoozedUntil: untilIso, firedAt: null, failedAt: null, lastError: null }
          : reminder,
      ),
    };
    this.appendLocalReminderEvent(id, current?.taskId ?? "", "snoozed", untilIso, nowIso());
    return this.persist();
  }

  async disableReminder(id: string) {
    const current = this.data.reminders.find((reminder) => reminder.id === id);
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, enabled: false } : reminder,
      ),
    };
    this.appendLocalReminderEvent(id, current?.taskId ?? "", "disabled", null, nowIso());
    return this.persist();
  }

  async loadReminderEvents(reminderId: string) {
    return this.reminderEvents
      .filter((event) => event.reminderId === reminderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createSavedView(input: CreateSavedTaskViewInput) {
    const timestamp = nowIso();
    const view: SavedTaskView = {
      id: createId("view"),
      workspaceId: this.workspaceId,
      name: input.name,
      filters: input.filters,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.data = { ...this.data, savedViews: [view, ...this.data.savedViews] };
    return this.persist();
  }

  async updateSavedView(id: string, input: CreateSavedTaskViewInput) {
    this.data = {
      ...this.data,
      savedViews: this.data.savedViews.map((view) =>
        view.id === id ? { ...view, name: input.name, filters: input.filters, updatedAt: nowIso() } : view,
      ),
    };
    return this.persist();
  }

  async deleteSavedView(id: string) {
    const nextSettings = clearDefaultSavedViewIfNeeded(this.data.settings, id);
    this.data = {
      ...this.data,
      savedViews: this.data.savedViews.filter((view) => view.id !== id),
      settings: nextSettings,
      settingsByWorkspace: { ...this.data.settingsByWorkspace, [this.workspaceId]: nextSettings },
    };
    return this.persist();
  }

  async exportBackup() {
    return buildBackupPayload(this.data, this.workspaceId, this.data.settingsByWorkspace, this.reminderEvents);
  }

  async importBackup(payload: BackupPayload, mode: ImportBackupMode = "replace") {
    const backup = normalizeBackupPayload(payload);
    const incomingEvents = normalizeReminderEvents(payload.reminderEvents);
    if (mode === "replace") {
      this.data = backup;
      this.reminderEvents = incomingEvents;
    } else {
      this.data = {
        ...this.data,
        workspaces: upsertById(this.data.workspaces, backup.workspaces),
        workspaceFolders: upsertById(this.data.workspaceFolders, backup.workspaceFolders),
        projects: upsertById(this.data.projects, backup.projects),
        tasks: upsertById(this.data.tasks, backup.tasks),
        reminders: upsertById(this.data.reminders, backup.reminders),
        savedViews: upsertById(this.data.savedViews, backup.savedViews),
        recurringTaskTemplates: upsertById(this.data.recurringTaskTemplates, backup.recurringTaskTemplates),
        attachments: upsertById(this.data.attachments, backup.attachments),
        settingsByWorkspace: { ...this.data.settingsByWorkspace, ...backup.settingsByWorkspace },
      };
      this.reminderEvents = upsertById(this.reminderEvents, incomingEvents);
    }
    this.workspaceId = this.resolveWorkspaceId(payload.workspaceId);
    this.data = {
      ...this.data,
      settings: this.data.settingsByWorkspace[this.workspaceId] ?? this.data.settings,
    };
    return this.persist();
  }

  async exportCurrentWorkspaceCsv() {
    return buildTasksCsv(this.snapshot());
  }

  async exportCurrentWorkspaceIcs() {
    return buildTasksIcs(this.snapshot());
  }

  private appendLocalReminderEvent(
    reminderId: string,
    taskId: string,
    eventType: ReminderEventType,
    detail: string | null,
    createdAt: string,
  ) {
    this.reminderEvents = [
      {
        id: createId("reminder_event"),
        reminderId,
        taskId,
        eventType,
        detail,
        createdAt,
      },
      ...this.reminderEvents,
    ];
  }

  private async persist(): Promise<RepositoryResult> {
    this.data = { ...this.data, workspaceId: this.workspaceId };
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...this.data, reminderEvents: this.reminderEvents }));
    const patch = this.prevData ? diffPatch(this.prevData, this.data) : buildFullPatch();
    this.prevData = this.data;
    return { data: this.snapshot(), patch };
  }

  private resolveWorkspaceId(workspaceId: string) {
    const workspace = this.data.workspaces.find((item) => item.id === workspaceId && item.deletedAt === null);
    return workspace?.id ?? this.data.workspaces.find((item) => item.deletedAt === null)?.id ?? DEFAULT_WORKSPACE_ID;
  }

  private snapshot(): AppData {
    const taskIds = new Set(
      this.data.tasks
        .filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null)
        .map((task) => task.id),
    );

    return {
      ...this.data,
      workspaceId: this.workspaceId,
      settings: this.data.settingsByWorkspace[this.workspaceId] ?? this.data.settings,
      workspaces: this.data.workspaces.filter((workspace) => workspace.deletedAt === null),
      workspaceFolders: this.data.workspaceFolders.filter(
        (folder) => folder.workspaceId === this.workspaceId && folder.deletedAt === null,
      ),
      projects: this.data.projects.filter(
        (project) =>
          project.workspaceId === this.workspaceId && project.deletedAt === null && project.status !== "archived",
      ),
      tasks: this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null),
      deletedTasks: [],
      deletedWorkspaceFolders: [],
      availableTasks: [],
      reminders: this.data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
      savedViews: this.data.savedViews.filter((view) => view.workspaceId === this.workspaceId),
      recurringTaskTemplates: this.data.recurringTaskTemplates.filter(
        (template) => template.workspaceId === this.workspaceId && template.deletedAt === null,
      ),
      attachments: this.data.attachments.filter((attachment) => taskIds.has(attachment.task_id)),
    };
  }

  private generateNextRecurringInstance(task: Task, timestamp: string) {
    if (!task.recurrenceTemplateId || !task.recurrenceInstanceDate) {
      return;
    }

    const template = this.data.recurringTaskTemplates.find(
      (item) => item.id === task.recurrenceTemplateId && item.enabled && item.deletedAt === null,
    );
    if (!template) {
      return;
    }

    const nextDate = getNextRecurrenceDate(template, task.recurrenceInstanceDate);
    if (!nextDate) {
      return;
    }

    const exists = this.data.tasks.some(
      (item) =>
        item.recurrenceTemplateId === template.id &&
        item.recurrenceInstanceDate === nextDate &&
        item.deletedAt === null,
    );
    if (exists) {
      return;
    }

    const nextTask = buildTaskFromRecurringTemplate(template, nextDate, timestamp, () => createId("task"));
    const reminder = createReminder(nextTask, template.reminderOffset);
    this.data = {
      ...this.data,
      tasks: [nextTask, ...this.data.tasks],
      reminders: reminder ? [reminder, ...this.data.reminders] : this.data.reminders,
    };
  }
}

class SqlRepository implements TodoRepository {
  private db: DatabaseHandle | null = null;
  private workspaceId = DEFAULT_WORKSPACE_ID;
  private cachedData: AppData | null = null;

  private async readAllWithPatch(): Promise<RepositoryResult> {
    const data = await this.readAll();
    return { data, patch: buildFullPatch() };
  }

  private async getCache(): Promise<AppData> {
    if (this.cachedData && this.cachedData.workspaceId === this.workspaceId) {
      return this.cachedData;
    }
    return this.readAll();
  }

  private commitCache(next: AppData, affectedKeys: ReadonlyArray<AppDataKey>): RepositoryResult {
    this.cachedData = next;
    return { data: next, patch: { affectedKeys } };
  }

  private replaceTaskInCache(cache: AppData, task: Task): AppData {
    const index = cache.tasks.findIndex((item) => item.id === task.id);
    const tasks =
      index === -1
        ? [task, ...cache.tasks]
        : cache.tasks.map((item, i) => (i === index ? task : item));
    return { ...cache, tasks };
  }

  private replaceReminderInCache(cache: AppData, reminder: Reminder): AppData {
    const index = cache.reminders.findIndex((item) => item.id === reminder.id);
    const reminders =
      index === -1
        ? [reminder, ...cache.reminders]
        : cache.reminders.map((item, i) => (i === index ? reminder : item));
    return { ...cache, reminders };
  }

  async load(workspaceId?: string) {
    await this.connect();
    this.workspaceId = workspaceId ?? DEFAULT_WORKSPACE_ID;
    return this.readAll();
  }

  async selectWorkspace(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.cachedData = null;
    return this.readAllWithPatch();
  }

  async loadAvailableTasks(workspaceId = this.workspaceId) {
    const db = await this.connect();
    const tasks = (await db.select(
      `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE workspace_id != ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [workspaceId],
    )) as Record<string, unknown>[];

    return tasks.map(rowToTask);
  }

  async loadRecoveryItems() {
    const db = await this.connect();
    const deletedTasks = (await db.select(
      `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const deletedWorkspaceFolders = (await db.select(
      "SELECT * FROM workspace_folders WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const archivedProjects = (await db.select(
      "SELECT * FROM projects WHERE workspace_id = ? AND status = 'archived' AND deleted_at IS NULL ORDER BY updated_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];

    return {
      deletedTasks: deletedTasks.map(rowToTask),
      deletedWorkspaceFolders: deletedWorkspaceFolders.map(rowToWorkspaceFolder),
      deletedWorkspaces: (
        (await db.select("SELECT * FROM workspaces WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")) as Record<
          string,
          unknown
        >[]
      ).map(rowToWorkspace),
      archivedProjects: archivedProjects.map(rowToProject),
    };
  }

  async loadTaskPage(input: TaskPageInput) {
    const db = await this.connect();
    const normalized = normalizeTaskPageInput(input, this.workspaceId);
    const where = ["workspace_id = ?", "deleted_at IS NULL"];
    const values: unknown[] = [normalized.workspaceId];

    if (normalized.scope === "open") {
      // "open" = active tasks (todo + in_progress), exclude terminal states
      where.push("(status = ? OR status = ?)");
      values.push("todo", "in_progress");
    } else if (normalized.scope === "completed") {
      where.push("status = ?");
      values.push("completed");
    } else if (normalized.scope === "cancelled") {
      where.push("status = ?");
      values.push("cancelled");
    }

    if (normalized.date) {
      where.push("due_date = ?");
      values.push(normalized.date);
    }

    if (normalized.projectId === "none") {
      where.push("project_id IS NULL");
    } else if (normalized.projectId) {
      where.push("project_id = ?");
      values.push(normalized.projectId);
    }

    if (normalized.priority !== "all") {
      where.push("priority = ?");
      values.push(normalized.priority);
    }

    if (normalized.reminder === "with") {
      where.push("EXISTS (SELECT 1 FROM reminders WHERE reminders.task_id = tasks.id AND reminders.enabled = 1)");
    } else if (normalized.reminder === "without") {
      where.push("NOT EXISTS (SELECT 1 FROM reminders WHERE reminders.task_id = tasks.id AND reminders.enabled = 1)");
    }

    if (normalized.folder === "with") {
      where.push("working_folder IS NOT NULL AND working_folder <> ''");
    } else if (normalized.folder === "without") {
      where.push("(working_folder IS NULL OR working_folder = '')");
    }

    if (normalized.dateRange === "today") {
      where.push("due_date = ?");
      values.push(normalized.referenceDate);
    } else if (normalized.dateRange === "overdue") {
      where.push("(status = ? OR status = ?) AND due_date < ?");
      values.push("todo", "in_progress", normalized.referenceDate);
    } else if (normalized.dateRange === "week") {
      where.push("due_date >= ? AND due_date <= ?");
      values.push(normalized.referenceDate, toDateKey(endOfWeek(parseDateKey(normalized.referenceDate))));
    }

    if (normalized.query) {
      where.push(
        `(LOWER(title) LIKE ?
          OR LOWER(notes) LIKE ?
          OR due_date LIKE ?
          OR COALESCE(due_time, '') LIKE ?
          OR EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND LOWER(projects.name) LIKE ?))`,
      );
      const query = `%${normalized.query}%`;
      values.push(query, query, query, query, query);
    }

    appendTagFiltersSql(where, values, normalized.tags, normalized.tagMatch);
    appendAdvancedFilterSql(where, values, normalized.advancedFilter);

    const whereSql = where.join(" AND ");
    const orderSql =
      normalized.sort === "createdDesc"
        ? "created_at DESC"
        : `${normalized.sort === "overview" ? "CASE status WHEN 'todo' THEN 0 ELSE 1 END ASC, " : ""}due_date ASC,
           COALESCE(due_time, '99:99') ASC,
           CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
           created_at ASC`;
    const countRows = (await db.select(`SELECT COUNT(*) AS total FROM tasks WHERE ${whereSql}`, values)) as Record<
      string,
      unknown
    >[];
    const taskRows = (await db.select(
      `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...values, normalized.limit, normalized.offset],
    )) as Record<string, unknown>[];
    const tasks = taskRows.map(rowToTask);

    if (tasks.length === 0) {
      return {
        tasks,
        total: Number(countRows[0]?.total ?? 0),
        reminders: [],
      };
    }

    const placeholders = tasks.map(() => "?").join(", ");
    const reminders = (await db.select(
      `SELECT * FROM reminders WHERE task_id IN (${placeholders}) ORDER BY remind_at ASC`,
      tasks.map((task) => task.id),
    )) as Record<string, unknown>[];

    return {
      tasks,
      total: Number(countRows[0]?.total ?? 0),
      reminders: reminders.map(rowToReminder),
    };
  }

  async loadDueDateCounts(input: { workspaceId?: string; from: string; to: string }) {
    const db = await this.connect();
    const workspaceId = input.workspaceId ?? this.workspaceId;
    const rows = (await db.select(
      `SELECT due_date AS dueDate, COUNT(*) AS total
       FROM tasks
       WHERE workspace_id = ? AND deleted_at IS NULL AND due_date >= ? AND due_date <= ?
       GROUP BY due_date`,
      [workspaceId, input.from, input.to],
    )) as Record<string, unknown>[];
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[String(row.dueDate)] = Number(row.total ?? 0);
    }
    return counts;
  }

  async createWorkspace(input: CreateWorkspaceInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    const id = createId("workspace");

    await db.execute(
      `INSERT INTO workspaces (id, name, color, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.name, input.color, timestamp, timestamp, null],
    );
    await insertSettings(db, id, DEFAULT_SETTINGS);
    this.workspaceId = id;
    return this.readAllWithPatch();
  }

  async updateWorkspace(id: string, patch: UpdateWorkspaceInput) {
    const data = await this.readAll();
    const current = data.workspaces.find((workspace) => workspace.id === id);
    if (!current) {
      return { data, patch: buildFullPatch() };
    }

    const next = { ...current, ...patch };
    const db = await this.connect();
    await db.execute("UPDATE workspaces SET name = ?, color = ?, updated_at = ? WHERE id = ?", [
      next.name,
      next.color,
      nowIso(),
      id,
    ]);
    return this.readAllWithPatch();
  }

  async deleteWorkspace(id: string) {
    const data = await this.readAll();
    const activeWorkspaces = data.workspaces.filter((workspace) => workspace.deletedAt === null);
    if (activeWorkspaces.length <= 1 && activeWorkspaces.some((workspace) => workspace.id === id)) {
      throw new Error(CANNOT_DELETE_LAST_WORKSPACE);
    }

    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute("UPDATE workspaces SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);

    if (this.workspaceId === id) {
      const nextWorkspace = activeWorkspaces.find((workspace) => workspace.id !== id);
      if (nextWorkspace) {
        this.workspaceId = nextWorkspace.id;
      }
    }

    return this.readAllWithPatch();
  }

  async restoreWorkspace(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE workspaces SET deleted_at = NULL, updated_at = ? WHERE id = ?", [nowIso(), id]);
    return this.readAllWithPatch();
  }

  async createWorkspaceFolder(input: CreateWorkspaceFolderInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      `INSERT INTO workspace_folders (id, workspace_id, name, path, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [createId("folder"), this.workspaceId, input.name, input.path, timestamp, timestamp, null],
    );
    return this.readAllWithPatch();
  }

  async deleteWorkspaceFolder(id: string) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute("UPDATE workspace_folders SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);
    return this.readAllWithPatch();
  }

  async restoreWorkspaceFolder(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE workspace_folders SET deleted_at = NULL, updated_at = ? WHERE id = ?", [nowIso(), id]);
    return this.readAllWithPatch();
  }

  async saveSettings(settings: Settings) {
    const db = await this.connect();
    await db.execute(
      `INSERT INTO settings (workspace_id, theme, accent_color, language, default_reminder_offset, default_working_folder, default_saved_view_id, notifications_enabled, close_to_tray)
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
        this.workspaceId,
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
    return this.readAllWithPatch();
  }

  async createProject(input: CreateProjectInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      `INSERT INTO projects
       (id, workspace_id, name, color, status, due_date, working_folder, created_at, updated_at, archived_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createId("project"),
        this.workspaceId,
        input.name,
        input.color,
        "active",
        input.dueDate ?? null,
        input.workingFolder ?? null,
        timestamp,
        timestamp,
        null,
        null,
      ],
    );
    return this.readAllWithPatch();
  }

  async updateProject(
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ) {
    const data = await this.readAll();
    const current = data.projects.find((project) => project.id === id);
    if (!current) {
      return { data, patch: buildFullPatch() };
    }

    const next = { ...current, ...patch };
    const db = await this.connect();
    await db.execute(
      `UPDATE projects
       SET name = ?, color = ?, status = ?, due_date = ?, working_folder = ?, updated_at = ?
       WHERE id = ?`,
      [next.name, next.color, next.status, next.dueDate, next.workingFolder, nowIso(), id],
    );
    return this.readAllWithPatch();
  }

  async archiveProject(id: string) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute("UPDATE projects SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?", [
      "archived",
      timestamp,
      timestamp,
      id,
    ]);
    return this.readAllWithPatch();
  }

  async unarchiveProject(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE projects SET status = ?, archived_at = NULL, updated_at = ? WHERE id = ?", [
      "active",
      nowIso(),
      id,
    ]);
    return this.readAllWithPatch();
  }

  async createTask(input: CreateTaskInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    const task: Task = {
      id: createId("task"),
      workspaceId: this.workspaceId,
      projectId: input.projectId ?? null,
      workingFolder: input.workingFolder ?? null,
      title: input.title,
      notes: input.notes ?? "",
      dueDate: input.dueDate,
      dueTime: input.dueTime ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      priority: input.priority ?? "medium",
      status: "todo",
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      recurrenceTemplateId: null,
      recurrenceInstanceDate: null,
      parentId: input.parentId ?? null,
      tags: normalizeTags(input.tags ?? []),
    };

    const reminder = createReminder(task, input.reminderOffset ?? null);
    await withTransaction(db, async () => {
      await insertTask(db, task);
      if (reminder) {
        await insertReminder(db, reminder);
      }
    });

    return this.readAllWithPatch();
  }

  async createRecurringTask(input: CreateRecurringTaskInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    const template = createRecurringTemplate(input, this.workspaceId, timestamp);
    const task = buildTaskFromRecurringTemplate(template, input.dueDate, timestamp, () => createId("task"));

    const reminder = createReminder(task, template.reminderOffset);
    await withTransaction(db, async () => {
      await insertRecurringTaskTemplate(db, template);
      await insertTask(db, task);
      if (reminder) {
        await insertReminder(db, reminder);
      }
    });

    return this.readAllWithPatch();
  }

  async updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput) {
    const data = await this.readAll();
    const current = data.recurringTaskTemplates.find((template) => template.id === id);
    if (!current) {
      return { data, patch: buildFullPatch() };
    }

    const next = { ...current, ...patch, updatedAt: nowIso() };
    const db = await this.connect();
    await db.execute(
      `UPDATE recurring_task_templates
       SET title = ?, notes = ?, project_id = ?, working_folder = ?, due_time = ?, priority = ?, reminder_offset = ?, frequency = ?, interval = ?, by_weekday = ?, end_date = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.title,
        next.notes,
        next.projectId,
        next.workingFolder,
        next.dueTime,
        next.priority,
        next.reminderOffset,
        next.frequency,
        next.interval,
        serializeByWeekday(next.byWeekday),
        next.endDate,
        next.updatedAt,
        id,
      ],
    );
    return this.readAllWithPatch();
  }

  async updateRecurringSeries(
    id: string,
    patch: UpdateRecurringTaskTemplateInput,
    mode: "template" | "openFuture",
  ) {
    if (mode === "template") {
      return this.updateRecurringTaskTemplate(id, patch);
    }

    const data = await this.readAll();
    const current = data.recurringTaskTemplates.find((template) => template.id === id);
    if (!current) {
      return { data, patch: buildFullPatch() };
    }

    const timestamp = nowIso();
    const next = { ...current, ...patch, updatedAt: timestamp };
    const openTasks = data.tasks.filter(
      (task) =>
        task.recurrenceTemplateId === id &&
        task.deletedAt === null &&
        (task.status === "todo" || task.status === "in_progress"),
    );
    const db = await this.connect();
    await withTransaction(db, async () => {
      await db.execute(
        `UPDATE recurring_task_templates
         SET title = ?, notes = ?, project_id = ?, working_folder = ?, due_time = ?, priority = ?, reminder_offset = ?, frequency = ?, interval = ?, by_weekday = ?, end_date = ?, updated_at = ?
         WHERE id = ?`,
        [
          next.title,
          next.notes,
          next.projectId,
          next.workingFolder,
          next.dueTime,
          next.priority,
          next.reminderOffset,
          next.frequency,
          next.interval,
          serializeByWeekday(next.byWeekday),
          next.endDate,
          next.updatedAt,
          id,
        ],
      );

      for (const task of openTasks) {
        const updatedTask = {
          ...task,
          title: next.title,
          notes: next.notes,
          projectId: next.projectId,
          workingFolder: next.workingFolder,
          dueTime: next.dueTime,
          priority: next.priority,
          updatedAt: timestamp,
        };
        await db.execute(
          `UPDATE tasks
           SET project_id = ?, working_folder = ?, title = ?, notes = ?, due_time = ?, priority = ?, updated_at = ?
           WHERE id = ?`,
          [
            updatedTask.projectId,
            updatedTask.workingFolder,
            updatedTask.title,
            updatedTask.notes,
            updatedTask.dueTime,
            updatedTask.priority,
            updatedTask.updatedAt,
            updatedTask.id,
          ],
        );
        await db.execute("DELETE FROM reminders WHERE task_id = ?", [task.id]);
        const reminder = createReminder(updatedTask, next.reminderOffset);
        if (reminder) {
          await insertReminder(db, reminder);
        }
      }
    });

    return this.readAllWithPatch();
  }

  async disableRecurringTaskTemplate(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE recurring_task_templates SET enabled = ?, updated_at = ? WHERE id = ?", [0, nowIso(), id]);
    return this.readAllWithPatch();
  }

  async moveTaskToWorkspace(taskId: string, workspaceId: string) {
    const db = await this.connect();
    // Validate target workspace exists and is not deleted to prevent orphan tasks
    const workspaces = (await db.select("SELECT id FROM workspaces WHERE id = ? AND deleted_at IS NULL", [workspaceId])) as Record<string, unknown>[];
    if (workspaces.length === 0) {
      return this.readAllWithPatch();
    }
    await db.execute("UPDATE tasks SET workspace_id = ?, project_id = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [
      workspaceId,
      nowIso(),
      taskId,
    ]);
    return this.readAllWithPatch();
  }

  async updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
  ) {
    const data = await this.readAll();
    const current = data.tasks.find((task) => task.id === id);
    if (!current) {
      return { data, patch: buildFullPatch() };
    }

    const next = { ...current, ...patch, updatedAt: nowIso() };
    const db = await this.connect();
    const taskReminders = data.reminders.filter((reminder) => reminder.taskId === id && reminder.offsetMinutes !== null);
    await withTransaction(db, async () => {
      await db.execute(
        `UPDATE tasks
         SET project_id = ?, working_folder = ?, title = ?, notes = ?, due_date = ?, due_time = ?, priority = ?, tags = ?, updated_at = ?
         WHERE id = ?`,
        [next.projectId, next.workingFolder, next.title, next.notes, next.dueDate, next.dueTime, next.priority, serializeTags(next.tags), next.updatedAt, id],
      );
      for (const reminder of taskReminders) {
        await db.execute(
          `UPDATE reminders
           SET remind_at = ?, snoozed_until = NULL, fired_at = NULL, failed_at = NULL, last_error = NULL, last_attempted_at = NULL
           WHERE id = ?`,
          [buildReminderDate(next, reminder.offsetMinutes as number), reminder.id],
        );
      }
    });
    return this.readAllWithPatch();
  }

  async setTaskParent(taskId: string, parentId: string | null) {
    if (parentId === taskId) {
      return this.readAllWithPatch();
    }
    const db = await this.connect();
    await db.execute("UPDATE tasks SET parent_id = ?, updated_at = ? WHERE id = ?", [parentId, nowIso(), taskId]);
    return this.readAllWithPatch();
  }

  async addAttachment(input: CreateAttachmentInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      `INSERT INTO attachments (id, task_id, filename, path, mime_type, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [createId("attachment"), input.taskId, input.filename, input.path, input.mimeType ?? null, input.size ?? null, timestamp],
    );
    return this.readAllWithPatch();
  }

  async deleteAttachment(id: string) {
    const db = await this.connect();
    await db.execute("DELETE FROM attachments WHERE id = ?", [id]);
    return this.readAllWithPatch();
  }

  async updateTaskReminder(taskId: string, offsetMinutes: number | null) {
    const data = await this.readAll();
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) {
      return { data, patch: buildFullPatch() };
    }

    const db = await this.connect();
    if (offsetMinutes === null) {
      await db.execute("UPDATE reminders SET enabled = ? WHERE task_id = ?", [0, taskId]);
      return this.readAllWithPatch();
    }

    const existingRows = (await db.select(
      "SELECT * FROM reminders WHERE task_id = ? ORDER BY remind_at ASC LIMIT 1",
      [taskId],
    )) as Record<string, unknown>[];
    const existing = existingRows[0] ? rowToReminder(existingRows[0]) : null;
    const remindAt = buildReminderDate(task, offsetMinutes);

    if (!existing) {
      const reminder = createReminder(task, offsetMinutes);
      if (reminder) {
        await insertReminder(db, reminder);
      }
      return this.readAllWithPatch();
    }

    await db.execute(
      `UPDATE reminders
       SET remind_at = ?, offset_minutes = ?, snoozed_until = NULL, fired_at = NULL, failed_at = NULL, last_error = NULL, last_attempted_at = NULL, enabled = ?
       WHERE id = ?`,
      [remindAt, offsetMinutes, 1, existing.id],
    );
    return this.readAllWithPatch();
  }

  async createTaskReminder(taskId: string, offsetMinutes: number) {
    const data = await this.readAll();
    const task = data.tasks.find((item) => item.id === taskId && item.deletedAt === null);
    if (!task) {
      return { data, patch: { affectedKeys: [] } };
    }
    const reminder = createReminder(task, offsetMinutes);
    if (!reminder) {
      return { data, patch: { affectedKeys: [] } };
    }
    const db = await this.connect();
    await insertReminder(db, reminder);
    return this.readAllWithPatch();
  }

  async deleteReminder(id: string) {
    const db = await this.connect();
    await db.execute("DELETE FROM reminders WHERE id = ?", [id]);
    return this.readAllWithPatch();
  }

  async toggleTask(id: string) {
    const cache = await this.getCache();
    const current = cache.tasks.find((task) => task.id === id);
    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    const timestamp = nowIso();
    const nextStatus: TaskStatus = current.status === "completed" ? "todo" : "completed";
    const updatedTask: Task = {
      ...current,
      status: nextStatus,
      completedAt: nextStatus === "completed" ? timestamp : null,
      updatedAt: timestamp,
    };

    const db = await this.connect();
    let created: { task: Task; reminder: Reminder | null } | null = null;
    await withTransaction(db, async () => {
      await db.execute("UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", [
        nextStatus,
        nextStatus === "completed" ? timestamp : null,
        timestamp,
        id,
      ]);
      if (nextStatus === "completed") {
        created = await this.insertNextRecurringInstance(current, timestamp, db);
      }
    });

    let next = this.replaceTaskInCache(cache, updatedTask);
    const affectedKeys: AppDataKey[] = ["tasks"];
    if (created) {
      const { task: nextTask, reminder } = created;
      next = this.replaceTaskInCache(next, nextTask);
      if (reminder) {
        next = this.replaceReminderInCache(next, reminder);
        affectedKeys.push("reminders");
      }
    }
    return this.commitCache(next, affectedKeys);
  }

  async setTaskStatus(id: string, status: TaskStatus) {
    const cache = await this.getCache();
    const current = cache.tasks.find((task) => task.id === id);
    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    const timestamp = nowIso();
    const updatedTask: Task = {
      ...current,
      status,
      completedAt: status === "completed" ? timestamp : null,
      updatedAt: timestamp,
    };

    const db = await this.connect();
    let created: { task: Task; reminder: Reminder | null } | null = null;
    await withTransaction(db, async () => {
      await db.execute("UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", [
        status,
        status === "completed" ? timestamp : null,
        timestamp,
        id,
      ]);
      if (status === "completed") {
        created = await this.insertNextRecurringInstance(current, timestamp, db);
      }
    });

    let next = this.replaceTaskInCache(cache, updatedTask);
    const affectedKeys: AppDataKey[] = ["tasks"];
    if (created) {
      const { task: nextTask, reminder } = created;
      next = this.replaceTaskInCache(next, nextTask);
      if (reminder) {
        next = this.replaceReminderInCache(next, reminder);
        affectedKeys.push("reminders");
      }
    }
    return this.commitCache(next, affectedKeys);
  }

  async bulkSetTaskStatus(ids: string[], status: TaskStatus) {
    if (ids.length === 0) {
      return this.readAllWithPatch();
    }
    const data = await this.readAll();
    const timestamp = nowIso();
    const placeholders = ids.map(() => "?").join(", ");
    const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
    const completedTasks: Task[] = [];
    const db = await this.connect();
    await withTransaction(db, async () => {
      await db.execute(
        `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
        [status, status === "completed" ? timestamp : null, timestamp, ...ids],
      );
      if (status === "completed") {
        for (const id of ids) {
          const task = tasksById.get(id);
          if (task) {
            await this.insertNextRecurringInstance(task, timestamp, db);
          }
        }
      }
    });
    void completedTasks; // collected for parity with LocalRepository; SQL path uses insertNextRecurringInstance directly
    return this.readAllWithPatch();
  }

  async bulkDeleteTasks(ids: string[]) {
    if (ids.length === 0) {
      return this.readAllWithPatch();
    }
    const timestamp = nowIso();
    const placeholders = ids.map(() => "?").join(", ");
    const db = await this.connect();
    await withTransaction(db, async () => {
      await db.execute(
        `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
        [timestamp, timestamp, ...ids],
      );
    });
    return this.readAllWithPatch();
  }

  async bulkMoveTasksToProject(ids: string[], projectId: string | null) {
    if (ids.length === 0) {
      return this.readAllWithPatch();
    }
    const timestamp = nowIso();
    const placeholders = ids.map(() => "?").join(", ");
    const db = await this.connect();
    await withTransaction(db, async () => {
      await db.execute(
        `UPDATE tasks SET project_id = ?, updated_at = ? WHERE id IN (${placeholders})`,
        [projectId, timestamp, ...ids],
      );
    });
    return this.readAllWithPatch();
  }

  async deleteTask(id: string) {
    const cache = await this.getCache();
    const timestamp = nowIso();
    const db = await this.connect();
    await db.execute("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);

    const next: AppData = {
      ...cache,
      tasks: cache.tasks.filter((task) => task.id !== id),
      reminders: cache.reminders.filter((reminder) => reminder.taskId !== id),
      attachments: (cache.attachments ?? []).filter((attachment) => attachment.task_id !== id),
    };
    const affectedKeys: AppDataKey[] = ["tasks", "reminders"];
    if ((cache.attachments ?? []).some((attachment) => attachment.task_id === id)) {
      affectedKeys.push("attachments");
    }
    return this.commitCache(next, affectedKeys);
  }

  async restoreTask(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?", [nowIso(), id]);
    return this.readAllWithPatch();
  }

  async markReminderFired(id: string) {
    const cache = await this.getCache();
    const timestamp = nowIso();
    const db = await this.connect();
    const current = cache.reminders.find((reminder) => reminder.id === id);
    await db.execute(
      "UPDATE reminders SET fired_at = ?, failed_at = NULL, last_error = NULL, last_attempted_at = ? WHERE id = ?",
      [timestamp, timestamp, id],
    );

    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    await insertReminderEvent(db, {
      id: createId("reminder_event"),
      reminderId: id,
      taskId: current.taskId,
      eventType: current.failedAt ? "retry" : "fired",
      detail: null,
      createdAt: timestamp,
    });

    const updated: Reminder = {
      ...current,
      firedAt: timestamp,
      failedAt: null,
      lastError: null,
      lastAttemptedAt: timestamp,
    };
    return this.commitCache(this.replaceReminderInCache(cache, updated), ["reminders"]);
  }

  async markReminderFailed(id: string, reason: string) {
    const cache = await this.getCache();
    const timestamp = nowIso();
    const db = await this.connect();
    const current = cache.reminders.find((reminder) => reminder.id === id);
    await db.execute("UPDATE reminders SET failed_at = ?, last_attempted_at = ?, last_error = ? WHERE id = ?", [
      timestamp,
      timestamp,
      reason,
      id,
    ]);

    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    await insertReminderEvent(db, {
      id: createId("reminder_event"),
      reminderId: id,
      taskId: current.taskId,
      eventType: "failed",
      detail: reason,
      createdAt: timestamp,
    });

    const updated: Reminder = {
      ...current,
      failedAt: timestamp,
      lastAttemptedAt: timestamp,
      lastError: reason,
    };
    return this.commitCache(this.replaceReminderInCache(cache, updated), ["reminders"]);
  }

  async snoozeReminder(id: string, untilIso: string) {
    const cache = await this.getCache();
    const db = await this.connect();
    const current = cache.reminders.find((reminder) => reminder.id === id);
    await db.execute(
      "UPDATE reminders SET snoozed_until = ?, fired_at = NULL, failed_at = NULL, last_error = NULL WHERE id = ?",
      [untilIso, id],
    );

    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    await insertReminderEvent(db, {
      id: createId("reminder_event"),
      reminderId: id,
      taskId: current.taskId,
      eventType: "snoozed",
      detail: untilIso,
      createdAt: nowIso(),
    });

    const updated: Reminder = {
      ...current,
      snoozedUntil: untilIso,
      firedAt: null,
      failedAt: null,
      lastError: null,
    };
    return this.commitCache(this.replaceReminderInCache(cache, updated), ["reminders"]);
  }

  async disableReminder(id: string) {
    const cache = await this.getCache();
    const db = await this.connect();
    const current = cache.reminders.find((reminder) => reminder.id === id);
    await db.execute("UPDATE reminders SET enabled = ? WHERE id = ?", [0, id]);

    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    await insertReminderEvent(db, {
      id: createId("reminder_event"),
      reminderId: id,
      taskId: current.taskId,
      eventType: "disabled",
      detail: null,
      createdAt: nowIso(),
    });

    const updated: Reminder = { ...current, enabled: false };
    return this.commitCache(this.replaceReminderInCache(cache, updated), ["reminders"]);
  }

  async loadReminderEvents(reminderId: string) {
    const db = await this.connect();
    const rows = (await db.select(
      `SELECT id, reminder_id, task_id, event_type, detail, created_at
       FROM reminder_events
       WHERE reminder_id = ?
       ORDER BY created_at DESC`,
      [reminderId],
    )) as Record<string, unknown>[];
    return rows.map(rowToReminderEvent);
  }

  async createSavedView(input: CreateSavedTaskViewInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      `INSERT INTO saved_views (id, workspace_id, name, filters_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [createId("view"), this.workspaceId, input.name, JSON.stringify(input.filters), timestamp, timestamp],
    );
    return this.readAllWithPatch();
  }

  async updateSavedView(id: string, input: CreateSavedTaskViewInput) {
    const db = await this.connect();
    await db.execute("UPDATE saved_views SET name = ?, filters_json = ?, updated_at = ? WHERE id = ?", [
      input.name,
      JSON.stringify(input.filters),
      nowIso(),
      id,
    ]);
    return this.readAllWithPatch();
  }

  async deleteSavedView(id: string) {
    const db = await this.connect();
    await db.execute("DELETE FROM saved_views WHERE id = ?", [id]);

    const data = await this.readAll();
    const nextSettings = clearDefaultSavedViewIfNeeded(data.settings, id);
    if (nextSettings.defaultSavedViewId !== data.settings.defaultSavedViewId) {
      return this.saveSettings(nextSettings);
    }

    return { data, patch: buildFullPatch() };
  }

  async exportBackup() {
    const db = await this.connect();
    const workspaces = ((await db.select("SELECT * FROM workspaces ORDER BY created_at DESC")) as Record<string, unknown>[]).map(
      rowToWorkspace,
    );
    const workspaceFolders = (
      (await db.select("SELECT * FROM workspace_folders ORDER BY created_at DESC")) as Record<string, unknown>[]
    ).map(rowToWorkspaceFolder);
    const projects = ((await db.select("SELECT * FROM projects ORDER BY created_at DESC")) as Record<string, unknown>[]).map(
      rowToProject,
    );
    const tasks = ((await db.select("SELECT * FROM tasks ORDER BY created_at DESC")) as Record<string, unknown>[]).map(rowToTask);
    const reminders = ((await db.select("SELECT * FROM reminders ORDER BY remind_at ASC")) as Record<string, unknown>[]).map(
      rowToReminder,
    );
    const recurringTaskTemplates = (
      (await db.select("SELECT * FROM recurring_task_templates ORDER BY created_at DESC")) as Record<string, unknown>[]
    ).map(rowToRecurringTaskTemplate);
    const savedViews = ((await db.select("SELECT * FROM saved_views ORDER BY created_at DESC")) as Record<string, unknown>[]).map(
      rowToSavedTaskView,
    );
    const attachments = ((await db.select("SELECT * FROM attachments ORDER BY created_at DESC")) as Record<string, unknown>[]).map(
      rowToAttachment,
    );
    const reminderEvents = (
      (await db.select("SELECT * FROM reminder_events ORDER BY created_at DESC")) as Record<string, unknown>[]
    ).map(rowToReminderEvent);
    const settingsRows = (await db.select("SELECT * FROM settings")) as Record<string, unknown>[];
    const settingsByWorkspace = Object.fromEntries(
      settingsRows.map((row) => [String(row.workspace_id), rowToSettings(row)]),
    );

    return buildBackupPayload(
      { workspaceId: this.workspaceId, workspaces, workspaceFolders, projects, tasks, reminders, savedViews, recurringTaskTemplates, attachments },
      this.workspaceId,
      settingsByWorkspace,
      reminderEvents,
    );
  }

  async importBackup(payload: BackupPayload, mode: ImportBackupMode = "replace") {
    const backup = normalizeBackupPayload(payload);
    const incomingEvents = normalizeReminderEvents(payload.reminderEvents);
    const db = await this.connect();

    await db.execute("BEGIN TRANSACTION");
    try {
      if (mode === "replace") {
        await db.execute("DELETE FROM reminder_events");
        await db.execute("DELETE FROM attachments");
        await db.execute("DELETE FROM reminders");
        await db.execute("DELETE FROM saved_views");
        await db.execute("DELETE FROM tasks");
        await db.execute("DELETE FROM recurring_task_templates");
        await db.execute("DELETE FROM workspace_folders");
        await db.execute("DELETE FROM projects");
        await db.execute("DELETE FROM settings");
        await db.execute("DELETE FROM workspaces");

        for (const workspace of backup.workspaces) {
          await db.execute(
            "INSERT INTO workspaces (id, name, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)",
            [workspace.id, workspace.name, workspace.color, workspace.createdAt, workspace.updatedAt, workspace.deletedAt],
          );
        }
        for (const [workspaceId, settings] of Object.entries(backup.settingsByWorkspace)) {
          await insertSettings(db, workspaceId, settings);
        }
        for (const folder of backup.workspaceFolders) {
          await db.execute(
            `INSERT INTO workspace_folders (id, workspace_id, name, path, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [folder.id, folder.workspaceId, folder.name, folder.path, folder.createdAt, folder.updatedAt, folder.deletedAt],
          );
        }
        for (const project of backup.projects) {
          await db.execute(
            `INSERT INTO projects
             (id, workspace_id, name, color, status, due_date, working_folder, created_at, updated_at, archived_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        }
        for (const task of backup.tasks) {
          await insertTask(db, task);
        }
        for (const template of backup.recurringTaskTemplates) {
          await insertRecurringTaskTemplate(db, template);
        }
        for (const reminder of backup.reminders) {
          await insertReminder(db, reminder);
        }
        for (const view of backup.savedViews) {
          await db.execute(
            `INSERT INTO saved_views (id, workspace_id, name, filters_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [view.id, view.workspaceId, view.name, JSON.stringify(view.filters), view.createdAt, view.updatedAt],
          );
        }
        for (const attachment of backup.attachments) {
          await insertAttachment(db, attachment);
        }
        for (const event of incomingEvents) {
          await insertReminderEvent(db, event);
        }
      } else {
        for (const workspace of backup.workspaces) {
          await upsertWorkspace(db, workspace);
        }
        for (const [workspaceId, settings] of Object.entries(backup.settingsByWorkspace)) {
          await upsertSettings(db, workspaceId, settings);
        }
        for (const folder of backup.workspaceFolders) {
          await upsertWorkspaceFolder(db, folder);
        }
        for (const project of backup.projects) {
          await upsertProject(db, project);
        }
        for (const task of backup.tasks) {
          await upsertTask(db, task);
        }
        for (const template of backup.recurringTaskTemplates) {
          await upsertRecurringTaskTemplate(db, template);
        }
        for (const reminder of backup.reminders) {
          await upsertReminder(db, reminder);
        }
        for (const view of backup.savedViews) {
          await upsertSavedView(db, view);
        }
        for (const attachment of backup.attachments) {
          await upsertAttachment(db, attachment);
        }
        for (const event of incomingEvents) {
          await upsertReminderEvent(db, event);
        }
      }

      await db.execute("COMMIT");
    } catch (err) {
      await db.execute("ROLLBACK");
      throw err;
    }

    this.workspaceId = this.resolveImportedWorkspaceId(backup, payload.workspaceId);
    return this.readAllWithPatch();
  }

  async exportCurrentWorkspaceCsv() {
    return buildTasksCsv(await this.readAll());
  }

  async exportCurrentWorkspaceIcs() {
    return buildTasksIcs(await this.readAll());
  }

  private async connect() {
    this.db ??= await Database.load(DB_URL);
    return this.db;
  }

  private async readAll(): Promise<AppData> {
    const db = await this.connect();
    const workspaces = (await db.select(
      "SELECT * FROM workspaces WHERE deleted_at IS NULL ORDER BY created_at DESC",
    )) as Record<string, unknown>[];
    const workspaceRows = workspaces.map(rowToWorkspace);
    const workspaceExists = workspaceRows.some((workspace) => workspace.id === this.workspaceId);
    if (!workspaceExists) {
      this.workspaceId = workspaceRows[0]?.id ?? DEFAULT_WORKSPACE_ID;
    }

    // Run all per-workspace SELECTs in parallel — these are independent reads
    // and the previous sequential await chain accounted for most of readAll's
    // wall-clock latency on cold loads.
    const [
      projects,
      tasks,
      workspaceFolders,
      reminders,
      settingsRows,
      allSettingsRows,
      savedViews,
      recurringTaskTemplates,
      attachments,
    ] = await Promise.all([
      db.select(
        "SELECT * FROM projects WHERE workspace_id = ? AND deleted_at IS NULL AND status != 'archived' ORDER BY created_at DESC",
        [this.workspaceId],
      ),
      db.select("SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [
        this.workspaceId,
      ]),
      db.select(
        "SELECT * FROM workspace_folders WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
        [this.workspaceId],
      ),
      db.select(
        `SELECT reminders.*
         FROM reminders
         INNER JOIN tasks ON tasks.id = reminders.task_id
         WHERE tasks.workspace_id = ? AND tasks.deleted_at IS NULL
         ORDER BY reminders.remind_at ASC`,
        [this.workspaceId],
      ),
      db.select("SELECT * FROM settings WHERE workspace_id = ?", [this.workspaceId]),
      db.select("SELECT * FROM settings"),
      db.select("SELECT * FROM saved_views WHERE workspace_id = ? ORDER BY created_at DESC", [this.workspaceId]),
      db.select(
        "SELECT * FROM recurring_task_templates WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
        [this.workspaceId],
      ),
      db.select(
        `SELECT attachments.*
         FROM attachments
         INNER JOIN tasks ON tasks.id = attachments.task_id
         WHERE tasks.workspace_id = ? AND tasks.deleted_at IS NULL
         ORDER BY attachments.created_at DESC`,
        [this.workspaceId],
      ),
    ]);

    const settingsRow = (settingsRows as Record<string, unknown>[])[0];
    const settingsByWorkspace: Record<string, Settings> = {};
    for (const row of allSettingsRows as Record<string, unknown>[]) {
      const workspaceId = String(row.workspace_id);
      if (!settingsByWorkspace[workspaceId]) {
        settingsByWorkspace[workspaceId] = rowToSettings(row);
      }
    }

    const data: AppData = {
      workspaceId: this.workspaceId,
      workspaces: workspaceRows,
      workspaceFolders: (workspaceFolders as Record<string, unknown>[]).map(rowToWorkspaceFolder),
      projects: (projects as Record<string, unknown>[]).map(rowToProject),
      tasks: (tasks as Record<string, unknown>[]).map(rowToTask),
      deletedTasks: [],
      deletedWorkspaceFolders: [],
      availableTasks: [],
      reminders: (reminders as Record<string, unknown>[]).map(rowToReminder),
      savedViews: (savedViews as Record<string, unknown>[]).map(rowToSavedTaskView),
      recurringTaskTemplates: (recurringTaskTemplates as Record<string, unknown>[]).map(rowToRecurringTaskTemplate),
      attachments: (attachments as Record<string, unknown>[]).map(rowToAttachment),
      settings: settingsRow ? rowToSettings(settingsRow) : DEFAULT_SETTINGS,
      settingsByWorkspace,
    };
    this.cachedData = data;
    return data;
  }

  private async insertNextRecurringInstance(
    task: Task,
    timestamp: string,
    existingDb?: DatabaseHandle,
  ): Promise<{ task: Task; reminder: Reminder | null } | null> {
    if (!task.recurrenceTemplateId || !task.recurrenceInstanceDate) {
      return null;
    }

    const db = existingDb ?? (await this.connect());
    const templates = (await db.select(
      "SELECT * FROM recurring_task_templates WHERE id = ? AND enabled = 1 AND deleted_at IS NULL",
      [task.recurrenceTemplateId],
    )) as Record<string, unknown>[];
    const template = templates[0] ? rowToRecurringTaskTemplate(templates[0]) : null;
    if (!template) {
      return null;
    }

    const nextDate = getNextRecurrenceDate(template, task.recurrenceInstanceDate);
    if (!nextDate) {
      return null;
    }

    const existing = (await db.select(
      "SELECT id FROM tasks WHERE recurrence_template_id = ? AND recurrence_instance_date = ? AND deleted_at IS NULL LIMIT 1",
      [template.id, nextDate],
    )) as Record<string, unknown>[];
    if (existing.length > 0) {
      return null;
    }

    const nextTask = buildTaskFromRecurringTemplate(template, nextDate, timestamp, () => createId("task"));
    await insertTask(db, nextTask);
    const reminder = createReminder(nextTask, template.reminderOffset);
    if (reminder) {
      await insertReminder(db, reminder);
    }
    return { task: nextTask, reminder };
  }

  private resolveImportedWorkspaceId(data: AppData, workspaceId: string) {
    return data.workspaces.find((workspace) => workspace.id === workspaceId && workspace.deletedAt === null)?.id
      ?? data.workspaces.find((workspace) => workspace.deletedAt === null)?.id
      ?? DEFAULT_WORKSPACE_ID;
  }
}

const createReminder = (task: Task, offsetMinutes: number | null) => {
  if (offsetMinutes === null) {
    return null;
  }

  return {
    id: createId("reminder"),
    taskId: task.id,
    remindAt: buildReminderDate(task, offsetMinutes),
    offsetMinutes,
    snoozedUntil: null,
    firedAt: null,
    failedAt: null,
    lastError: null,
    lastAttemptedAt: null,
    enabled: true,
  } satisfies Reminder;
};

const createRecurringTemplate = (
  input: CreateRecurringTaskInput,
  workspaceId: string,
  timestamp: string,
): RecurringTaskTemplate => ({
  id: createId("recur"),
  workspaceId,
  title: input.title,
  notes: input.notes ?? "",
  projectId: input.projectId ?? null,
  workingFolder: input.workingFolder ?? null,
  dueTime: input.dueTime ?? null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  priority: input.priority ?? "medium",
  reminderOffset: input.reminderOffset ?? null,
  frequency: input.frequency,
  interval: Math.max(1, Math.floor(input.interval ?? 1)),
  byWeekday: input.byWeekday && input.byWeekday.length > 0 ? Array.from(new Set(input.byWeekday)).sort((a, b) => a - b) : null,
  anchorDate: input.dueDate,
  endDate: input.endDate ?? null,
  enabled: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
});

const insertTask = (db: DatabaseHandle, task: Task) =>
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

const insertAttachment = (db: DatabaseHandle, attachment: Attachment) =>
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

const insertRecurringTaskTemplate = (db: DatabaseHandle, template: RecurringTaskTemplate) =>
  db.execute(
    `INSERT INTO recurring_task_templates
     (id, workspace_id, title, notes, project_id, working_folder, due_time, timezone, priority, reminder_offset, frequency, interval, by_weekday, anchor_date, end_date, enabled, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );

const insertSettings = (db: DatabaseHandle, workspaceId: string, settings: Settings) =>
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

const insertReminder = (db: DatabaseHandle, reminder: Reminder) =>
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

const insertReminderEvent = (db: DatabaseHandle, event: ReminderEvent) =>
  db.execute(
    `INSERT INTO reminder_events (id, reminder_id, task_id, event_type, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.id, event.reminderId, event.taskId, event.eventType, event.detail, event.createdAt],
  );

const upsertById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
};

const normalizeReminderEvents = (events: ReminderEvent[] | undefined): ReminderEvent[] =>
  (events ?? []).map((event) => ({
    id: event.id,
    reminderId: event.reminderId,
    taskId: event.taskId,
    eventType: event.eventType,
    detail: event.detail ?? null,
    createdAt: event.createdAt,
  }));

const rowToReminderEvent = (row: Record<string, unknown>): ReminderEvent => ({
  id: String(row.id),
  reminderId: String(row.reminder_id),
  taskId: String(row.task_id),
  eventType: String(row.event_type) as ReminderEventType,
  detail: row.detail == null ? null : String(row.detail),
  createdAt: String(row.created_at),
});

const upsertWorkspace = (db: DatabaseHandle, workspace: Workspace) =>
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

const upsertWorkspaceFolder = (db: DatabaseHandle, folder: WorkspaceFolder) =>
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

const upsertProject = (db: DatabaseHandle, project: Project) =>
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

const upsertTask = (db: DatabaseHandle, task: Task) =>
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

const upsertAttachment = (db: DatabaseHandle, attachment: Attachment) =>
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

const upsertRecurringTaskTemplate = (db: DatabaseHandle, template: RecurringTaskTemplate) =>
  db.execute(
    `INSERT INTO recurring_task_templates
     (id, workspace_id, title, notes, project_id, working_folder, due_time, timezone, priority, reminder_offset, frequency, interval, by_weekday, anchor_date, end_date, enabled, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       deleted_at = excluded.deleted_at`,
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
    ],
  );

const upsertSettings = (db: DatabaseHandle, workspaceId: string, settings: Settings) =>
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

const upsertReminder = (db: DatabaseHandle, reminder: Reminder) =>
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

const upsertSavedView = (db: DatabaseHandle, view: SavedTaskView) =>
  db.execute(
    `INSERT INTO saved_views (id, workspace_id, name, filters_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       name = excluded.name,
       filters_json = excluded.filters_json,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    [view.id, view.workspaceId, view.name, JSON.stringify(view.filters), view.createdAt, view.updatedAt],
  );

const upsertReminderEvent = (db: DatabaseHandle, event: ReminderEvent) =>
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

const buildBackupPayload = (
  data: Pick<
    AppData,
    | "workspaceId"
    | "workspaces"
    | "workspaceFolders"
    | "projects"
    | "tasks"
    | "reminders"
    | "savedViews"
    | "recurringTaskTemplates"
    | "attachments"
  >,
  workspaceId: string,
  settingsByWorkspace: Record<string, Settings>,
  reminderEvents: ReminderEvent[] = [],
): BackupPayload => ({
  whattodoBackupVersion: 2,
  exportedAt: nowIso(),
  workspaceId,
  workspaces: data.workspaces,
  workspaceFolders: data.workspaceFolders,
  projects: data.projects,
  tasks: data.tasks,
  reminders: data.reminders,
  settingsByWorkspace,
  savedViews: data.savedViews,
  recurringTaskTemplates: data.recurringTaskTemplates,
  attachments: data.attachments,
  reminderEvents,
});

const normalizeBackupPayload = (payload: BackupPayload): AppData => {
  if (payload.whattodoBackupVersion !== 1 && payload.whattodoBackupVersion !== 2) {
    throw new Error("Unsupported backup version.");
  }

  const workspaceId =
    payload.workspaces.find((workspace) => workspace.id === payload.workspaceId && workspace.deletedAt === null)?.id
    ?? payload.workspaces.find((workspace) => workspace.deletedAt === null)?.id
    ?? DEFAULT_WORKSPACE_ID;

  const attachments = payload.whattodoBackupVersion === 2 ? (payload.attachments ?? []) : [];

  return normalizeData({
    workspaceId,
    workspaces: payload.workspaces,
    workspaceFolders: payload.workspaceFolders,
    projects: payload.projects,
    tasks: payload.tasks,
    reminders: payload.reminders,
    savedViews: payload.savedViews,
    recurringTaskTemplates: payload.recurringTaskTemplates ?? [],
    attachments,
    settingsByWorkspace: payload.settingsByWorkspace,
    settings: payload.settingsByWorkspace[workspaceId] ?? DEFAULT_SETTINGS,
  });
};

const csvCell = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildTasksCsv = (data: AppData) => {
  const projectsById = new Map(data.projects.map((project) => [project.id, project.name]));
  const rows = [
    ["Title", "Status", "Priority", "Due date", "Due time", "Project", "Working folder", "Notes", "Completed at", "Created at"],
    ...data.tasks.map((task) => [
      task.title,
      task.status,
      task.priority,
      task.dueDate,
      task.dueTime ?? "",
      task.projectId ? projectsById.get(task.projectId) ?? "" : "",
      task.workingFolder ?? "",
      task.notes,
      task.completedAt ?? "",
      task.createdAt,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
};

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const pad2 = (n: number) => String(n).padStart(2, "0");

const icsAllDayDate = (task: Task): string => task.dueDate.replace(/-/g, "");

const icsUtcDateTime = (task: Task): string => {
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const [hours, minutes] = (task.dueTime ?? "00:00").split(":").map(Number);
  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return `${local.getUTCFullYear()}${pad2(local.getUTCMonth() + 1)}${pad2(local.getUTCDate())}T${pad2(local.getUTCHours())}${pad2(local.getUTCMinutes())}${pad2(local.getUTCSeconds())}Z`;
};

const isoToIcsUtc = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
};

const icsAllDayEndDate = (task: Task): string => {
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1);
  return `${next.getFullYear()}${pad2(next.getMonth() + 1)}${pad2(next.getDate())}`;
};

const foldLine = (line: string): string => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) {
    return line;
  }
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let offset = 0;
  let firstLine = true;
  while (offset < bytes.length) {
    const maxLen = firstLine ? 75 : 74;
    let end = Math.min(offset + maxLen, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    chunks.push(decoder.decode(bytes.subarray(offset, end)));
    offset = end;
    firstLine = false;
  }
  return chunks.join("\r\n ");
};

const icsPriorityMap: Record<Task["priority"], number> = {
  high: 1,
  medium: 5,
  low: 9,
};

const buildValarm = (reminder: Reminder): string[] => {
  const offsetMinutes = reminder.offsetMinutes ?? 0;
  const trigger = offsetMinutes > 0 ? `-PT${offsetMinutes}M` : "PT0S";
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    `TRIGGER:${trigger}`,
    "END:VALARM",
  ];
};

const buildTasksIcs = (data: AppData) => {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WhatToDo//Tasks//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const task of data.tasks) {
    const hasTime = task.dueTime !== null;
    const dtStart = hasTime ? icsUtcDateTime(task) : icsAllDayDate(task);
    const dtStartPrefix = hasTime ? "DTSTART" : "DTSTART;VALUE=DATE";
    const dtEnd = hasTime ? dtStart : icsAllDayEndDate(task);
    const dtEndPrefix = hasTime ? "DTEND" : "DTEND;VALUE=DATE";

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${task.id}@whattodo`);
    lines.push(`DTSTAMP:${isoToIcsUtc(task.updatedAt)}`);
    lines.push(`${dtStartPrefix}:${dtStart}`);
    lines.push(`${dtEndPrefix}:${dtEnd}`);
    lines.push(`SUMMARY:${icsText(task.title)}`);
    if (task.notes) {
      lines.push(`DESCRIPTION:${icsText(task.notes)}`);
    }
    lines.push(`PRIORITY:${icsPriorityMap[task.priority]}`);

    if (task.status === "completed") {
      lines.push("STATUS:COMPLETED");
      if (task.completedAt) {
        lines.push(`COMPLETED:${isoToIcsUtc(task.completedAt)}`);
      }
      lines.push("PERCENT-COMPLETE:100");
    } else if (task.status === "cancelled") {
      lines.push("STATUS:CANCELLED");
    } else if (task.status === "in_progress") {
      lines.push("STATUS:IN-PROCESS");
      lines.push("PERCENT-COMPLETE:50");
    } else {
      lines.push("STATUS:CONFIRMED");
    }

    const reminder = data.reminders.find(
      (item) => item.taskId === task.id && item.enabled && item.firedAt === null,
    );
    if (reminder) {
      lines.push(...buildValarm(reminder));
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
};

export const createRepository = (): TodoRepository => (isTauriRuntime() ? new SqlRepository() : new LocalRepository());

export { buildTasksIcs, DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID, LocalRepository, SqlRepository };
