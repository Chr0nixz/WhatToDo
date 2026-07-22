import Database from "@tauri-apps/plugin-sql";

import { endOfWeek } from "date-fns";

import { buildReminderDate, parseDateKey, todayKey, toDateKey } from "./date";
import { clearDefaultSavedViewIfNeeded } from "./savedViews";
import { wouldCreateParentCycle } from "./taskTree";
import { buildTaskFromRecurringTemplate, getNextRecurrenceDate } from "./recurrence";
import { taskMatchesFilters } from "./taskFilters";
import {
  ALL_APP_DATA_KEYS,
  buildFullPatch,
  CANNOT_DELETE_LAST_WORKSPACE,
  createId,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  diffPatch,
  DB_URL,
  isTauriRuntime,
  LEGACY_LOCAL_KEY,
  LOCAL_KEY,
  nowIso,
  normalizeTags,
  removeById,
  upsertById,
} from "./repositoryContract";
import type { TodoRepository } from "./repositoryContract";
import {
  boolToInt,
  DEFAULT_TASK_VIEW_FILTERS,
  rowToAttachment,
  rowToProject,
  rowToRecurringTaskTemplate,
  rowToReminder,
  rowToSavedTaskView,
  rowToSettings,
  rowToTask,
  rowToTaskSummary,
  rowToWorkspace,
  rowToWorkspaceFolder,
  serializeByWeekday,
  serializeTags,
  TASK_LIST_COLUMNS,
} from "./repositoryMappers";
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
  RecurringTaskTemplate,
  Reminder,
  ReminderEvent,
  ReminderEventType,
  RepositoryResult,
  SavedTaskView,
  Settings,
  Task,
  TaskPageInput,
  TaskStatus,
  TaskSummary,
  TaskViewFilters,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceFolder,
} from "./types";
import { toTaskSummary } from "./types";

/** Local persistence keeps full Task rows (with notes); AppData snapshots strip notes. */
type LocalData = Omit<AppData, "tasks" | "deletedTasks" | "availableTasks"> & {
  tasks: Task[];
  deletedTasks: Task[];
  availableTasks: Task[];
};

const WORKSPACE_SWITCH_KEYS: ReadonlyArray<AppDataKey> = [
  "workspaceId",
  "workspaces",
  "workspaceFolders",
  "projects",
  "tasks",
  "reminders",
  "savedViews",
  "recurringTaskTemplates",
  "attachments",
  "settings",
  "settingsByWorkspace",
];

/** Build AppData for the active workspace from a full LocalData-shaped store (e.g. backup). */
const snapshotAppDataFromStore = (data: LocalData, workspaceId: string): AppData => {
  const taskIds = new Set(
    data.tasks
      .filter((task) => task.workspaceId === workspaceId && task.deletedAt === null)
      .map((task) => task.id),
  );

  return {
    workspaceId,
    settings: data.settingsByWorkspace[workspaceId] ?? data.settings,
    workspaces: data.workspaces.filter((workspace) => workspace.deletedAt === null),
    workspaceFolders: data.workspaceFolders.filter(
      (folder) => folder.workspaceId === workspaceId && folder.deletedAt === null,
    ),
    projects: data.projects.filter(
      (project) =>
        project.workspaceId === workspaceId && project.deletedAt === null && project.status !== "archived",
    ),
    tasks: data.tasks
      .filter((task) => task.workspaceId === workspaceId && task.deletedAt === null)
      .map(toTaskSummary),
    deletedTasks: [],
    deletedWorkspaceFolders: [],
    availableTasks: [],
    reminders: data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
    savedViews: data.savedViews.filter((view) => view.workspaceId === workspaceId),
    recurringTaskTemplates: data.recurringTaskTemplates.filter(
      (template) => template.workspaceId === workspaceId && template.deletedAt === null,
    ),
    attachments: data.attachments.filter((attachment) => taskIds.has(attachment.task_id)),
    settingsByWorkspace: data.settingsByWorkspace,
  };
};

type DatabaseHandle = Awaited<ReturnType<typeof Database.load>>;

