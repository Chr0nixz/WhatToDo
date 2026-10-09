import { parseBackupPayload } from "./backupSchema";
import { buildReminderDate } from "./date";
import { buildTasksCsv } from "./export/tasksCsv";
import { buildTasksIcs } from "./export/tasksIcs";
import { buildTaskFromRecurringTemplate, getNextRecurrenceDate } from "./recurrence";
import {
  buildFullPatch,
  CANNOT_DELETE_LAST_WORKSPACE,
  createId,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_ID,
  diffPatch,
  LEGACY_LOCAL_KEY,
  LOCAL_KEY,
  normalizeTags,
  nowIso,
} from "./repositoryContract";
import type { TodoRepository } from "./repositoryContract";
import {
  buildBackupPayload,
  createRecurringTemplate,
  createReminder,
  type LocalData,
  mergeById,
  normalizeBackupPayload,
  normalizeData,
  normalizeReminderEvents,
} from "./repositoryDataUtils";
import { clearDefaultSavedViewIfNeeded } from "./savedViews";
import { taskMatchesFilters } from "./taskFilters";
import {
  normalizeTaskPageInput,
  taskPageComparator,
  taskPageFiltersFromInput,
} from "./taskPageQuery";
import { wouldCreateParentCycle } from "./taskTree";
import type {
  AppData,
  Attachment,
  BackupPayload,
  CreateAttachmentInput,
  CreateProjectInput,
  CreateRecurringTaskInput,
  CreateSavedTaskViewInput,
  CreateTaskInput,
  CreateWorkspaceFolderInput,
  CreateWorkspaceInput,
  ImportBackupMode,
  Project,
  ReminderEvent,
  ReminderEventType,
  RepositoryResult,
  SavedTaskView,
  Settings,
  Task,
  TaskPageInput,
  TaskStatus,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceFolder,
} from "./types";
import { toTaskSummary } from "./types";

export class LocalRepository implements TodoRepository {
  private data: LocalData = normalizeData(null);
  private workspaceId = DEFAULT_WORKSPACE_ID;
  private prevData: LocalData | null = null;
  private reminderEvents: ReminderEvent[] = [];

