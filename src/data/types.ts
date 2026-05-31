export type AppView = "home" | "overview" | "projects" | "workspaces" | "reminders" | "settings";

export type Language = "zh" | "en";

export type ThemeMode = "dark" | "light" | "system";

export type AccentColor = "blue" | "emerald" | "amber" | "rose" | "violet";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type TaskStatus = "todo" | "completed";

export type TaskPriority = "low" | "medium" | "high";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export type DateRangeFilter = "all" | "today" | "week" | "overdue";

export type PresenceFilter = "all" | "with" | "without";

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
  anchorDate: string;
  endDate: string | null;
  enabled: boolean;
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

export type TaskViewFilters = {
  scope: "open" | "completed" | "all";
  priority: TaskPriority | "all";
  projectId: string | "all" | "none";
  reminder: PresenceFilter;
  folder: PresenceFilter;
  dateRange: DateRangeFilter;
};

export type SavedTaskView = {
  id: string;
  workspaceId: string;
  name: string;
  filters: TaskViewFilters;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  theme: ThemeMode;
  accentColor: AccentColor;
  language: Language;
  defaultReminderOffset: number;
  defaultWorkingFolder: string | null;
  notificationsEnabled: boolean;
  closeToTray: boolean;
};

export type AppData = {
  workspaceId: string;
  workspaces: Workspace[];
  workspaceFolders: WorkspaceFolder[];
  projects: Project[];
  tasks: Task[];
  deletedTasks: Task[];
  deletedWorkspaceFolders: WorkspaceFolder[];
  availableTasks: Task[];
  reminders: Reminder[];
  savedViews: SavedTaskView[];
  recurringTaskTemplates: RecurringTaskTemplate[];
  settings: Settings;
};

export type RecoveryItems = {
  deletedTasks: Task[];
  deletedWorkspaceFolders: WorkspaceFolder[];
  archivedProjects: Project[];
};

export type AppIndexes = {
  projectsById: Map<string, Project>;
  tasksById: Map<string, Task>;
  tasksByDate: Map<string, Task[]>;
  remindersByTaskId: Map<string, Reminder[]>;
  reminderTaskIds: Set<string>;
};

export type TaskFilterContext = Pick<AppIndexes, "reminderTaskIds">;

export type TaskPageScope = "open" | "completed" | "all";

export type TaskPageSort = "createdDesc" | "dueAsc" | "overview";

export type TaskPageInput = {
  workspaceId?: string;
  scope: TaskPageScope;
  date?: string | null;
  projectId?: string | "none" | null;
  priority?: TaskViewFilters["priority"];
  reminder?: TaskViewFilters["reminder"];
  folder?: TaskViewFilters["folder"];
  dateRange?: TaskViewFilters["dateRange"];
  referenceDate?: string;
  query?: string;
  limit: number;
  offset: number;
  sort: TaskPageSort;
};

export type TaskPageResult = {
  tasks: Task[];
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
};

export type CreateRecurringTaskInput = CreateTaskInput & {
  frequency: RecurrenceFrequency;
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
    | "endDate"
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
};