const normalizeData = (data: Partial<AppData> | null): LocalData => ({
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
    notes: "notes" in task && typeof (task as Task).notes === "string" ? (task as Task).notes : "",
    workspaceId: task.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: task.workingFolder ?? null,
    recurrenceTemplateId: task.recurrenceTemplateId ?? null,
    recurrenceInstanceDate: task.recurrenceInstanceDate ?? null,
    parentId: task.parentId ?? null,
    tags: normalizeTags(task.tags),
  })),
  deletedTasks: (data?.deletedTasks ?? []).map((task) => ({
    ...task,
    notes: "notes" in task && typeof (task as Task).notes === "string" ? (task as Task).notes : "",
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
    notes: "notes" in task && typeof (task as Task).notes === "string" ? (task as Task).notes : "",
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
    pinned: view.pinned ?? false,
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
    parentId: template.parentId ?? null,
    tags: normalizeTags(template.tags ?? []),
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

const normalizeTaskPageInput = (input: TaskPageInput, fallbackWorkspaceId: string) => ({
  ...input,
  workspaceId: input.workspaceId ?? fallbackWorkspaceId,
  workspaceScope: input.workspaceScope === "all" ? ("all" as const) : ("current" as const),
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

const priorityRank: Record<TaskSummary["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const taskStatusRank: Record<TaskSummary["status"], number> = { todo: 0, in_progress: 1, completed: 2, cancelled: 3 };

const taskPageComparator = (sort: TaskPageInput["sort"]) => (a: TaskSummary, b: TaskSummary) => {
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

class LocalRepository implements TodoRepository {
  private data: LocalData = normalizeData(null);
  private workspaceId = DEFAULT_WORKSPACE_ID;
  private prevData: LocalData | null = null;
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
    return this.data.tasks
      .filter((task) => task.workspaceId !== workspaceId && task.deletedAt === null)
      .map(toTaskSummary);
  }

  async loadRecoveryItems() {
    return {
      deletedTasks: this.data.tasks
        .filter((task) => task.workspaceId === this.workspaceId && task.deletedAt !== null)
        .map(toTaskSummary),
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
      if (task.deletedAt !== null) {
        return false;
      }
      if (normalized.workspaceScope !== "all" && task.workspaceId !== normalized.workspaceId) {
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
    const pageTasks = sorted.slice(normalized.offset, normalized.offset + normalized.limit);
    const taskIds = new Set(pageTasks.map((task) => task.id));

    return {
      tasks: pageTasks.map(toTaskSummary),
      total: sorted.length,
      reminders: this.data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
    };
  }

  async getTask(id: string) {
    return this.data.tasks.find((task) => task.id === id) ?? null;
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
          parentId: nextTemplate.parentId,
          tags: nextTemplate.tags,
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
      throw new Error("parentCycle");
    }
    if (parentId !== null) {
      const parent = this.data.tasks.find((task) => task.id === parentId && task.deletedAt === null);
      if (!parent || parent.workspaceId !== this.workspaceId) {
        throw new Error("invalidParentTask");
      }
      if (wouldCreateParentCycle(this.data.tasks, taskId, parentId)) {
        throw new Error("parentCycle");
      }
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
      id: input.id?.trim() || createId("attachment"),
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

  async updateAttachmentPath(id: string, path: string, filename?: string) {
    this.data = {
      ...this.data,
      attachments: this.data.attachments.map((attachment) =>
        attachment.id === id
          ? { ...attachment, path, filename: filename ?? attachment.filename }
          : attachment,
      ),
    };
    return this.persist();
  }

  async migrateExternalAttachments() {
    const snapshot = this.snapshot();
    return {
      data: snapshot,
      patch: { affectedKeys: [] },
      report: {
        migrated: 0,
        skipped: snapshot.attachments.length,
        failed: 0,
      },
    };
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
      pinned: input.pinned ?? false,
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
        view.id === id
          ? {
              ...view,
              name: input.name,
              filters: input.filters,
              pinned: input.pinned ?? view.pinned,
              updatedAt: nowIso(),
            }
          : view,
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
        workspaces: mergeById(this.data.workspaces, backup.workspaces),
        workspaceFolders: mergeById(this.data.workspaceFolders, backup.workspaceFolders),
        projects: mergeById(this.data.projects, backup.projects),
        tasks: mergeById(this.data.tasks, backup.tasks),
        reminders: mergeById(this.data.reminders, backup.reminders),
        savedViews: mergeById(this.data.savedViews, backup.savedViews),
        recurringTaskTemplates: mergeById(this.data.recurringTaskTemplates, backup.recurringTaskTemplates),
        attachments: mergeById(this.data.attachments, backup.attachments),
        settingsByWorkspace: { ...this.data.settingsByWorkspace, ...backup.settingsByWorkspace },
      };
      this.reminderEvents = mergeById(this.reminderEvents, incomingEvents);
    }
    this.workspaceId = this.resolveWorkspaceId(payload.workspaceId);
    this.data = {
      ...this.data,
      settings: this.data.settingsByWorkspace[this.workspaceId] ?? this.data.settings,
    };
    return this.persist();
  }

  async exportCurrentWorkspaceCsv() {
    const tasks = this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null);
    return buildTasksCsv({ projects: this.snapshot().projects, tasks });
  }

  async exportCurrentWorkspaceIcs() {
    const tasks = this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null);
    return buildTasksIcs({ projects: this.snapshot().projects, tasks, reminders: this.snapshot().reminders });
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
      tasks: this.data.tasks
        .filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null)
        .map(toTaskSummary),
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
  private mutationTail: Promise<unknown> = Promise.resolve();
  private transactionDepth = 0;

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation, operation);
    this.mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async withTransaction<T>(db: DatabaseHandle, operation: () => Promise<T>) {
    if (this.transactionDepth > 0) {
      const savepoint = `sp_${this.transactionDepth}`;
      this.transactionDepth++;
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
        this.transactionDepth--;
      }
    }

    this.transactionDepth++;
    await db.execute("BEGIN TRANSACTION");
    try {
      const result = await operation();
      await db.execute("COMMIT");
      return result;
    } catch (err) {
      await db.execute("ROLLBACK");
      throw err;
    } finally {
      this.transactionDepth--;
    }
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

  private replaceTaskInCache(cache: AppData, task: Task | TaskSummary): AppData {
    const summary = "notes" in task ? toTaskSummary(task as Task) : task;
    const index = cache.tasks.findIndex((item) => item.id === summary.id);
    const tasks =
      index === -1
        ? [summary, ...cache.tasks]
        : cache.tasks.map((item, i) => (i === index ? summary : item));
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

  private replaceRecurringTemplateInCache(cache: AppData, template: RecurringTaskTemplate): AppData {
    return { ...cache, recurringTaskTemplates: upsertById(cache.recurringTaskTemplates, template) };
  }

  async load(workspaceId?: string) {
    await this.connect();
    this.workspaceId = workspaceId ?? DEFAULT_WORKSPACE_ID;
    return this.readAll();
  }

  async selectWorkspace(workspaceId: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      this.workspaceId = workspaceId;
      const slices = await this.loadWorkspaceSlices(workspaceId);
      const settingsByWorkspace = {
        ...cache.settingsByWorkspace,
        [workspaceId]: slices.settings,
      };
      return this.commitCache(
        {
          ...cache,
          workspaceId,
          ...slices,
          settings: slices.settings,
          settingsByWorkspace,
          deletedTasks: [],
          deletedWorkspaceFolders: [],
          availableTasks: [],
        },
        WORKSPACE_SWITCH_KEYS,
      );
    });
  }

  async loadAvailableTasks(workspaceId = this.workspaceId) {
    const db = await this.connect();
    const tasks = (await db.select(
      `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE workspace_id != ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [workspaceId],
    )) as Record<string, unknown>[];

    return tasks.map(rowToTaskSummary);
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
      deletedTasks: deletedTasks.map(rowToTaskSummary),
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

  async getTask(id: string) {
    const db = await this.connect();
    const rows = (await db.select("SELECT * FROM tasks WHERE id = ? LIMIT 1", [id])) as Record<string, unknown>[];
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async loadTaskPage(input: TaskPageInput) {
    const db = await this.connect();
    const normalized = normalizeTaskPageInput(input, this.workspaceId);
    const where = ["deleted_at IS NULL"];
    const values: unknown[] = [];
    if (normalized.workspaceScope !== "all") {
      where.push("workspace_id = ?");
      values.push(normalized.workspaceId);
    }

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
    const tasks = taskRows.map(rowToTaskSummary);

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
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      const id = createId("workspace");
      const workspace: Workspace = {
        id,
        name: input.name,
        color: input.color,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };

      await db.execute(
        `INSERT INTO workspaces (id, name, color, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, input.name, input.color, timestamp, timestamp, null],
      );
      await insertSettings(db, id, DEFAULT_SETTINGS);
      this.workspaceId = id;

      const next: AppData = {
        ...cache,
        workspaceId: id,
        workspaces: upsertById(cache.workspaces, workspace),
        workspaceFolders: [],
        projects: [],
        tasks: [],
        reminders: [],
        savedViews: [],
        recurringTaskTemplates: [],
        attachments: [],
        settings: DEFAULT_SETTINGS,
        settingsByWorkspace: { ...cache.settingsByWorkspace, [id]: DEFAULT_SETTINGS },
      };
      return this.commitCache(next, [
        "workspaceId",
        "workspaces",
        "workspaceFolders",
        "projects",
        "tasks",
        "reminders",
        "savedViews",
        "recurringTaskTemplates",
        "attachments",
        "settings",
        "settingsByWorkspace",
      ]);
    });
  }

  async updateWorkspace(id: string, patch: UpdateWorkspaceInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.workspaces.find((workspace) => workspace.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const next = { ...current, ...patch, updatedAt: nowIso() };
      const db = await this.connect();
      await db.execute("UPDATE workspaces SET name = ?, color = ?, updated_at = ? WHERE id = ?", [
        next.name,
        next.color,
        next.updatedAt,
        id,
      ]);
      return this.commitCache({ ...cache, workspaces: upsertById(cache.workspaces, next) }, ["workspaces"]);
    });
  }

  async deleteWorkspace(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const activeWorkspaces = cache.workspaces.filter((workspace) => workspace.deletedAt === null);
      if (activeWorkspaces.length <= 1 && activeWorkspaces.some((workspace) => workspace.id === id)) {
        throw new Error(CANNOT_DELETE_LAST_WORKSPACE);
      }

      const db = await this.connect();
      const timestamp = nowIso();
      await db.execute("UPDATE workspaces SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);

      if (this.workspaceId === id) {
        const nextWorkspace = activeWorkspaces.find((workspace) => workspace.id !== id);
        if (!nextWorkspace) {
          throw new Error(CANNOT_DELETE_LAST_WORKSPACE);
        }
        this.workspaceId = nextWorkspace.id;
        const slices = await this.loadWorkspaceSlices(nextWorkspace.id);
        const settingsByWorkspace = {
          ...cache.settingsByWorkspace,
          [nextWorkspace.id]: slices.settings,
        };
        return this.commitCache(
          {
            ...cache,
            workspaceId: nextWorkspace.id,
            workspaces: removeById(cache.workspaces, id),
            ...slices,
            settings: slices.settings,
            settingsByWorkspace,
            deletedTasks: [],
            deletedWorkspaceFolders: [],
            availableTasks: [],
          },
          WORKSPACE_SWITCH_KEYS,
        );
      }

      return this.commitCache({ ...cache, workspaces: removeById(cache.workspaces, id) }, ["workspaces"]);
    });
  }

  async restoreWorkspace(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      await db.execute("UPDATE workspaces SET deleted_at = NULL, updated_at = ? WHERE id = ?", [timestamp, id]);
      const rows = (await db.select("SELECT * FROM workspaces WHERE id = ? LIMIT 1", [id])) as Record<string, unknown>[];
      if (!rows[0]) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const workspace = rowToWorkspace(rows[0]);
      return this.commitCache({ ...cache, workspaces: upsertById(cache.workspaces, workspace) }, ["workspaces"]);
    });
  }

  async createWorkspaceFolder(input: CreateWorkspaceFolderInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
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
      await db.execute(
        `INSERT INTO workspace_folders (id, workspace_id, name, path, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folder.id, folder.workspaceId, folder.name, folder.path, folder.createdAt, folder.updatedAt, folder.deletedAt],
      );
      return this.commitCache(
        { ...cache, workspaceFolders: upsertById(cache.workspaceFolders, folder) },
        ["workspaceFolders"],
      );
    });
  }

  async deleteWorkspaceFolder(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      await db.execute("UPDATE workspace_folders SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);
      if (!cache.workspaceFolders.some((folder) => folder.id === id)) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      return this.commitCache({ ...cache, workspaceFolders: removeById(cache.workspaceFolders, id) }, ["workspaceFolders"]);
    });
  }

  async restoreWorkspaceFolder(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      await db.execute("UPDATE workspace_folders SET deleted_at = NULL, updated_at = ? WHERE id = ?", [timestamp, id]);
      const rows = (await db.select("SELECT * FROM workspace_folders WHERE id = ? LIMIT 1", [id])) as Record<
        string,
        unknown
      >[];
      if (!rows[0]) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const folder = rowToWorkspaceFolder(rows[0]);
      return this.commitCache(
        { ...cache, workspaceFolders: upsertById(cache.workspaceFolders, folder) },
        ["workspaceFolders"],
      );
    });
  }

  async saveSettings(settings: Settings) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
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
      return this.commitCache(
        {
          ...cache,
          settings,
          settingsByWorkspace: { ...cache.settingsByWorkspace, [this.workspaceId]: settings },
        },
        ["settings", "settingsByWorkspace"],
      );
        });
  }

  async createProject(input: CreateProjectInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
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
      return this.commitCache({ ...cache, projects: upsertById(cache.projects, project) }, ["projects"]);
        });
  }

  async updateProject(
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.projects.find((project) => project.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const next = { ...current, ...patch, updatedAt: nowIso() };
      const db = await this.connect();
      await db.execute(
        `UPDATE projects
         SET name = ?, color = ?, status = ?, due_date = ?, working_folder = ?, updated_at = ?
         WHERE id = ?`,
        [next.name, next.color, next.status, next.dueDate, next.workingFolder, next.updatedAt, id],
      );
      return this.commitCache({ ...cache, projects: upsertById(cache.projects, next) }, ["projects"]);
        });
  }

  async archiveProject(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      await db.execute("UPDATE projects SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?", [
        "archived",
        timestamp,
        timestamp,
        id,
      ]);
      if (!cache.projects.some((project) => project.id === id)) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      return this.commitCache({ ...cache, projects: removeById(cache.projects, id) }, ["projects"]);
        });
  }

  async unarchiveProject(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      await db.execute("UPDATE projects SET status = ?, archived_at = NULL, updated_at = ? WHERE id = ?", [
        "active",
        nowIso(),
        id,
      ]);
      const rows = (await db.select("SELECT * FROM projects WHERE id = ? LIMIT 1", [id])) as Record<string, unknown>[];
      if (!rows[0]) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const project = rowToProject(rows[0]);
      return this.commitCache({ ...cache, projects: upsertById(cache.projects, project) }, ["projects"]);
        });
  }

  async createTask(input: CreateTaskInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
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
      await this.withTransaction(db, async () => {
        await insertTask(db, task);
        if (reminder) {
          await insertReminder(db, reminder);
        }
      });

      let next = this.replaceTaskInCache(cache, task);
      const affectedKeys: AppDataKey[] = ["tasks"];
      if (reminder) {
        next = this.replaceReminderInCache(next, reminder);
        affectedKeys.push("reminders");
      }
      return this.commitCache(next, affectedKeys);
    });
  }

  async createRecurringTask(input: CreateRecurringTaskInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      const template = createRecurringTemplate(input, this.workspaceId, timestamp);
      const task = buildTaskFromRecurringTemplate(template, input.dueDate, timestamp, () => createId("task"));

      const reminder = createReminder(task, template.reminderOffset);
      await this.withTransaction(db, async () => {
        await insertRecurringTaskTemplate(db, template);
        await insertTask(db, task);
        if (reminder) {
          await insertReminder(db, reminder);
        }
      });

      let next = this.replaceRecurringTemplateInCache(cache, template);
      next = this.replaceTaskInCache(next, task);
      const affectedKeys: AppDataKey[] = ["recurringTaskTemplates", "tasks"];
      if (reminder) {
        next = this.replaceReminderInCache(next, reminder);
        affectedKeys.push("reminders");
      }
      return this.commitCache(next, affectedKeys);
    });
  }

  private async applyRecurringTemplateUpdate(
    id: string,
    patch: UpdateRecurringTaskTemplateInput,
  ): Promise<RepositoryResult> {
    const cache = await this.getCache();
    const current = cache.recurringTaskTemplates.find((template) => template.id === id);
    if (!current) {
      return { data: cache, patch: { affectedKeys: [] } };
    }

    const next = { ...current, ...patch, updatedAt: nowIso() };
    const db = await this.connect();
    await db.execute(
      `UPDATE recurring_task_templates
       SET title = ?, notes = ?, project_id = ?, working_folder = ?, due_time = ?, priority = ?, reminder_offset = ?, frequency = ?, interval = ?, by_weekday = ?, end_date = ?, parent_id = ?, tags = ?, updated_at = ?
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
        next.parentId,
        serializeTags(next.tags),
        next.updatedAt,
        id,
      ],
    );
    return this.commitCache(this.replaceRecurringTemplateInCache(cache, next), ["recurringTaskTemplates"]);
  }

  async updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput) {
    return this.enqueueMutation(async () => this.applyRecurringTemplateUpdate(id, patch));
  }

  async updateRecurringSeries(
    id: string,
    patch: UpdateRecurringTaskTemplateInput,
    mode: "template" | "openFuture",
  ) {
    return this.enqueueMutation(async () => {
      if (mode === "template") {
        return this.applyRecurringTemplateUpdate(id, patch);
      }

      const cache = await this.getCache();
      const current = cache.recurringTaskTemplates.find((template) => template.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const timestamp = nowIso();
      const nextTemplate = { ...current, ...patch, updatedAt: timestamp };
      const openTasks = cache.tasks.filter(
        (task) =>
          task.recurrenceTemplateId === id &&
          task.deletedAt === null &&
          (task.status === "todo" || task.status === "in_progress"),
      );
      const openIds = new Set(openTasks.map((task) => task.id));
      const createdReminders: Reminder[] = [];

      const db = await this.connect();
      await this.withTransaction(db, async () => {
        await db.execute(
          `UPDATE recurring_task_templates
           SET title = ?, notes = ?, project_id = ?, working_folder = ?, due_time = ?, priority = ?, reminder_offset = ?, frequency = ?, interval = ?, by_weekday = ?, end_date = ?, parent_id = ?, tags = ?, updated_at = ?
           WHERE id = ?`,
          [
            nextTemplate.title,
            nextTemplate.notes,
            nextTemplate.projectId,
            nextTemplate.workingFolder,
            nextTemplate.dueTime,
            nextTemplate.priority,
            nextTemplate.reminderOffset,
            nextTemplate.frequency,
            nextTemplate.interval,
            serializeByWeekday(nextTemplate.byWeekday),
            nextTemplate.endDate,
            nextTemplate.parentId,
            serializeTags(nextTemplate.tags),
            nextTemplate.updatedAt,
            id,
          ],
        );

        for (const task of openTasks) {
          const updatedTask = {
            ...task,
            title: nextTemplate.title,
            notes: nextTemplate.notes,
            projectId: nextTemplate.projectId,
            workingFolder: nextTemplate.workingFolder,
            dueTime: nextTemplate.dueTime,
            priority: nextTemplate.priority,
            parentId: nextTemplate.parentId,
            tags: nextTemplate.tags,
            updatedAt: timestamp,
          };
          await db.execute(
            `UPDATE tasks
             SET project_id = ?, working_folder = ?, title = ?, notes = ?, due_time = ?, priority = ?, parent_id = ?, tags = ?, updated_at = ?
             WHERE id = ?`,
            [
              updatedTask.projectId,
              updatedTask.workingFolder,
              updatedTask.title,
              updatedTask.notes,
              updatedTask.dueTime,
              updatedTask.priority,
              updatedTask.parentId,
              serializeTags(updatedTask.tags),
              updatedTask.updatedAt,
              updatedTask.id,
            ],
          );
          await db.execute("DELETE FROM reminders WHERE task_id = ?", [task.id]);
          const reminder = createReminder(updatedTask, nextTemplate.reminderOffset);
          if (reminder) {
            await insertReminder(db, reminder);
            createdReminders.push(reminder);
          }
        }
      });

      let next: AppData = this.replaceRecurringTemplateInCache(cache, nextTemplate);
      for (const task of openTasks) {
        next = this.replaceTaskInCache(next, {
          ...task,
          title: nextTemplate.title,
          projectId: nextTemplate.projectId,
          workingFolder: nextTemplate.workingFolder,
          dueTime: nextTemplate.dueTime,
          priority: nextTemplate.priority,
          parentId: nextTemplate.parentId,
          tags: nextTemplate.tags,
          updatedAt: timestamp,
        });
      }
      next = {
        ...next,
        reminders: [
          ...createdReminders,
          ...cache.reminders.filter((reminder) => !openIds.has(reminder.taskId)),
        ],
      };
      return this.commitCache(next, ["recurringTaskTemplates", "tasks", "reminders"]);
    });
  }

  async disableRecurringTaskTemplate(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.recurringTaskTemplates.find((template) => template.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const timestamp = nowIso();
      const next = { ...current, enabled: false, updatedAt: timestamp };
      const db = await this.connect();
      await db.execute("UPDATE recurring_task_templates SET enabled = ?, updated_at = ? WHERE id = ?", [0, timestamp, id]);
      return this.commitCache(this.replaceRecurringTemplateInCache(cache, next), ["recurringTaskTemplates"]);
    });
  }

  async moveTaskToWorkspace(taskId: string, workspaceId: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const workspaces = (await db.select("SELECT id FROM workspaces WHERE id = ? AND deleted_at IS NULL", [
        workspaceId,
      ])) as Record<string, unknown>[];
      if (workspaces.length === 0) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const current = cache.tasks.find((task) => task.id === taskId && task.deletedAt === null);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const timestamp = nowIso();
      await db.execute(
        "UPDATE tasks SET workspace_id = ?, project_id = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        [workspaceId, timestamp, taskId],
      );
      const updated = { ...current, workspaceId, projectId: null, updatedAt: timestamp };
      // Task left current workspace view — remove from cache list for this workspace.
      if (workspaceId !== this.workspaceId) {
        return this.commitCache(
          { ...cache, tasks: cache.tasks.filter((task) => task.id !== taskId) },
          ["tasks"],
        );
      }
      return this.commitCache(this.replaceTaskInCache(cache, updated), ["tasks"]);
    });
  }

  async updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
  ) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.tasks.find((task) => task.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const nextTask = { ...current, ...patch, updatedAt: nowIso() };
      const db = await this.connect();
      const taskReminders = cache.reminders.filter((reminder) => reminder.taskId === id && reminder.offsetMinutes !== null);
      const updatedReminders: Reminder[] = [];
      await this.withTransaction(db, async () => {
        await db.execute(
          `UPDATE tasks
           SET project_id = ?, working_folder = ?, title = ?, notes = ?, due_date = ?, due_time = ?, priority = ?, tags = ?, updated_at = ?
           WHERE id = ?`,
          [
            nextTask.projectId,
            nextTask.workingFolder,
            nextTask.title,
            nextTask.notes,
            nextTask.dueDate,
            nextTask.dueTime,
            nextTask.priority,
            serializeTags(nextTask.tags),
            nextTask.updatedAt,
            id,
          ],
        );
        for (const reminder of taskReminders) {
          const remindAt = buildReminderDate(nextTask, reminder.offsetMinutes as number);
          await db.execute(
            `UPDATE reminders
             SET remind_at = ?, snoozed_until = NULL, fired_at = NULL, failed_at = NULL, last_error = NULL, last_attempted_at = NULL
             WHERE id = ?`,
            [remindAt, reminder.id],
          );
          updatedReminders.push({
            ...reminder,
            remindAt,
            snoozedUntil: null,
            firedAt: null,
            failedAt: null,
            lastError: null,
            lastAttemptedAt: null,
          });
        }
      });

      let next = this.replaceTaskInCache(cache, nextTask);
      const affectedKeys: AppDataKey[] = ["tasks"];
      if (updatedReminders.length > 0) {
        for (const reminder of updatedReminders) {
          next = this.replaceReminderInCache(next, reminder);
        }
        affectedKeys.push("reminders");
      }
      return this.commitCache(next, affectedKeys);
    });
  }

  async setTaskParent(taskId: string, parentId: string | null) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      if (parentId === taskId) {
        throw new Error("parentCycle");
      }
      const current = cache.tasks.find((task) => task.id === taskId);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      if (parentId !== null) {
        const parent = cache.tasks.find((task) => task.id === parentId && task.deletedAt === null);
        if (!parent) {
          throw new Error("invalidParentTask");
        }
        if (wouldCreateParentCycle(cache.tasks, taskId, parentId)) {
          throw new Error("parentCycle");
        }
      }
      const timestamp = nowIso();
      const db = await this.connect();
      await db.execute("UPDATE tasks SET parent_id = ?, updated_at = ? WHERE id = ?", [parentId, timestamp, taskId]);
      return this.commitCache(this.replaceTaskInCache(cache, { ...current, parentId, updatedAt: timestamp }), ["tasks"]);
    });
  }

  async addAttachment(input: CreateAttachmentInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      const attachment: Attachment = {
        id: input.id?.trim() || createId("attachment"),
        task_id: input.taskId,
        filename: input.filename,
        path: input.path,
        mimeType: input.mimeType ?? null,
        size: input.size ?? null,
        createdAt: timestamp,
      };
      await db.execute(
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
      return this.commitCache(
        { ...cache, attachments: upsertById(cache.attachments ?? [], attachment) },
        ["attachments"],
      );
        });
  }

  async deleteAttachment(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.attachments.find((attachment) => attachment.id === id);
      if (current) {
        const { deleteManagedAttachmentFile } = await import("./managedAttachments");
        await deleteManagedAttachmentFile(current.path);
      }
      const db = await this.connect();
      await db.execute("DELETE FROM attachments WHERE id = ?", [id]);
      return this.commitCache(
        { ...cache, attachments: removeById(cache.attachments ?? [], id) },
        ["attachments"],
      );
        });
  }

  async updateAttachmentPath(id: string, path: string, filename?: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.attachments.find((attachment) => attachment.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const nextFilename = filename ?? current.filename;
      const db = await this.connect();
      await db.execute("UPDATE attachments SET path = ?, filename = ? WHERE id = ?", [path, nextFilename, id]);
      return this.commitCache(
        {
          ...cache,
          attachments: cache.attachments.map((attachment) =>
            attachment.id === id ? { ...attachment, path, filename: nextFilename } : attachment,
          ),
        },
        ["attachments"],
      );
    });
  }

  async migrateExternalAttachments() {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const { listExternalAttachments, migrateAttachmentToManaged } = await import("./managedAttachments");
      const report = { migrated: 0, skipped: 0, failed: 0 };
      let attachments = cache.attachments ?? [];

      for (const attachment of attachments) {
        if (!listExternalAttachments([attachment]).length) {
          report.skipped += 1;
          continue;
        }
        try {
          const managedPath = await migrateAttachmentToManaged(attachment);
          if (managedPath === attachment.path) {
            report.skipped += 1;
            continue;
          }
          const db = await this.connect();
          await db.execute("UPDATE attachments SET path = ? WHERE id = ?", [managedPath, attachment.id]);
          attachments = attachments.map((item) =>
            item.id === attachment.id ? { ...item, path: managedPath } : item,
          );
          report.migrated += 1;
        } catch {
          report.failed += 1;
        }
      }

      if (report.migrated === 0) {
        return { data: cache, patch: { affectedKeys: [] }, report };
      }
      const committed = this.commitCache({ ...cache, attachments }, ["attachments"]);
      return { ...committed, report };
    });
  }

  async updateTaskReminder(taskId: string, offsetMinutes: number | null) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const task = cache.tasks.find((item) => item.id === taskId);
      if (!task) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const db = await this.connect();
      if (offsetMinutes === null) {
        await db.execute("UPDATE reminders SET enabled = ? WHERE task_id = ?", [0, taskId]);
        const reminders = cache.reminders.map((reminder) =>
          reminder.taskId === taskId ? { ...reminder, enabled: false } : reminder,
        );
        return this.commitCache({ ...cache, reminders }, ["reminders"]);
      }

      const existing = cache.reminders.find((reminder) => reminder.taskId === taskId) ?? null;
      const remindAt = buildReminderDate(task, offsetMinutes);

      if (!existing) {
        const reminder = createReminder(task, offsetMinutes);
        if (!reminder) {
          return { data: cache, patch: { affectedKeys: [] } };
        }
        await insertReminder(db, reminder);
        return this.commitCache(this.replaceReminderInCache(cache, reminder), ["reminders"]);
      }

      await db.execute(
        `UPDATE reminders
         SET remind_at = ?, offset_minutes = ?, snoozed_until = NULL, fired_at = NULL, failed_at = NULL, last_error = NULL, last_attempted_at = NULL, enabled = ?
         WHERE id = ?`,
        [remindAt, offsetMinutes, 1, existing.id],
      );
      const updated: Reminder = {
        ...existing,
        remindAt,
        offsetMinutes,
        snoozedUntil: null,
        firedAt: null,
        failedAt: null,
        lastError: null,
        lastAttemptedAt: null,
        enabled: true,
      };
      return this.commitCache(this.replaceReminderInCache(cache, updated), ["reminders"]);
    });
  }

  async createTaskReminder(taskId: string, offsetMinutes: number) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const task = cache.tasks.find((item) => item.id === taskId && item.deletedAt === null);
      if (!task) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const reminder = createReminder(task, offsetMinutes);
      if (!reminder) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const db = await this.connect();
      await insertReminder(db, reminder);
      return this.commitCache(this.replaceReminderInCache(cache, reminder), ["reminders"]);
    });
  }

  async deleteReminder(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      await db.execute("DELETE FROM reminders WHERE id = ?", [id]);
      return this.commitCache(
        { ...cache, reminders: cache.reminders.filter((reminder) => reminder.id !== id) },
        ["reminders"],
      );
    });
  }

  async toggleTask(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.tasks.find((task) => task.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
  
      const timestamp = nowIso();
      const nextStatus: TaskStatus = current.status === "completed" ? "todo" : "completed";
      const updatedTask: TaskSummary = {
        ...current,
        status: nextStatus,
        completedAt: nextStatus === "completed" ? timestamp : null,
        updatedAt: timestamp,
      };
  
      const db = await this.connect();
      let created: { task: Task; reminder: Reminder | null } | null = null;
      await this.withTransaction(db, async () => {
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
        });
  }

  async setTaskStatus(id: string, status: TaskStatus) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.tasks.find((task) => task.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
  
      const timestamp = nowIso();
      const updatedTask: TaskSummary = {
        ...current,
        status,
        completedAt: status === "completed" ? timestamp : null,
        updatedAt: timestamp,
      };
  
      const db = await this.connect();
      let created: { task: Task; reminder: Reminder | null } | null = null;
      await this.withTransaction(db, async () => {
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
        });
  }

  async bulkSetTaskStatus(ids: string[], status: TaskStatus) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      if (ids.length === 0) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const timestamp = nowIso();
      const idSet = new Set(ids);
      const placeholders = ids.map(() => "?").join(", ");
      const db = await this.connect();
      let next = cache;
      let hasReminders = false;
      await this.withTransaction(db, async () => {
        await db.execute(
          `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
          [status, status === "completed" ? timestamp : null, timestamp, ...ids],
        );
        if (status === "completed") {
          for (const id of ids) {
            const task = cache.tasks.find((item) => item.id === id);
            if (!task) {
              continue;
            }
            const created = await this.insertNextRecurringInstance(task, timestamp, db);
            if (created) {
              next = this.replaceTaskInCache(next, created.task);
              if (created.reminder) {
                next = this.replaceReminderInCache(next, created.reminder);
                hasReminders = true;
              }
            }
          }
        }
      });
      next = {
        ...next,
        tasks: next.tasks.map((task) =>
          idSet.has(task.id)
            ? {
                ...task,
                status,
                completedAt: status === "completed" ? timestamp : null,
                updatedAt: timestamp,
              }
            : task,
        ),
      };
      const affectedKeys: AppDataKey[] = ["tasks"];
      if (hasReminders) {
        affectedKeys.push("reminders");
      }
      return this.commitCache(next, affectedKeys);
        });
  }

  async bulkDeleteTasks(ids: string[]) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      if (ids.length === 0) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const timestamp = nowIso();
      const idSet = new Set(ids);
      const placeholders = ids.map(() => "?").join(", ");
      const db = await this.connect();
      await this.withTransaction(db, async () => {
        await db.execute(
          `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
          [timestamp, timestamp, ...ids],
        );
      });
      const hadAttachments = (cache.attachments ?? []).some((attachment) => idSet.has(attachment.task_id));
      const affectedKeys: AppDataKey[] = ["tasks", "reminders"];
      if (hadAttachments) {
        affectedKeys.push("attachments");
      }
      return this.commitCache(
        {
          ...cache,
          tasks: cache.tasks.filter((task) => !idSet.has(task.id)),
          reminders: cache.reminders.filter((reminder) => !idSet.has(reminder.taskId)),
          attachments: (cache.attachments ?? []).filter((attachment) => !idSet.has(attachment.task_id)),
        },
        affectedKeys,
      );
        });
  }

  async bulkMoveTasksToProject(ids: string[], projectId: string | null) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      if (ids.length === 0) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const timestamp = nowIso();
      const idSet = new Set(ids);
      const placeholders = ids.map(() => "?").join(", ");
      const db = await this.connect();
      await this.withTransaction(db, async () => {
        await db.execute(
          `UPDATE tasks SET project_id = ?, updated_at = ? WHERE id IN (${placeholders})`,
          [projectId, timestamp, ...ids],
        );
      });
      return this.commitCache(
        {
          ...cache,
          tasks: cache.tasks.map((task) =>
            idSet.has(task.id) ? { ...task, projectId, updatedAt: timestamp } : task,
          ),
        },
        ["tasks"],
      );
        });
  }

  async deleteTask(id: string) {
    return this.enqueueMutation(async () => {
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
        });
  }

  async restoreTask(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.tasks.find((task) => task.id === id);
      const timestamp = nowIso();
      const db = await this.connect();
      await db.execute("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?", [timestamp, id]);
      if (!current) {
        // Restored task may not be in the active cache (soft-deleted filtered out of some loads).
        const rows = (await db.select("SELECT * FROM tasks WHERE id = ? LIMIT 1", [id])) as Record<string, unknown>[];
        if (!rows[0]) {
          return { data: cache, patch: { affectedKeys: [] } };
        }
        return this.commitCache(this.replaceTaskInCache(cache, rowToTask(rows[0])), ["tasks"]);
      }
      return this.commitCache(this.replaceTaskInCache(cache, { ...current, deletedAt: null, updatedAt: timestamp }), [
        "tasks",
      ]);
    });
  }

  async markReminderFired(id: string) {
    return this.enqueueMutation(async () => {
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
        });
  }

  async markReminderFailed(id: string, reason: string) {
    return this.enqueueMutation(async () => {
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
        });
  }

  async snoozeReminder(id: string, untilIso: string) {
    return this.enqueueMutation(async () => {
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
        });
  }

  async disableReminder(id: string) {
    return this.enqueueMutation(async () => {
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
        });
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
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      const timestamp = nowIso();
      const view: SavedTaskView = {
        id: createId("view"),
        workspaceId: this.workspaceId,
        name: input.name,
        filters: input.filters,
        pinned: input.pinned ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.execute(
        `INSERT INTO saved_views (id, workspace_id, name, filters_json, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          view.id,
          view.workspaceId,
          view.name,
          JSON.stringify(view.filters),
          boolToInt(view.pinned),
          view.createdAt,
          view.updatedAt,
        ],
      );
      return this.commitCache({ ...cache, savedViews: upsertById(cache.savedViews, view) }, ["savedViews"]);
        });
  }

  async updateSavedView(id: string, input: CreateSavedTaskViewInput) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const current = cache.savedViews.find((view) => view.id === id);
      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }
      const timestamp = nowIso();
      const pinned = input.pinned ?? current.pinned;
      const updated: SavedTaskView = {
        ...current,
        name: input.name,
        filters: input.filters,
        pinned,
        updatedAt: timestamp,
      };
      const db = await this.connect();
      await db.execute("UPDATE saved_views SET name = ?, filters_json = ?, pinned = ?, updated_at = ? WHERE id = ?", [
        updated.name,
        JSON.stringify(updated.filters),
        boolToInt(updated.pinned),
        updated.updatedAt,
        id,
      ]);
      return this.commitCache({ ...cache, savedViews: upsertById(cache.savedViews, updated) }, ["savedViews"]);
        });
  }

  async deleteSavedView(id: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const db = await this.connect();
      await db.execute("DELETE FROM saved_views WHERE id = ?", [id]);

      const nextSettings = clearDefaultSavedViewIfNeeded(cache.settings, id);
      const settingsChanged = nextSettings.defaultSavedViewId !== cache.settings.defaultSavedViewId;
      if (settingsChanged) {
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
            nextSettings.theme,
            nextSettings.accentColor,
            nextSettings.language,
            nextSettings.defaultReminderOffset,
            nextSettings.defaultWorkingFolder,
            nextSettings.defaultSavedViewId,
            boolToInt(nextSettings.notificationsEnabled),
            boolToInt(nextSettings.closeToTray),
          ],
        );
      }

      let next: AppData = { ...cache, savedViews: removeById(cache.savedViews, id) };
      const affectedKeys: AppDataKey[] = ["savedViews"];
      if (settingsChanged) {
        next = {
          ...next,
          settings: nextSettings,
          settingsByWorkspace: { ...next.settingsByWorkspace, [this.workspaceId]: nextSettings },
        };
        affectedKeys.push("settings", "settingsByWorkspace");
      }
      return this.commitCache(next, affectedKeys);
        });
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
      { workspaces, workspaceFolders, projects, tasks, reminders, savedViews, recurringTaskTemplates, attachments },
      this.workspaceId,
      settingsByWorkspace,
      reminderEvents,
    );
  }

  async importBackup(payload: BackupPayload, mode: ImportBackupMode = "replace") {
    return this.enqueueMutation(async () => {
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
              `INSERT INTO saved_views (id, workspace_id, name, filters_json, pinned, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

      if (mode === "replace") {
        return this.commitCache(snapshotAppDataFromStore(backup, this.workspaceId), ALL_APP_DATA_KEYS);
      }

      const previous = this.cachedData;
      const settingsByWorkspace = {
        ...(previous?.settingsByWorkspace ?? {}),
        ...backup.settingsByWorkspace,
      };
      const workspaces = mergeById(previous?.workspaces ?? [], backup.workspaces).filter(
        (workspace) => workspace.deletedAt === null,
      );
      const slices = await this.loadWorkspaceSlices(this.workspaceId);
      return this.commitCache(
        {
          workspaceId: this.workspaceId,
          workspaces,
          ...slices,
          settings: settingsByWorkspace[this.workspaceId] ?? slices.settings,
          settingsByWorkspace,
          deletedTasks: [],
          deletedWorkspaceFolders: [],
          availableTasks: [],
        },
        ALL_APP_DATA_KEYS,
      );
    });
  }

  async exportCurrentWorkspaceCsv() {
    const db = await this.connect();
    const taskRows = (await db.select(
      "SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const cache = this.cachedData ?? (await this.readAll());
    return buildTasksCsv({ projects: cache.projects, tasks: taskRows.map(rowToTask) });
  }

  async exportCurrentWorkspaceIcs() {
    const db = await this.connect();
    const taskRows = (await db.select(
      "SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const cache = this.cachedData ?? (await this.readAll());
    return buildTasksIcs({
      projects: cache.projects,
      tasks: taskRows.map(rowToTask),
      reminders: cache.reminders,
    });
  }

  private async connect() {
    this.db ??= await Database.load(DB_URL);
    return this.db;
  }

  private async loadWorkspaceSlices(workspaceId: string): Promise<{
    workspaceFolders: WorkspaceFolder[];
    projects: Project[];
    tasks: TaskSummary[];
    reminders: Reminder[];
    savedViews: SavedTaskView[];
    recurringTaskTemplates: RecurringTaskTemplate[];
    attachments: Attachment[];
    settings: Settings;
  }> {
    const db = await this.connect();
    const [
      projects,
      tasks,
      workspaceFolders,
      reminders,
      settingsRows,
      savedViews,
      recurringTaskTemplates,
      attachments,
    ] = await Promise.all([
      db.select(
        "SELECT * FROM projects WHERE workspace_id = ? AND deleted_at IS NULL AND status != 'archived' ORDER BY created_at DESC",
        [workspaceId],
      ),
      db.select(
        `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
        [workspaceId],
      ),
      db.select(
        "SELECT * FROM workspace_folders WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
        [workspaceId],
      ),
      db.select(
        `SELECT reminders.*
         FROM reminders
         INNER JOIN tasks ON tasks.id = reminders.task_id
         WHERE tasks.workspace_id = ? AND tasks.deleted_at IS NULL
         ORDER BY reminders.remind_at ASC`,
        [workspaceId],
      ),
      db.select("SELECT * FROM settings WHERE workspace_id = ?", [workspaceId]),
      db.select("SELECT * FROM saved_views WHERE workspace_id = ? ORDER BY created_at DESC", [workspaceId]),
      db.select(
        "SELECT * FROM recurring_task_templates WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
        [workspaceId],
      ),
      db.select(
        `SELECT attachments.*
         FROM attachments
         INNER JOIN tasks ON tasks.id = attachments.task_id
         WHERE tasks.workspace_id = ? AND tasks.deleted_at IS NULL
         ORDER BY attachments.created_at DESC`,
        [workspaceId],
      ),
    ]);

    const settingsRow = (settingsRows as Record<string, unknown>[])[0];
    return {
      workspaceFolders: (workspaceFolders as Record<string, unknown>[]).map(rowToWorkspaceFolder),
      projects: (projects as Record<string, unknown>[]).map(rowToProject),
      tasks: (tasks as Record<string, unknown>[]).map(rowToTaskSummary),
      reminders: (reminders as Record<string, unknown>[]).map(rowToReminder),
      savedViews: (savedViews as Record<string, unknown>[]).map(rowToSavedTaskView),
      recurringTaskTemplates: (recurringTaskTemplates as Record<string, unknown>[]).map(rowToRecurringTaskTemplate),
      attachments: (attachments as Record<string, unknown>[]).map(rowToAttachment),
      settings: settingsRow ? rowToSettings(settingsRow) : DEFAULT_SETTINGS,
    };
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

    const [slices, allSettingsRows] = await Promise.all([
      this.loadWorkspaceSlices(this.workspaceId),
      db.select("SELECT * FROM settings"),
    ]);

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
      ...slices,
      settings: slices.settings,
      settingsByWorkspace,
      deletedTasks: [],
      deletedWorkspaceFolders: [],
      availableTasks: [],
    };
    this.cachedData = data;
    return data;
  }

  private async insertNextRecurringInstance(
    task: Task | TaskSummary,
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

const createReminder = (task: Pick<Task, "id" | "dueDate" | "dueTime">, offsetMinutes: number | null) => {
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
  parentId: input.parentId ?? null,
  tags: normalizeTags(input.tags ?? []),
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

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] =>
  incoming.reduce((acc, item) => upsertById(acc, item), existing);

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
  data: {
    workspaces: Workspace[];
    workspaceFolders: WorkspaceFolder[];
    projects: Project[];
    tasks: Task[];
    reminders: Reminder[];
    savedViews: SavedTaskView[];
    recurringTaskTemplates: RecurringTaskTemplate[];
    attachments: Attachment[];
  },
  workspaceId: string,
  settingsByWorkspace: Record<string, Settings>,
  reminderEvents: ReminderEvent[] = [],
): BackupPayload => ({
  whattodoBackupVersion: 3,
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
  attachmentBundle: "none",
});

const normalizeBackupPayload = (payload: BackupPayload): LocalData => {
  if (
    payload.whattodoBackupVersion !== 1
    && payload.whattodoBackupVersion !== 2
    && payload.whattodoBackupVersion !== 3
  ) {
    throw new Error("Unsupported backup version.");
  }

  const workspaceId =
    payload.workspaces.find((workspace) => workspace.id === payload.workspaceId && workspace.deletedAt === null)?.id
    ?? payload.workspaces.find((workspace) => workspace.deletedAt === null)?.id
    ?? DEFAULT_WORKSPACE_ID;

  const attachments =
    payload.whattodoBackupVersion === 2 || payload.whattodoBackupVersion === 3
      ? (payload.attachments ?? [])
      : [];

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

const buildTasksCsv = (data: { projects: Project[]; tasks: Task[] }) => {
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

const buildTasksIcs = (data: { tasks: Task[]; reminders: Reminder[]; projects?: Project[] }) => {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WhatToDo//Tasks//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const projectsById = new Map((data.projects ?? []).map((project) => [project.id, project]));

  for (const task of data.tasks) {
    const hasTime = task.dueTime !== null;
    const dueValue = hasTime ? icsUtcDateTime(task) : icsAllDayDate(task);
    const duePrefix = hasTime ? "DUE" : "DUE;VALUE=DATE";

    lines.push("BEGIN:VTODO");
    lines.push(`UID:${task.id}@whattodo`);
    lines.push(`DTSTAMP:${isoToIcsUtc(task.updatedAt)}`);
    lines.push(`CREATED:${isoToIcsUtc(task.createdAt)}`);
    lines.push(`LAST-MODIFIED:${isoToIcsUtc(task.updatedAt)}`);
    lines.push(`${duePrefix}:${dueValue}`);
    lines.push(`SUMMARY:${icsText(task.title)}`);
    if (task.notes) {
      lines.push(`DESCRIPTION:${icsText(task.notes)}`);
    }
    if (task.projectId) {
      const projectName = projectsById.get(task.projectId)?.name;
      if (projectName) {
        lines.push(`CATEGORIES:${icsText(projectName)}`);
      }
    }
    lines.push(`PRIORITY:${icsPriorityMap[task.priority]}`);

    // VTODO STATUS values per RFC 5545 §3.2.20 / §3.8.1.11
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
      lines.push("STATUS:NEEDS-ACTION");
    }

    const reminder = data.reminders.find(
      (item) => item.taskId === task.id && item.enabled && item.firedAt === null,
    );
    if (reminder) {
      lines.push(...buildValarm(reminder));
    }

    lines.push("END:VTODO");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
};

export const createRepository = (): TodoRepository => (isTauriRuntime() ? new SqlRepository() : new LocalRepository());

export { buildTasksIcs, DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID, LocalRepository, SqlRepository };
export { CANNOT_DELETE_LAST_WORKSPACE } from "./repositoryContract";
export type { TodoRepository } from "./repositoryContract";