  async load(workspaceId?: string): Promise<AppData> {
    const raw = localStorage.getItem(LOCAL_KEY) ?? localStorage.getItem(LEGACY_LOCAL_KEY);
    let parsed: (Partial<AppData> & { reminderEvents?: ReminderEvent[] }) | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Partial<AppData> & { reminderEvents?: ReminderEvent[] };
      } catch {
        parsed = null;
      }
    }
    this.data = normalizeData(parsed);
    this.reminderEvents = normalizeReminderEvents(parsed?.reminderEvents);
    this.workspaceId = this.resolveWorkspaceId(workspaceId ?? this.data.workspaceId);
    this.prevData = this.data;
    return this.snapshot();
  }

  async selectWorkspace(workspaceId: string): Promise<RepositoryResult> {
    this.workspaceId = this.resolveWorkspaceId(workspaceId);
    return this.persist();
  }

  async loadAvailableTasks(workspaceId = this.workspaceId) {
    const activeWorkspaceIds = new Set(
      this.data.workspaces.filter((workspace) => workspace.deletedAt === null).map((workspace) => workspace.id),
    );
    return this.data.tasks
      .filter(
        (task) =>
          task.workspaceId !== workspaceId &&
          activeWorkspaceIds.has(task.workspaceId) &&
          task.deletedAt === null,
      )
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

  async getTask(id: string): Promise<Task | null> {
    return this.data.tasks.find((task) => task.id === id) ?? null;
  }

  async loadDueDateCounts(input: { workspaceId?: string; from: string; to: string }): Promise<Record<string, number>> {
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

  async createWorkspace(input: CreateWorkspaceInput): Promise<RepositoryResult> {
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

  async updateWorkspace(id: string, patch: UpdateWorkspaceInput): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      workspaces: this.data.workspaces.map((workspace) =>
        workspace.id === id ? { ...workspace, ...patch, updatedAt: nowIso() } : workspace,
      ),
    };
    return this.persist();
  }

  async deleteWorkspace(id: string): Promise<RepositoryResult> {
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

  async restoreWorkspace(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      workspaces: this.data.workspaces.map((workspace) =>
        workspace.id === id ? { ...workspace, deletedAt: null, updatedAt: nowIso() } : workspace,
      ),
    };
    return this.persist();
  }

  async createWorkspaceFolder(input: CreateWorkspaceFolderInput): Promise<RepositoryResult> {
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

  async deleteWorkspaceFolder(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      workspaceFolders: this.data.workspaceFolders.map((folder) =>
        folder.id === id ? { ...folder, deletedAt: nowIso(), updatedAt: nowIso() } : folder,
      ),
    };
    return this.persist();
  }

  async restoreWorkspaceFolder(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      workspaceFolders: this.data.workspaceFolders.map((folder) =>
        folder.id === id ? { ...folder, deletedAt: null, updatedAt: nowIso() } : folder,
      ),
    };
    return this.persist();
  }

  async saveSettings(settings: Settings): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      settings,
      settingsByWorkspace: { ...this.data.settingsByWorkspace, [this.workspaceId]: settings },
    };
    return this.persist();
  }

  async createProject(input: CreateProjectInput): Promise<RepositoryResult> {
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
  ): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      projects: this.data.projects.map((project) =>
        project.id === id ? { ...project, ...patch, updatedAt: nowIso() } : project,
      ),
    };
    return this.persist();
  }

  async archiveProject(id: string): Promise<RepositoryResult> {
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

  async unarchiveProject(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      projects: this.data.projects.map((project) =>
        project.id === id ? { ...project, status: "active", archivedAt: null, updatedAt: nowIso() } : project,
      ),
    };
    return this.persist();
  }

  async createTask(input: CreateTaskInput): Promise<RepositoryResult> {
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

  async createRecurringTask(input: CreateRecurringTaskInput): Promise<RepositoryResult> {
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

  async updateRecurringTaskTemplate(id: string, patch: UpdateRecurringTaskTemplateInput): Promise<RepositoryResult> {
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
  ): Promise<RepositoryResult> {
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

  async disableRecurringTaskTemplate(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      recurringTaskTemplates: this.data.recurringTaskTemplates.map((template) =>
        template.id === id ? { ...template, enabled: false, updatedAt: nowIso() } : template,
      ),
    };
    return this.persist();
  }

  async moveTaskToWorkspace(taskId: string, workspaceId: string): Promise<RepositoryResult> {
    const targetWorkspace = this.data.workspaces.find((w) => w.id === workspaceId && w.deletedAt === null);
    if (!targetWorkspace) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    const current = this.data.tasks.find((task) => task.id === taskId && task.deletedAt === null);
    if (!current) {
      return { data: this.snapshot(), patch: { affectedKeys: [] } };
    }
    const timestamp = nowIso();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) =>
        task.id === taskId
          ? { ...task, workspaceId, projectId: null, updatedAt: timestamp }
          : task,
      ),
    };
    return this.persist();
  }

  async updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "notes" | "dueDate" | "dueTime" | "priority" | "projectId" | "workingFolder" | "tags">>,
  ): Promise<RepositoryResult> {
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
                snoozedUntil: null,
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

  async setTaskParent(taskId: string, parentId: string | null): Promise<RepositoryResult> {
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

  async addAttachment(input: CreateAttachmentInput): Promise<RepositoryResult> {
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

  async deleteAttachment(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      attachments: this.data.attachments.filter((attachment) => attachment.id !== id),
    };
    return this.persist();
  }

  async updateAttachmentPath(id: string, path: string, filename?: string): Promise<RepositoryResult> {
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

  async updateTaskReminder(taskId: string, offsetMinutes: number | null): Promise<RepositoryResult> {
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

  async createTaskReminder(taskId: string, offsetMinutes: number): Promise<RepositoryResult> {
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

  async deleteReminder(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      reminders: this.data.reminders.filter((reminder) => reminder.id !== id),
    };
    return this.persist();
  }

  async toggleTask(id: string): Promise<RepositoryResult> {
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

  async setTaskStatus(id: string, status: TaskStatus): Promise<RepositoryResult> {
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

  async bulkSetTaskStatus(ids: string[], status: TaskStatus): Promise<RepositoryResult> {
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

  async bulkDeleteTasks(ids: string[]): Promise<RepositoryResult> {
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

  async bulkMoveTasksToProject(ids: string[], projectId: string | null): Promise<RepositoryResult> {
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

  async deleteTask(id: string): Promise<RepositoryResult> {
    const timestamp = nowIso();
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) => (task.id === id ? { ...task, deletedAt: timestamp, updatedAt: timestamp } : task)),
    };
    return this.persist();
  }

  async restoreTask(id: string): Promise<RepositoryResult> {
    this.data = {
      ...this.data,
      tasks: this.data.tasks.map((task) =>
        task.id === id ? { ...task, deletedAt: null, updatedAt: nowIso() } : task,
      ),
    };
    return this.persist();
  }

  async markReminderFired(id: string): Promise<RepositoryResult> {
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

  async markReminderFailed(id: string, reason: string): Promise<RepositoryResult> {
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

  async snoozeReminder(id: string, untilIso: string): Promise<RepositoryResult> {
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

  async disableReminder(id: string): Promise<RepositoryResult> {
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

  async loadDueReminders(nowIso: string) {
    const now = new Date(nowIso).getTime();
    const activeWorkspaceIds = new Set(
      this.data.workspaces.filter((workspace) => workspace.deletedAt === null).map((workspace) => workspace.id),
    );
    const tasksById = new Map(this.data.tasks.map((task) => [task.id, task]));

    return this.data.reminders.flatMap((reminder) => {
      const task = tasksById.get(reminder.taskId);
      if (
        !task ||
        task.deletedAt !== null ||
        !activeWorkspaceIds.has(task.workspaceId) ||
        !reminder.enabled ||
        reminder.firedAt !== null ||
        reminder.failedAt !== null ||
        (task.status !== "todo" && task.status !== "in_progress") ||
        new Date(reminder.snoozedUntil ?? reminder.remindAt).getTime() > now
      ) {
        return [];
      }

      return [
        {
          reminder,
          task: {
            id: task.id,
            title: task.title,
            dueTime: task.dueTime,
            workspaceId: task.workspaceId,
          },
        },
      ];
    });
  }

  async loadReminderEvents(reminderId: string): Promise<ReminderEvent[]> {
    return this.reminderEvents
      .filter((event) => event.reminderId === reminderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createSavedView(input: CreateSavedTaskViewInput): Promise<RepositoryResult> {
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

  async updateSavedView(id: string, input: CreateSavedTaskViewInput): Promise<RepositoryResult> {
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

  async deleteSavedView(id: string): Promise<RepositoryResult> {
    const nextSettings = clearDefaultSavedViewIfNeeded(this.data.settings, id);
    this.data = {
      ...this.data,
      savedViews: this.data.savedViews.filter((view) => view.id !== id),
      settings: nextSettings,
      settingsByWorkspace: { ...this.data.settingsByWorkspace, [this.workspaceId]: nextSettings },
    };
    return this.persist();
  }

  async exportBackup(): Promise<BackupPayload> {
    return buildBackupPayload(this.data, this.workspaceId, this.data.settingsByWorkspace, this.reminderEvents);
  }

  async importBackup(payload: BackupPayload, mode: ImportBackupMode = "replace"): Promise<RepositoryResult> {
    const validation = parseBackupPayload(payload);
    if (!validation.success) {
      throw new Error(`Invalid backup payload: ${validation.error}`);
    }
    const validatedPayload = (validation.data ?? payload) as BackupPayload;
    const backup = normalizeBackupPayload(validatedPayload);
    const incomingEvents = normalizeReminderEvents(validatedPayload.reminderEvents);
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

  async exportCurrentWorkspaceCsv(): Promise<string> {
    const tasks = this.data.tasks.filter((task) => task.workspaceId === this.workspaceId && task.deletedAt === null);
    return buildTasksCsv({ projects: this.snapshot().projects, tasks });
  }

  async exportCurrentWorkspaceIcs(): Promise<string> {
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

  private resolveWorkspaceId(workspaceId: string): string {
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
