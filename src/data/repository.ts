import Database from "@tauri-apps/plugin-sql";

import { buildReminderDate } from "./date";
import { buildTaskFromRecurringTemplate, getNextRecurrenceDate } from "./recurrence";
import type {
  AppData,
  BackupPayload,
  CreateRecurringTaskInput,
  CreateSavedTaskViewInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ProjectStatus,
  RecurringTaskTemplate,
  Reminder,
  SavedTaskView,
  Settings,
  Task,
  TaskStatus,
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
  notificationsEnabled: false,
  closeToTray: true,
};

const DEFAULT_TASK_VIEW_FILTERS = {
  scope: "open",
  priority: "all",
  projectId: "all",
  reminder: "all",
  folder: "all",
  dateRange: "all",
} as const;

type DatabaseHandle = Awaited<ReturnType<typeof Database.load>>;

const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const nowIso = () => new Date().toISOString();

const withTransaction = async <T>(db: DatabaseHandle, operation: () => Promise<T>) => {
  await db.execute("BEGIN TRANSACTION");
  try {
    const result = await operation();
    await db.execute("COMMIT");
    return result;
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
};

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
  })),
  deletedTasks: (data?.deletedTasks ?? []).map((task) => ({
    ...task,
    workspaceId: task.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: task.workingFolder ?? null,
    recurrenceTemplateId: task.recurrenceTemplateId ?? null,
    recurrenceInstanceDate: task.recurrenceInstanceDate ?? null,
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
    endDate: template.endDate ?? null,
    enabled: template.enabled ?? true,
    deletedAt: template.deletedAt ?? null,
  })),
  settings: { ...DEFAULT_SETTINGS, ...data?.settings },
});

const boolToInt = (value: boolean) => (value ? 1 : 0);

const intToBool = (value: unknown) => value === 1 || value === true;

const rowToProject = (row: Record<string, unknown>): Project => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  name: String(row.name),
  color: String(row.color),
  status: row.status as ProjectStatus,
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
  timezone: String(row.timezone),
  priority: row.priority as Task["priority"],
  status: row.status as TaskStatus,
  completedAt: row.completed_at ? String(row.completed_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  recurrenceTemplateId: row.recurrence_template_id ? String(row.recurrence_template_id) : null,
  recurrenceInstanceDate: row.recurrence_instance_date ? String(row.recurrence_instance_date) : null,
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
  frequency: row.frequency as RecurringTaskTemplate["frequency"],
  interval: Number(row.interval ?? 1),
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
  notificationsEnabled: intToBool(row.notifications_enabled),
  closeToTray: intToBool(row.close_to_tray),
});

export interface TodoRepository {
  load(workspaceId?: string): Promise<AppData>;
  selectWorkspace(workspaceId: string): Promise<AppData>;
  createWorkspace(input: CreateWorkspaceInput): Promise<AppData>;
  updateWorkspace(id: string, patch: UpdateWorkspaceInput): Promise<AppData>;
  createWorkspaceFolder(input: CreateWorkspaceFolderInput): Promise<AppData>;
  deleteWorkspaceFolder(id: string): Promise<AppData>;
  restoreWorkspaceFolder(id: string): Promise<AppData>;
  saveSettings(settings: Settings): Promise<AppData>;
  createProject(input: CreateProjectInput): Promise<AppData>;
  updateProject(
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ): Promise<AppData>;
  archiveProject(id: string): Promise<AppData>;
  unarchiveProject(id: string): Promise<AppData>;
  createTask(input: CreateTaskInput): Promise<AppData>;
  createRecurringTask(input: CreateRecurringTaskInput): Promise<AppData>;
  updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput): Promise<AppData>;
  disableRecurringTaskTemplate(id: string): Promise<AppData>;
  moveTaskToWorkspace(taskId: string, workspaceId: string): Promise<AppData>;
  updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
  ): Promise<AppData>;
  updateTaskReminder(taskId: string, offsetMinutes: number | null): Promise<AppData>;
  toggleTask(id: string): Promise<AppData>;
  deleteTask(id: string): Promise<AppData>;
  restoreTask(id: string): Promise<AppData>;
  markReminderFired(id: string): Promise<AppData>;
  markReminderFailed(id: string, reason: string): Promise<AppData>;
  snoozeReminder(id: string, untilIso: string): Promise<AppData>;
  disableReminder(id: string): Promise<AppData>;
  createSavedView(input: CreateSavedTaskViewInput): Promise<AppData>;
  updateSavedView(id: string, input: CreateSavedTaskViewInput): Promise<AppData>;
  deleteSavedView(id: string): Promise<AppData>;
  exportBackup(): Promise<BackupPayload>;
  importBackup(payload: BackupPayload): Promise<AppData>;
  exportCurrentWorkspaceCsv(): Promise<string>;
  exportCurrentWorkspaceIcs(): Promise<string>;
}

