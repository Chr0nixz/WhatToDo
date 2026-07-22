export type AppView = "home" | "overview" | "projects" | "workspaces" | "reminders" | "settings";

export type Language = "zh" | "en";

export type ThemeMode = "dark" | "light" | "system";

export type AccentColor = "blue" | "emerald" | "amber" | "rose" | "violet";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

export type TaskPriority = "low" | "medium" | "high";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type DateRangeFilter = "all" | "today" | "week" | "overdue";

export type PresenceFilter = "all" | "with" | "without";

export type FilterConditionField =
  | "priority"
  | "status"
  | "projectId"
  | "tags"
  | "hasReminder"
  | "hasFolder"
  | "dueDate"
  | "parentId";

export type FilterConditionOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "in"
  | "notIn"
  | "before"
  | "after"
  | "isEmpty"
  | "isNotEmpty";

export type FilterCondition = {
  field: FilterConditionField;
  op: FilterConditionOperator;
  // Optional because isEmpty/isNotEmpty operators don't need a value.
  value?: string | string[];
};

export type FilterGroup = {
  operator: "AND" | "OR";
  negate: boolean;
  conditions: FilterCondition[];
  groups: FilterGroup[];
};

export type Workspace = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type WorkspaceFolder = {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  status: ProjectStatus;
  dueDate: string | null;
  workingFolder: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type Task = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  workingFolder: string | null;
  title: string;
  notes: string;
  dueDate: string;
  dueTime: string | null;
  timezone: string;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  recurrenceTemplateId: string | null;
  recurrenceInstanceDate: string | null;
  parentId: string | null;
  tags: string[];
};

/** List/page/picker rows omit notes; use getTask(id) for the full Task. */
export type TaskSummary = Omit<Task, "notes">;

export const toTaskSummary = (task: Task): TaskSummary => {
  const { notes: _notes, ...summary } = task;
  return summary;
};

