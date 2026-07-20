import { z } from "zod";

const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const workspaceFolderSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  color: z.string(),
  status: z.enum(["active", "paused", "completed", "archived"]),
  dueDate: z.string().nullable(),
  workingFolder: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

const taskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  workingFolder: z.string().nullable(),
  title: z.string(),
  notes: z.string(),
  dueDate: z.string(),
  dueTime: z.string().nullable(),
  timezone: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in_progress", "completed", "cancelled"]),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  recurrenceTemplateId: z.string().nullable(),
  recurrenceInstanceDate: z.string().nullable(),
  parentId: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
});

const attachmentSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  filename: z.string(),
  path: z.string(),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  createdAt: z.string(),
});

const reminderSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  remindAt: z.string(),
  offsetMinutes: z.number().nullable(),
  snoozedUntil: z.string().nullable(),
  firedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  lastAttemptedAt: z.string().nullable(),
  enabled: z.boolean(),
});

const filterGroupSchema: z.ZodType<import("./types").FilterGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(["AND", "OR"]),
    negate: z.boolean(),
    conditions: z.array(
      z.object({
        field: z.enum([
          "priority",
          "status",
          "projectId",
          "tags",
          "hasReminder",
          "hasFolder",
          "dueDate",
          "parentId",
        ]),
        op: z.enum([
          "eq",
          "neq",
          "contains",
          "notContains",
          "in",
          "notIn",
          "before",
          "after",
          "isEmpty",
          "isNotEmpty",
        ]),
        value: z.union([z.string(), z.array(z.string())]).optional(),
      }),
    ),
    groups: z.array(filterGroupSchema),
  }),
);

const savedTaskViewSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  filters: z.object({
    scope: z.enum(["open", "completed", "cancelled", "all"]),
    priority: z.enum(["low", "medium", "high", "all"]),
    projectId: z.union([z.string(), z.literal("all"), z.literal("none")]),
    reminder: z.enum(["all", "with", "without"]),
    folder: z.enum(["all", "with", "without"]),
    dateRange: z.enum(["all", "today", "week", "overdue"]),
    tags: z.array(z.string()).default([]),
    tagMatch: z.enum(["any", "all", "none"]).default("any"),
    advancedFilter: filterGroupSchema.nullable().default(null),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const recurringTaskTemplateSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  notes: z.string(),
  projectId: z.string().nullable(),
  workingFolder: z.string().nullable(),
  dueTime: z.string().nullable(),
  timezone: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  reminderOffset: z.number().nullable(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number(),
  byWeekday: z.array(z.number()).nullable().default(null),
  anchorDate: z.string(),
  endDate: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
  accentColor: z.enum(["blue", "emerald", "amber", "rose", "violet"]),
  language: z.enum(["zh", "en"]),
  defaultReminderOffset: z.number(),
  defaultWorkingFolder: z.string().nullable(),
  defaultSavedViewId: z.string().nullable(),
  notificationsEnabled: z.boolean(),
  closeToTray: z.boolean(),
});

const reminderEventSchema = z.object({
  id: z.string(),
  reminderId: z.string(),
  taskId: z.string(),
  eventType: z.enum(["fired", "failed", "snoozed", "disabled", "retry"]),
  detail: z.string().nullable(),
  createdAt: z.string(),
});

const baseBackupFields = {
  exportedAt: z.string(),
  workspaceId: z.string(),
  workspaces: z.array(workspaceSchema),
  workspaceFolders: z.array(workspaceFolderSchema),
  projects: z.array(projectSchema),
  tasks: z.array(taskSchema),
  reminders: z.array(reminderSchema),
  settingsByWorkspace: z.record(z.string(), settingsSchema),
  savedViews: z.array(savedTaskViewSchema),
  reminderEvents: z.array(reminderEventSchema).optional(),
};

export const backupPayloadSchema = z.discriminatedUnion("whattodoBackupVersion", [
  z.object({
    ...baseBackupFields,
    whattodoBackupVersion: z.literal(1),
    recurringTaskTemplates: z.array(recurringTaskTemplateSchema).optional(),
  }),
  z.object({
    ...baseBackupFields,
    whattodoBackupVersion: z.literal(2),
    recurringTaskTemplates: z.array(recurringTaskTemplateSchema),
    attachments: z.array(attachmentSchema).optional().default([]),
  }),
]);

export type BackupSchemaResult = {
  success: boolean;
  data?: z.infer<typeof backupPayloadSchema>;
  error?: string;
};

export const parseBackupPayload = (raw: unknown): BackupSchemaResult => {
  const result = backupPayloadSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  const path = firstIssue?.path.length ? firstIssue.path.join(".") : "(root)";
  return {
    success: false,
    error: `${path}: ${firstIssue?.message ?? "validation failed"}`,
  };
};