class LocalRepository implements TodoRepository {
  private data: AppData = normalizeData(null);
  private workspaceId = DEFAULT_WORKSPACE_ID;

  async load(workspaceId?: string) {
    const raw = localStorage.getItem(LOCAL_KEY) ?? localStorage.getItem(LEGACY_LOCAL_KEY);
    this.data = normalizeData(raw ? (JSON.parse(raw) as Partial<AppData>) : null);
    this.workspaceId = this.resolveWorkspaceId(workspaceId ?? this.data.workspaceId);
    return this.snapshot();
  }

  async selectWorkspace(workspaceId: string) {
    this.workspaceId = this.resolveWorkspaceId(workspaceId);
    return this.persist();
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

    this.workspaceId = workspace.id;
    this.data = { ...this.data, workspaces: [workspace, ...this.data.workspaces] };
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
    this.data = { ...this.data, settings };
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
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
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

  async updateTaskReminder(taskId: string, offsetMinutes: number | null) {
    const task = this.data.tasks.find((item) => item.id === taskId && item.deletedAt === null);
    if (!task) {
      return this.snapshot();
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

  async toggleTask(id: string) {
    const timestamp = nowIso();
    let completedTask: Task | null = null;
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const nextStatus: TaskStatus = task.status === "completed" ? "todo" : "completed";
        const nextTask: Task = {
          ...task,
          status: nextStatus,
          completedAt: nextStatus === "todo" ? null : timestamp,
          updatedAt: timestamp,
        };
        if (task.status !== "completed") {
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
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id
          ? { ...reminder, firedAt: nowIso(), failedAt: null, lastError: null, lastAttemptedAt: nowIso() }
          : reminder,
      ),
    };
    return this.persist();
  }

  async markReminderFailed(id: string, reason: string) {
    const timestamp = nowIso();
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, failedAt: timestamp, lastAttemptedAt: timestamp, lastError: reason } : reminder,
      ),
    };
    return this.persist();
  }

  async snoozeReminder(id: string, untilIso: string) {
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id
          ? { ...reminder, snoozedUntil: untilIso, firedAt: null, failedAt: null, lastError: null }
          : reminder,
      ),
    };
    return this.persist();
  }

  async disableReminder(id: string) {
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, enabled: false } : reminder,
      ),
    };
    return this.persist();
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
    this.data = { ...this.data, savedViews: this.data.savedViews.filter((view) => view.id !== id) };
    return this.persist();
  }

  async exportBackup() {
    return buildBackupPayload(this.data, this.workspaceId, { [this.workspaceId]: this.data.settings });
  }

  async importBackup(payload: BackupPayload) {
    this.data = normalizeBackupPayload(payload);
    this.workspaceId = this.resolveWorkspaceId(payload.workspaceId);
    return this.persist();
  }

  async exportCurrentWorkspaceCsv() {
    return buildTasksCsv(this.snapshot());
  }

  async exportCurrentWorkspaceIcs() {
    return buildTasksIcs(this.snapshot());
  }

  private async persist() {
    this.data = { ...this.data, workspaceId: this.workspaceId };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data));
    return this.snapshot();
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
      workspaces: this.data.workspaces.filter((workspace) => workspace.deletedAt === null),
      workspaceFolders: this.data.workspaceFolders.filter(
        (folder) => folder.workspaceId === this.workspaceId && folder.deletedAt === null,
      ),
      projects: this.data.projects.filter((project) => project.workspaceId === this.workspaceId && project.deletedAt === null),
      tasks: this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null),
      deletedTasks: this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt !== null),
      deletedWorkspaceFolders: this.data.workspaceFolders.filter(
        (folder) => folder.workspaceId === this.workspaceId && folder.deletedAt !== null,
      ),
      availableTasks: this.data.tasks.filter(
        (task) => task.workspaceId !== this.workspaceId && task.deletedAt === null,
      ),
      reminders: this.data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
      savedViews: this.data.savedViews.filter((view) => view.workspaceId === this.workspaceId),
      recurringTaskTemplates: this.data.recurringTaskTemplates.filter(
        (template) => template.workspaceId === this.workspaceId && template.deletedAt === null,
      ),
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

  async load(workspaceId?: string) {
    await this.connect();
    this.workspaceId = workspaceId ?? DEFAULT_WORKSPACE_ID;
    return this.readAll();
  }

  async selectWorkspace(workspaceId: string) {
    this.workspaceId = workspaceId;
    return this.readAll();
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
    return this.readAll();
  }

  async updateWorkspace(id: string, patch: UpdateWorkspaceInput) {
    const data = await this.readAll();
    const current = data.workspaces.find((workspace) => workspace.id === id);
    if (!current) {
      return data;
    }

    const next = { ...current, ...patch };
    const db = await this.connect();
    await db.execute("UPDATE workspaces SET name = ?, color = ?, updated_at = ? WHERE id = ?", [
      next.name,
      next.color,
      nowIso(),
      id,
    ]);
    return this.readAll();
  }

  async createWorkspaceFolder(input: CreateWorkspaceFolderInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      `INSERT INTO workspace_folders (id, workspace_id, name, path, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [createId("folder"), this.workspaceId, input.name, input.path, timestamp, timestamp, null],
    );
    return this.readAll();
  }

  async deleteWorkspaceFolder(id: string) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute("UPDATE workspace_folders SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);
    return this.readAll();
  }

  async restoreWorkspaceFolder(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE workspace_folders SET deleted_at = NULL, updated_at = ? WHERE id = ?", [nowIso(), id]);
    return this.readAll();
  }

  async saveSettings(settings: Settings) {
    const db = await this.connect();
    await db.execute(
      `INSERT INTO settings (workspace_id, theme, accent_color, language, default_reminder_offset, default_working_folder, notifications_enabled, close_to_tray)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         theme = excluded.theme,
         accent_color = excluded.accent_color,
         language = excluded.language,
         default_reminder_offset = excluded.default_reminder_offset,
         default_working_folder = excluded.default_working_folder,
         notifications_enabled = excluded.notifications_enabled,
         close_to_tray = excluded.close_to_tray`,
      [
        this.workspaceId,
        settings.theme,
        settings.accentColor,
        settings.language,
        settings.defaultReminderOffset,
        settings.defaultWorkingFolder,
        boolToInt(settings.notificationsEnabled),
        boolToInt(settings.closeToTray),
      ],
    );
    return this.readAll();
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
    return this.readAll();
  }

  async updateProject(
    id: string,
    patch: Partial<Pick<Project, "name" | "color" | "dueDate" | "status" | "workingFolder">>,
  ) {
    const data = await this.readAll();
    const current = data.projects.find((project) => project.id === id);
    if (!current) {
      return data;
    }

    const next = { ...current, ...patch };
    const db = await this.connect();
    await db.execute(
      `UPDATE projects
       SET name = ?, color = ?, status = ?, due_date = ?, working_folder = ?, updated_at = ?
       WHERE id = ?`,
      [next.name, next.color, next.status, next.dueDate, next.workingFolder, nowIso(), id],
    );
    return this.readAll();
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
    return this.readAll();
  }

  async unarchiveProject(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE projects SET status = ?, archived_at = NULL, updated_at = ? WHERE id = ?", [
      "active",
      nowIso(),
      id,
    ]);
    return this.readAll();
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
    };

    const reminder = createReminder(task, input.reminderOffset ?? null);
    await withTransaction(db, async () => {
      await insertTask(db, task);
      if (reminder) {
        await insertReminder(db, reminder);
      }
    });

    return this.readAll();
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

    return this.readAll();
  }

  async updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput) {
    const data = await this.readAll();
    const current = data.recurringTaskTemplates.find((template) => template.id === id);
    if (!current) {
      return data;
    }

    const next = { ...current, ...patch, updatedAt: nowIso() };
    const db = await this.connect();
    await db.execute(
      `UPDATE recurring_task_templates
       SET title = ?, notes = ?, project_id = ?, working_folder = ?, due_time = ?, priority = ?, reminder_offset = ?, frequency = ?, end_date = ?, updated_at = ?
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
        next.endDate,
        next.updatedAt,
        id,
      ],
    );
    return this.readAll();
  }

  async disableRecurringTaskTemplate(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE recurring_task_templates SET enabled = ?, updated_at = ? WHERE id = ?", [0, nowIso(), id]);
    return this.readAll();
  }

  async moveTaskToWorkspace(taskId: string, workspaceId: string) {
    const db = await this.connect();
    await db.execute("UPDATE tasks SET workspace_id = ?, project_id = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [
      workspaceId,
      nowIso(),
      taskId,
    ]);
    return this.readAll();
  }

  async updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
  ) {
    const data = await this.readAll();
    const current = data.tasks.find((task) => task.id === id);
    if (!current) {
      return data;
    }

    const next = { ...current, ...patch, updatedAt: nowIso() };
    const db = await this.connect();
    const taskReminders = data.reminders.filter((reminder) => reminder.taskId === id && reminder.offsetMinutes !== null);
    await withTransaction(db, async () => {
      await db.execute(
        `UPDATE tasks
         SET project_id = ?, working_folder = ?, title = ?, notes = ?, due_date = ?, due_time = ?, priority = ?, updated_at = ?
         WHERE id = ?`,
        [next.projectId, next.workingFolder, next.title, next.notes, next.dueDate, next.dueTime, next.priority, next.updatedAt, id],
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
    return this.readAll();
  }

  async updateTaskReminder(taskId: string, offsetMinutes: number | null) {
    const data = await this.readAll();
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) {
      return data;
    }

    const db = await this.connect();
    if (offsetMinutes === null) {
      await db.execute("UPDATE reminders SET enabled = ? WHERE task_id = ?", [0, taskId]);
      return this.readAll();
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
      return this.readAll();
    }

    await db.execute(
      `UPDATE reminders
       SET remind_at = ?, offset_minutes = ?, snoozed_until = NULL, fired_at = NULL, failed_at = NULL, last_error = NULL, last_attempted_at = NULL, enabled = ?
       WHERE id = ?`,
      [remindAt, offsetMinutes, 1, existing.id],
    );
    return this.readAll();
  }

  async toggleTask(id: string) {
    const data = await this.readAll();
    const current = data.tasks.find((task) => task.id === id);
    if (!current) {
      return data;
    }

    const timestamp = nowIso();
    const nextStatus: TaskStatus = current.status === "completed" ? "todo" : "completed";
    const db = await this.connect();
    await withTransaction(db, async () => {
      await db.execute("UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", [
        nextStatus,
        nextStatus === "completed" ? timestamp : null,
        timestamp,
        id,
      ]);
      if (nextStatus === "completed") {
        await this.insertNextRecurringInstance(current, timestamp, db);
      }
    });
    return this.readAll();
  }

  async deleteTask(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), id]);
    return this.readAll();
  }

  async restoreTask(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?", [nowIso(), id]);
    return this.readAll();
  }

  async markReminderFired(id: string) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      "UPDATE reminders SET fired_at = ?, failed_at = NULL, last_error = NULL, last_attempted_at = ? WHERE id = ?",
      [timestamp, timestamp, id],
    );
    return this.readAll();
  }

  async markReminderFailed(id: string, reason: string) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute("UPDATE reminders SET failed_at = ?, last_attempted_at = ?, last_error = ? WHERE id = ?", [
      timestamp,
      timestamp,
      reason,
      id,
    ]);
    return this.readAll();
  }

  async snoozeReminder(id: string, untilIso: string) {
    const db = await this.connect();
    await db.execute(
      "UPDATE reminders SET snoozed_until = ?, fired_at = NULL, failed_at = NULL, last_error = NULL WHERE id = ?",
      [untilIso, id],
    );
    return this.readAll();
  }

  async disableReminder(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE reminders SET enabled = ? WHERE id = ?", [0, id]);
    return this.readAll();
  }

  async createSavedView(input: CreateSavedTaskViewInput) {
    const db = await this.connect();
    const timestamp = nowIso();
    await db.execute(
      `INSERT INTO saved_views (id, workspace_id, name, filters_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [createId("view"), this.workspaceId, input.name, JSON.stringify(input.filters), timestamp, timestamp],
    );
    return this.readAll();
  }

  async updateSavedView(id: string, input: CreateSavedTaskViewInput) {
    const db = await this.connect();
    await db.execute("UPDATE saved_views SET name = ?, filters_json = ?, updated_at = ? WHERE id = ?", [
      input.name,
      JSON.stringify(input.filters),
      nowIso(),
      id,
    ]);
    return this.readAll();
  }

  async deleteSavedView(id: string) {
    const db = await this.connect();
    await db.execute("DELETE FROM saved_views WHERE id = ?", [id]);
    return this.readAll();
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
    const settingsRows = (await db.select("SELECT * FROM settings")) as Record<string, unknown>[];
    const settingsByWorkspace = Object.fromEntries(
      settingsRows.map((row) => [String(row.workspace_id), rowToSettings(row)]),
    );

    return buildBackupPayload(
      { workspaceId: this.workspaceId, workspaces, workspaceFolders, projects, tasks, reminders, savedViews, recurringTaskTemplates },
      this.workspaceId,
      settingsByWorkspace,
    );
  }

  async importBackup(payload: BackupPayload) {
    const backup = normalizeBackupPayload(payload);
    const db = await this.connect();

    await db.execute("BEGIN TRANSACTION");
    try {
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
      for (const [workspaceId, settings] of Object.entries(payload.settingsByWorkspace)) {
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

      await db.execute("COMMIT");
    } catch (err) {
      await db.execute("ROLLBACK");
      throw err;
    }

    this.workspaceId = this.resolveImportedWorkspaceId(backup, payload.workspaceId);
    return this.readAll();
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

    const projects = (await db.select("SELECT * FROM projects WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [
      this.workspaceId,
    ])) as Record<string, unknown>[];
    const tasks = (await db.select("SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [
      this.workspaceId,
    ])) as Record<string, unknown>[];
    const availableTasks = (await db.select(
      "SELECT * FROM tasks WHERE workspace_id != ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const workspaceFolders = (await db.select(
      "SELECT * FROM workspace_folders WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const deletedTasks = (await db.select(
      "SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const deletedWorkspaceFolders = (await db.select(
      "SELECT * FROM workspace_folders WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const reminders = (await db.select(
      `SELECT reminders.*
       FROM reminders
       INNER JOIN tasks ON tasks.id = reminders.task_id
       WHERE tasks.workspace_id = ? AND tasks.deleted_at IS NULL
       ORDER BY reminders.remind_at ASC`,
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const settingsRows = (await db.select("SELECT * FROM settings WHERE workspace_id = ?", [
      this.workspaceId,
    ])) as Record<string, unknown>[];
    const settingsRow = settingsRows[0];
    const savedViews = (await db.select(
      "SELECT * FROM saved_views WHERE workspace_id = ? ORDER BY created_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];
    const recurringTaskTemplates = (await db.select(
      "SELECT * FROM recurring_task_templates WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [this.workspaceId],
    )) as Record<string, unknown>[];

    return {
      workspaceId: this.workspaceId,
      workspaces: workspaceRows,
      workspaceFolders: workspaceFolders.map(rowToWorkspaceFolder),
      projects: projects.map(rowToProject),
      tasks: tasks.map(rowToTask),
      deletedTasks: deletedTasks.map(rowToTask),
      deletedWorkspaceFolders: deletedWorkspaceFolders.map(rowToWorkspaceFolder),
      availableTasks: availableTasks.map(rowToTask),
      reminders: reminders.map(rowToReminder),
      savedViews: savedViews.map(rowToSavedTaskView),
      recurringTaskTemplates: recurringTaskTemplates.map(rowToRecurringTaskTemplate),
      settings: settingsRow ? rowToSettings(settingsRow) : DEFAULT_SETTINGS,
    };
  }

  private async insertNextRecurringInstance(task: Task, timestamp: string, existingDb?: DatabaseHandle) {
    if (!task.recurrenceTemplateId || !task.recurrenceInstanceDate) {
      return;
    }

    const db = existingDb ?? await this.connect();
    const templates = (await db.select(
      "SELECT * FROM recurring_task_templates WHERE id = ? AND enabled = 1 AND deleted_at IS NULL",
      [task.recurrenceTemplateId],
    )) as Record<string, unknown>[];
    const template = templates[0] ? rowToRecurringTaskTemplate(templates[0]) : null;
    if (!template) {
      return;
    }

    const nextDate = getNextRecurrenceDate(template, task.recurrenceInstanceDate);
    if (!nextDate) {
      return;
    }

    const existing = (await db.select(
      "SELECT id FROM tasks WHERE recurrence_template_id = ? AND recurrence_instance_date = ? AND deleted_at IS NULL LIMIT 1",
      [template.id, nextDate],
    )) as Record<string, unknown>[];
    if (existing.length > 0) {
      return;
    }

    const nextTask = buildTaskFromRecurringTemplate(template, nextDate, timestamp, () => createId("task"));
    await insertTask(db, nextTask);
    const reminder = createReminder(nextTask, template.reminderOffset);
    if (reminder) {
      await insertReminder(db, reminder);
    }
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
  interval: 1,
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
     (id, workspace_id, project_id, working_folder, title, notes, due_date, due_time, timezone, priority, status, completed_at, created_at, updated_at, deleted_at, recurrence_template_id, recurrence_instance_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );

const insertRecurringTaskTemplate = (db: DatabaseHandle, template: RecurringTaskTemplate) =>
  db.execute(
    `INSERT INTO recurring_task_templates
     (id, workspace_id, title, notes, project_id, working_folder, due_time, timezone, priority, reminder_offset, frequency, interval, anchor_date, end_date, enabled, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
     (workspace_id, theme, accent_color, language, default_reminder_offset, default_working_folder, notifications_enabled, close_to_tray)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workspaceId,
      settings.theme,
      settings.accentColor,
      settings.language,
      settings.defaultReminderOffset,
      settings.defaultWorkingFolder,
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
  >,
  workspaceId: string,
  settingsByWorkspace: Record<string, Settings>,
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
});

const normalizeBackupPayload = (payload: BackupPayload): AppData => {
  if (payload.whattodoBackupVersion !== 1 && payload.whattodoBackupVersion !== 2) {
    throw new Error("Unsupported backup version.");
  }

  const workspaceId =
    payload.workspaces.find((workspace) => workspace.id === payload.workspaceId && workspace.deletedAt === null)?.id
    ?? payload.workspaces.find((workspace) => workspace.deletedAt === null)?.id
    ?? DEFAULT_WORKSPACE_ID;

  return normalizeData({
    workspaceId,
    workspaces: payload.workspaces,
    workspaceFolders: payload.workspaceFolders,
    projects: payload.projects,
    tasks: payload.tasks,
    reminders: payload.reminders,
    savedViews: payload.savedViews,
    recurringTaskTemplates: payload.recurringTaskTemplates ?? [],
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
    ["Title", "Status", "Priority", "Due date", "Due time", "Project", "Working folder", "Notes"],
    ...data.tasks.map((task) => [
      task.title,
      task.status,
      task.priority,
      task.dueDate,
      task.dueTime ?? "",
      task.projectId ? projectsById.get(task.projectId) ?? "" : "",
      task.workingFolder ?? "",
      task.notes,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
};

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const icsDate = (task: Task) => {
  if (!task.dueTime) {
    return task.dueDate.replace(/-/g, "");
  }

  return `${task.dueDate.replace(/-/g, "")}T${task.dueTime.replace(":", "")}00`;
};

const buildTasksIcs = (data: AppData) => {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WhatToDo//Tasks//EN"];

  for (const task of data.tasks) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${task.id}@whattodo`);
    lines.push(`SUMMARY:${icsText(task.title)}`);
    if (task.notes) {
      lines.push(`DESCRIPTION:${icsText(task.notes)}`);
    }
    lines.push(`${task.dueTime ? "DTSTART" : "DTSTART;VALUE=DATE"}:${icsDate(task)}`);
    lines.push(`${task.dueTime ? "DTEND" : "DTEND;VALUE=DATE"}:${icsDate(task)}`);
    lines.push(`STATUS:${task.status === "completed" ? "COMPLETED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

export const createRepository = (): TodoRepository => (isTauriRuntime() ? new SqlRepository() : new LocalRepository());

export { DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID, LocalRepository, SqlRepository };
