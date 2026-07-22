import type {
  AppData,
  AppDataKey,
  BackupPayload,
  CreateAttachmentInput,
  CreateRecurringTaskInput,
  CreateSavedTaskViewInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  CreateProjectInput,
  CreateTaskInput,
  ImportBackupMode,
  Project,
  RecoveryItems,
  ReminderEvent,
  RepositoryPatch,
  RepositoryResult,
  AttachmentMigrateResult,
  Settings,
  Task,
  TaskPageInput,
  TaskPageResult,
  TaskStatus,
  TaskSummary,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
} from "./types";

export const DB_URL = "sqlite:ddl_todo.db";
export const LOCAL_KEY = "whattodo:data";
export const LEGACY_LOCAL_KEY = "ddl-todo:data";
export const DEFAULT_WORKSPACE_ID = "local-workspace";
export const DEFAULT_WORKSPACE_NAME = "Default";

export const DEFAULT_SETTINGS: Settings = {
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

export const ALL_APP_DATA_KEYS: AppDataKey[] = [
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

export const buildFullPatch = (): RepositoryPatch => ({ affectedKeys: ALL_APP_DATA_KEYS });

export const diffPatch = (prev: AppData, next: AppData): RepositoryPatch => {
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

export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const nowIso = () => new Date().toISOString();

export const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const normalizeTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((item) => String(item).trim()).filter(Boolean)));
};

export const upsertById = <T extends { id: string }>(items: T[], item: T): T[] => {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
};

export const removeById = <T extends { id: string }>(items: T[], id: string): T[] =>
  items.filter((item) => item.id !== id);

export interface TodoRepository {
  load(workspaceId?: string): Promise<AppData>;
  selectWorkspace(workspaceId: string): Promise<RepositoryResult>;
  loadAvailableTasks(workspaceId?: string): Promise<TaskSummary[]>;
  loadRecoveryItems(): Promise<RecoveryItems>;
  loadTaskPage(input: TaskPageInput): Promise<TaskPageResult>;
  getTask(id: string): Promise<Task | null>;
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
  updateAttachmentPath(id: string, path: string, filename?: string): Promise<RepositoryResult>;
  migrateExternalAttachments(): Promise<AttachmentMigrateResult>;
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
