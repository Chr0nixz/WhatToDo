import Database from "@tauri-apps/plugin-sql";

import { buildReminderDate } from "./date";
import type {
  AppData,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ProjectStatus,
  Reminder,
  Settings,
  Task,
  TaskStatus,
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

type DatabaseHandle = Awaited<ReturnType<typeof Database.load>>;

const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const nowIso = () => new Date().toISOString();

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
  })),
  availableTasks: (data?.availableTasks ?? []).map((task) => ({
    ...task,
    workspaceId: task.workspaceId ?? data?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    workingFolder: task.workingFolder ?? null,
  })),
  reminders: data?.reminders ?? [],
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
});

const rowToReminder = (row: Record<string, unknown>): Reminder => ({
  id: String(row.id),
  taskId: String(row.task_id),
  remindAt: String(row.remind_at),
  offsetMinutes: row.offset_minutes === null ? null : Number(row.offset_minutes),
  snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
  firedAt: row.fired_at ? String(row.fired_at) : null,
  enabled: intToBool(row.enabled),
});

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
  createTask(input: CreateTaskInput): Promise<AppData>;
  moveTaskToWorkspace(taskId: string, workspaceId: string): Promise<AppData>;
  updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder">>,
  ): Promise<AppData>;
  toggleTask(id: string): Promise<AppData>;
  deleteTask(id: string): Promise<AppData>;
  restoreTask(id: string): Promise<AppData>;
  markReminderFired(id: string): Promise<AppData>;
  snoozeReminder(id: string, untilIso: string): Promise<AppData>;
  disableReminder(id: string): Promise<AppData>;
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
    };
    const reminder = createReminder(task, input.reminderOffset ?? null);

    this.data = {
      ...this.data,
      tasks: [task, ...this.data.tasks],
      reminders: reminder ? [reminder, ...this.data.reminders] : this.data.reminders,
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
            ? { ...reminder, remindAt: buildReminderDate(updatedTask as Task, reminder.offsetMinutes), firedAt: null }
            : reminder,
        ),
      };
    }

    return this.persist();
  }

  async toggleTask(id: string) {
    const timestamp = nowIso();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: task.status === "completed" ? "todo" : "completed",
              completedAt: task.status === "completed" ? null : timestamp,
              updatedAt: timestamp,
            }
          : task,
      ),
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
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, firedAt: nowIso() } : reminder,
      ),
    };
    return this.persist();
  }

  async snoozeReminder(id: string, untilIso: string) {
    this.data = {
      ...this.data,
      reminders: this.data.reminders.map((reminder) =>
        reminder.id === id ? { ...reminder, snoozedUntil: untilIso, firedAt: null } : reminder,
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
      availableTasks: this.data.tasks.filter(
        (task) => task.workspaceId !== this.workspaceId && task.deletedAt === null,
      ),
      reminders: this.data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
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
    };

    await db.execute(
      `INSERT INTO tasks
       (id, workspace_id, project_id, working_folder, title, notes, due_date, due_time, timezone, priority, status, completed_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    );

    const reminder = createReminder(task, input.reminderOffset ?? null);
    if (reminder) {
      await insertReminder(db, reminder);
    }

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
    await db.execute(
      `UPDATE tasks
       SET project_id = ?, working_folder = ?, title = ?, notes = ?, due_date = ?, due_time = ?, priority = ?, updated_at = ?
       WHERE id = ?`,
      [next.projectId, next.workingFolder, next.title, next.notes, next.dueDate, next.dueTime, next.priority, next.updatedAt, id],
    );
    const taskReminders = data.reminders.filter((reminder) => reminder.taskId === id && reminder.offsetMinutes !== null);
    await Promise.all(
      taskReminders.map((reminder) =>
        db.execute(
          `UPDATE reminders
           SET remind_at = ?, fired_at = NULL
           WHERE id = ?`,
          [buildReminderDate(next, reminder.offsetMinutes as number), reminder.id],
        ),
      ),
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
    await db.execute("UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?", [
      nextStatus,
      nextStatus === "completed" ? timestamp : null,
      timestamp,
      id,
    ]);
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
    await db.execute("UPDATE reminders SET fired_at = ? WHERE id = ?", [nowIso(), id]);
    return this.readAll();
  }

  async snoozeReminder(id: string, untilIso: string) {
    const db = await this.connect();
    await db.execute("UPDATE reminders SET snoozed_until = ?, fired_at = NULL WHERE id = ?", [untilIso, id]);
    return this.readAll();
  }

  async disableReminder(id: string) {
    const db = await this.connect();
    await db.execute("UPDATE reminders SET enabled = ? WHERE id = ?", [0, id]);
    return this.readAll();
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

    return {
      workspaceId: this.workspaceId,
      workspaces: workspaceRows,
      workspaceFolders: workspaceFolders.map(rowToWorkspaceFolder),
      projects: projects.map(rowToProject),
      tasks: tasks.map(rowToTask),
      availableTasks: availableTasks.map(rowToTask),
      reminders: reminders.map(rowToReminder),
      settings: settingsRow
        ? {
            theme: settingsRow.theme as Settings["theme"],
            accentColor: (settingsRow.accent_color as Settings["accentColor"] | undefined) ?? DEFAULT_SETTINGS.accentColor,
            language: settingsRow.language as Settings["language"],
            defaultReminderOffset: Number(settingsRow.default_reminder_offset),
            defaultWorkingFolder: settingsRow.default_working_folder ? String(settingsRow.default_working_folder) : null,
            notificationsEnabled: intToBool(settingsRow.notifications_enabled),
            closeToTray: intToBool(settingsRow.close_to_tray),
          }
        : DEFAULT_SETTINGS,
    };
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
    enabled: true,
  } satisfies Reminder;
};

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
     (id, task_id, remind_at, offset_minutes, snoozed_until, fired_at, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.taskId,
      reminder.remindAt,
      reminder.offsetMinutes,
      reminder.snoozedUntil,
      reminder.firedAt,
      boolToInt(reminder.enabled),
    ],
  );

export const createRepository = (): TodoRepository => (isTauriRuntime() ? new SqlRepository() : new LocalRepository());

export { DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID, LocalRepository, SqlRepository };
