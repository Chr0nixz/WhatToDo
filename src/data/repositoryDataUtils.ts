import { buildReminderDate } from "./date";
import { sanitizeImportedAttachment } from "./managedAttachments";
import {
  createId,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  normalizeTags,
  nowIso,
  upsertById,
} from "./repositoryContract";
import { DEFAULT_TASK_VIEW_FILTERS } from "./repositoryMappers";
import type {
  AppData,
  AppDataKey,
  Attachment,
  BackupPayload,
  CreateRecurringTaskInput,
  Project,
  RecurringTaskTemplate,
  Reminder,
  ReminderEvent,
  SavedTaskView,
  Settings,
  Task,
  Workspace,
  WorkspaceFolder,
} from "./types";
import { toTaskSummary } from "./types";

/** Local persistence keeps full Task rows (with notes); AppData snapshots strip notes. */
export type LocalData = Omit<AppData, "tasks" | "deletedTasks" | "availableTasks"> & {
  tasks: Task[];
  deletedTasks: Task[];
  availableTasks: Task[];
};

export const WORKSPACE_SWITCH_KEYS: ReadonlyArray<AppDataKey> = [
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
export const snapshotAppDataFromStore = (data: LocalData, workspaceId: string): AppData => {
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

export const normalizeData = (data: Partial<AppData> | null): LocalData => ({
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

export const normalizeReminderEvents = (events: ReminderEvent[] | undefined): ReminderEvent[] =>
  (events ?? []).map((event) => ({
    id: event.id,
    reminderId: event.reminderId,
    taskId: event.taskId,
    eventType: event.eventType,
    detail: event.detail ?? null,
    createdAt: event.createdAt,
  }));

export const normalizeBackupPayload = (payload: BackupPayload): LocalData => {
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
      ? (payload.attachments ?? []).map(sanitizeImportedAttachment)
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

export const createReminder = (task: Pick<Task, "id" | "dueDate" | "dueTime">, offsetMinutes: number | null): Reminder | null => {
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

export const createRecurringTemplate = (
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

export const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] =>
  incoming.reduce((acc, item) => upsertById(acc, item), existing);

export const buildBackupPayload = (
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
