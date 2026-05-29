export type AppView = "home" | "overview" | "projects" | "workspaces" | "settings";

export type Language = "zh" | "en";

export type ThemeMode = "dark" | "light" | "system";

export type AccentColor = "blue" | "emerald" | "amber" | "rose" | "violet";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type TaskStatus = "todo" | "completed";

export type TaskPriority = "low" | "medium" | "high";

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
};

export type Reminder = {
  id: string;
  taskId: string;
  remindAt: string;
  offsetMinutes: number | null;
  snoozedUntil: string | null;
  firedAt: string | null;
  enabled: boolean;
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
  availableTasks: Task[];
  reminders: Reminder[];
  settings: Settings;
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

export type CreateProjectInput = {
  name: string;
  color: string;
  dueDate?: string | null;
  workingFolder?: string | null;
};