export type Attachment = {
  id: string;
  task_id: string;
  filename: string;
  path: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

export type RecurringTaskTemplate = {
  id: string;
  workspaceId: string;
  title: string;
  notes: string;
  projectId: string | null;
  workingFolder: string | null;
  dueTime: string | null;
  timezone: string;
  priority: TaskPriority;
  reminderOffset: number | null;
  frequency: RecurrenceFrequency;
  interval: number;
  byWeekday: number[] | null;
  anchorDate: string;
  endDate: string | null;
  enabled: boolean;
  parentId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Reminder = {
  id: string;
  taskId: string;
  remindAt: string;
  offsetMinutes: number | null;
  snoozedUntil: string | null;
  firedAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  lastAttemptedAt: string | null;
  enabled: boolean;
};

export type ReminderEventType = "fired" | "failed" | "snoozed" | "disabled" | "retry";

export type ReminderEvent = {
  id: string;
  reminderId: string;
  taskId: string;
  eventType: ReminderEventType;
  detail: string | null;
  createdAt: string;
};

export type ImportBackupMode = "replace" | "merge";

export type TaskViewFilters = {
  scope: "open" | "completed" | "cancelled" | "all";
  priority: TaskPriority | "all";
  projectId: string | "all" | "none";
  reminder: PresenceFilter;
  folder: PresenceFilter;
  dateRange: DateRangeFilter;
  tags: string[];
  tagMatch: "any" | "all" | "none";
  advancedFilter: FilterGroup | null;
};

export type SavedTaskView = {
  id: string;
  workspaceId: string;
  name: string;
  filters: TaskViewFilters;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  theme: ThemeMode;
  accentColor: AccentColor;
  language: Language;
  defaultReminderOffset: number;
  defaultWorkingFolder: string | null;
  defaultSavedViewId: string | null;
  notificationsEnabled: boolean;
  closeToTray: boolean;
};

export type AppData = {
  workspaceId: string;
  workspaces: Workspace[];
  workspaceFolders: WorkspaceFolder[];
  projects: Project[];
  /** Workspace task list rows without notes; use getTask(id) for full Task. */
  tasks: TaskSummary[];
  deletedTasks: TaskSummary[];
  deletedWorkspaceFolders: WorkspaceFolder[];
  availableTasks: TaskSummary[];
  reminders: Reminder[];
  savedViews: SavedTaskView[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  attachments: Attachment[];
  settings: Settings;
  settingsByWorkspace: Record<string, Settings>;
};

export type RecoveryItems = {
  deletedTasks: TaskSummary[];
  deletedWorkspaceFolders: WorkspaceFolder[];
  deletedWorkspaces: Workspace[];
  archivedProjects: Project[];
};

export type AppIndexes = {
  projectsById: Map<string, Project>;
  tasksById: Map<string, TaskSummary>;
  tasksByDate: Map<string, TaskSummary[]>;
  remindersByTaskId: Map<string, Reminder[]>;
  reminderTaskIds: Set<string>;
};

export type TaskFilterContext = Pick<AppIndexes, "reminderTaskIds">;

export type TaskPageScope = "open" | "completed" | "cancelled" | "all";

export type TaskPageSort = "createdDesc" | "dueAsc" | "overview";

export type TaskPageInput = {
  workspaceId?: string;
  /** When "all", ignore current workspace filter (still excludes deleted). Default "current". */
  workspaceScope?: "current" | "all";
  scope: TaskPageScope;
  date?: string | null;
  projectId?: string | "none" | null;
  priority?: TaskViewFilters["priority"];
  reminder?: TaskViewFilters["reminder"];
  folder?: TaskViewFilters["folder"];
  dateRange?: TaskViewFilters["dateRange"];
  referenceDate?: string;
  query?: string;
  tags?: string[];
  tagMatch?: TaskViewFilters["tagMatch"];
  advancedFilter?: FilterGroup | null;
  limit: number;
  offset: number;
  sort: TaskPageSort;
};

export type TaskPageResult = {
  tasks: TaskSummary[];
  total: number;
  reminders: Reminder[];
};

export type CreateWorkspaceInput = {
  name: string;
  color: string;
};

export type UpdateWorkspaceInput = Partial<Pick<Workspace, "name" | "color">>;

export type CreateWorkspaceFolderInput = {
  name: string;
  path: string;
};

export type CreateTaskInput = {
  title: string;
  dueDate: string;
  dueTime?: string | null;
  projectId?: string | null;
  workingFolder?: string | null;
  priority?: TaskPriority;
  notes?: string;
  reminderOffset?: number | null;
  parentId?: string | null;
  tags?: string[];
};

export type CreateRecurringTaskInput = CreateTaskInput & {
  frequency: RecurrenceFrequency;
  interval?: number;
  byWeekday?: number[] | null;
  endDate?: string | null;
  reminderOffset?: number | null;
};

export type UpdateRecurringTaskTemplateInput = Partial<
  Pick<
    RecurringTaskTemplate,
    | "title"
    | "notes"
    | "projectId"
    | "workingFolder"
    | "dueTime"
    | "priority"
    | "reminderOffset"
    | "frequency"
    | "interval"
    | "byWeekday"
    | "endDate"
    | "parentId"
    | "tags"
  >
>;

export type CreateProjectInput = {
  name: string;
  color: string;
  dueDate?: string | null;
  workingFolder?: string | null;
};

export type CreateSavedTaskViewInput = {
  name: string;
  filters: TaskViewFilters;
  pinned?: boolean;
};

export type CreateAttachmentInput = {
  id?: string;
  taskId: string;
  filename: string;
  path: string;
  mimeType?: string | null;
  size?: number | null;
};

export type BackupAutoBackupPreferences = {
  enabled: boolean;
  intervalHours: number;
  retentionCount: number;
  retentionDays: number;
};

/** Device-local paths (e.g. auto-backup folder) are intentionally omitted. */
export type BackupClientPreferences = {
  autoBackup?: BackupAutoBackupPreferences;
};

export type BackupPayload = {
  whattodoBackupVersion: 1;
  exportedAt: string;
  workspaceId: string;
  workspaces: Workspace[];
  workspaceFolders: WorkspaceFolder[];
  projects: Project[];
  tasks: Task[];
  reminders: Reminder[];
  settingsByWorkspace: Record<string, Settings>;
  savedViews: SavedTaskView[];
  recurringTaskTemplates?: RecurringTaskTemplate[];
  reminderEvents?: ReminderEvent[];
} | {
  whattodoBackupVersion: 2;
  exportedAt: string;
  workspaceId: string;
  workspaces: Workspace[];
  workspaceFolders: WorkspaceFolder[];
  projects: Project[];
  tasks: Task[];
  reminders: Reminder[];
  settingsByWorkspace: Record<string, Settings>;
  savedViews: SavedTaskView[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  attachments?: Attachment[];
  reminderEvents?: ReminderEvent[];
} | {
  whattodoBackupVersion: 3;
  exportedAt: string;
  workspaceId: string;
  workspaces: Workspace[];
  workspaceFolders: WorkspaceFolder[];
  projects: Project[];
  tasks: Task[];
  reminders: Reminder[];
  settingsByWorkspace: Record<string, Settings>;
  savedViews: SavedTaskView[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  attachments?: Attachment[];
  reminderEvents?: ReminderEvent[];
  attachmentBundle?: "sidecar" | "none";
  clientPreferences?: BackupClientPreferences;
};

export type AppDataKey = keyof AppData;

export type RepositoryPatch = {
  /** Top-level AppData fields whose references actually changed. */
  affectedKeys: ReadonlyArray<AppDataKey>;
};

export type RepositoryResult = {
  data: AppData;
  patch: RepositoryPatch;
};

export type AttachmentMigrateReport = {
  migrated: number;
  skipped: number;
  failed: number;
};

export type AttachmentMigrateResult = RepositoryResult & {
  report: AttachmentMigrateReport;
};

export type TaskDetailPaneHandle = {
  isDirty: () => boolean;
  requestSwitch: (nextTaskId: string | null) => boolean;
};
