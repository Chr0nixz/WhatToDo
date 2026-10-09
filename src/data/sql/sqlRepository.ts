import { deleteManagedAttachmentFile, listExternalAttachments, migrateAttachmentToManaged } from "../managedAttachments";
import { getSqliteClient, type SqliteClient } from "../sqliteClient";
import { parseBackupPayload } from "../backupSchema";
import { buildTasksCsv } from "../export/tasksCsv";
import { buildTasksIcs } from "../export/tasksIcs";
import {
  WORKSPACE_SWITCH_KEYS,
  snapshotAppDataFromStore,
  normalizeBackupPayload,
  normalizeReminderEvents,
  mergeById,
  buildBackupPayload,
  createReminder,
  createRecurringTemplate,
} from "../repositoryDataUtils";
import {
  appendAdvancedFilterSql,
  appendTagFiltersSql,
  normalizeTaskPageInput,
} from "../taskPageQuery";
import {
  insertAttachment,
  insertRecurringTaskTemplate,
  insertReminder,
  insertReminderEvent,
  insertSettings,
  insertTask,
  rowToReminderEvent,
  upsertAttachment,
  upsertProject,
  upsertRecurringTaskTemplate,
  upsertReminder,
  upsertReminderEvent,
  upsertSavedView,
  upsertSettings,
  upsertTask,
  upsertWorkspace,
  upsertWorkspaceFolder,
} from "./sqlStatements";
import { endOfWeek } from "date-fns";
import { buildReminderDate, parseDateKey, toDateKey } from "../date";
import { clearDefaultSavedViewIfNeeded } from "../savedViews";
import { wouldCreateParentCycle } from "../taskTree";
import { buildTaskFromRecurringTemplate, getNextRecurrenceDate } from "../recurrence";
import {
  ALL_APP_DATA_KEYS,
  CANNOT_DELETE_LAST_WORKSPACE,
  createId,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_ID,
  nowIso,
  normalizeTags,
  removeById,
  upsertById,
} from "../repositoryContract";
import type { TodoRepository } from "../repositoryContract";
import {
  boolToInt,
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
} from "../repositoryMappers";
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
  ImportBackupMode,
  Project,
  RecurringTaskTemplate,
  Reminder,
  RepositoryResult,
  SavedTaskView,
  Settings,
  Task,
  TaskPageInput,
  TaskStatus,
  TaskSummary,
  UpdateRecurringTaskTemplateInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceFolder,
} from "../types";
import { toTaskSummary } from "../types";

type DatabaseHandle = SqliteClient;

export class SqlRepository implements TodoRepository {
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
    return this.enqueueMutation(async () => {
      await this.connect();
      this.workspaceId = workspaceId ?? DEFAULT_WORKSPACE_ID;
      return this.readAll();
    });
  }

  async selectWorkspace(workspaceId: string) {
    return this.enqueueMutation(async () => {
      const cache = await this.getCache();
      const resolvedWorkspaceId =
        cache.workspaces.find((w) => w.id === workspaceId && w.deletedAt === null)?.id ??
        cache.workspaces.find((w) => w.deletedAt === null)?.id ??
        cache.workspaces[0]?.id ??
        DEFAULT_WORKSPACE_ID;
      this.workspaceId = resolvedWorkspaceId;
      const slices = await this.loadWorkspaceSlices(resolvedWorkspaceId);
      const settingsByWorkspace = {
        ...cache.settingsByWorkspace,
        [resolvedWorkspaceId]: slices.settings,
      };
      return this.commitCache(
        {
          ...cache,
          workspaceId: resolvedWorkspaceId,
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
    return this.enqueueMutation(async () => {
      const db = await this.connect();
      const tasks = (await db.select(
        `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE workspace_id != ? AND deleted_at IS NULL AND workspace_id IN (SELECT id FROM workspaces WHERE deleted_at IS NULL) ORDER BY created_at DESC`,
        [workspaceId],
      )) as Record<string, unknown>[];

      return tasks.map(rowToTaskSummary);
    });
  }

  async loadRecoveryItems() {
    return this.enqueueMutation(async () => {
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
    });
  }

  async getTask(id: string) {
    return this.enqueueMutation(async () => {
      const db = await this.connect();
      const rows = (await db.select("SELECT * FROM tasks WHERE id = ? LIMIT 1", [id])) as Record<string, unknown>[];
      return rows[0] ? rowToTask(rows[0]) : null;
    });
  }

  async loadTaskPage(input: TaskPageInput) {
    return this.enqueueMutation(async () => {
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
        : `${normalized.sort === "overview" ? "CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END ASC, " : ""}due_date ASC,
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
    });
  }

  async loadDueReminders(nowIso: string) {
    return this.enqueueMutation(async () => {
      const db = await this.connect();
      const rows = (await db.select(
        `SELECT
           reminders.id,
           reminders.task_id,
           reminders.remind_at,
           reminders.offset_minutes,
           reminders.snoozed_until,
           reminders.fired_at,
           reminders.failed_at,
           reminders.last_error,
           reminders.last_attempted_at,
           reminders.enabled,
           tasks.id AS task_id_full,
           tasks.title AS task_title,
           tasks.due_time AS task_due_time,
           tasks.workspace_id AS task_workspace_id
         FROM reminders
         INNER JOIN tasks ON tasks.id = reminders.task_id
         INNER JOIN workspaces ON workspaces.id = tasks.workspace_id
         WHERE reminders.enabled = 1
           AND reminders.fired_at IS NULL
           AND reminders.failed_at IS NULL
           AND tasks.deleted_at IS NULL
           AND tasks.status IN ('todo', 'in_progress')
           AND workspaces.deleted_at IS NULL
           AND COALESCE(reminders.snoozed_until, reminders.remind_at) <= ?
         ORDER BY COALESCE(reminders.snoozed_until, reminders.remind_at) ASC`,
        [nowIso],
      )) as Record<string, unknown>[];

      return rows.map((row) => ({
        reminder: rowToReminder(row),
        task: {
          id: String(row.task_id_full ?? row.task_id),
          title: String(row.task_title ?? ""),
          dueTime: row.task_due_time ? String(row.task_due_time) : null,
          workspaceId: String(row.task_workspace_id ?? ""),
        },
      }));
    });
  }

  async loadDueDateCounts(input: { workspaceId?: string; from: string; to: string }) {
    return this.enqueueMutation(async () => {
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
    });
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

      await this.withTransaction(db, async () => {
        await db.execute(
          `INSERT INTO workspaces (id, name, color, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, input.name, input.color, timestamp, timestamp, null],
        );
        await insertSettings(db, id, DEFAULT_SETTINGS);
      });
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
      if (next.status === "archived") {
        return this.commitCache({ ...cache, projects: removeById(cache.projects, id) }, ["projects"]);
      }
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
           SET project_id = ?, working_folder = ?, title = ?, notes = COALESCE(?, notes), due_date = ?, due_time = ?, priority = ?, tags = ?, updated_at = ?
           WHERE id = ?`,
          [
            nextTask.projectId,
            nextTask.workingFolder,
            nextTask.title,
            patch.notes !== undefined ? patch.notes : null,
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
      const db = await this.connect();
      await this.withTransaction(db, async () => {
        await db.execute("DELETE FROM attachments WHERE id = ?", [id]);
      });
      if (current) {
        await deleteManagedAttachmentFile(current.path).catch(() => undefined);
      }
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

      await this.withTransaction(db, async () => {
        await db.execute(
          "UPDATE reminders SET fired_at = ?, failed_at = NULL, last_error = NULL, last_attempted_at = ? WHERE id = ?",
          [timestamp, timestamp, id],
        );
        if (current) {
          await insertReminderEvent(db, {
            id: createId("reminder_event"),
            reminderId: id,
            taskId: current.taskId,
            eventType: current.failedAt ? "retry" : "fired",
            detail: null,
            createdAt: timestamp,
          });
        }
      });

      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

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

      await this.withTransaction(db, async () => {
        await db.execute("UPDATE reminders SET failed_at = ?, last_attempted_at = ?, last_error = ? WHERE id = ?", [
          timestamp,
          timestamp,
          reason,
          id,
        ]);
        if (current) {
          await insertReminderEvent(db, {
            id: createId("reminder_event"),
            reminderId: id,
            taskId: current.taskId,
            eventType: "failed",
            detail: reason,
            createdAt: timestamp,
          });
        }
      });

      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

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

      await this.withTransaction(db, async () => {
        await db.execute(
          "UPDATE reminders SET snoozed_until = ?, fired_at = NULL, failed_at = NULL, last_error = NULL WHERE id = ?",
          [untilIso, id],
        );
        if (current) {
          await insertReminderEvent(db, {
            id: createId("reminder_event"),
            reminderId: id,
            taskId: current.taskId,
            eventType: "snoozed",
            detail: untilIso,
            createdAt: nowIso(),
          });
        }
      });

      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

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

      await this.withTransaction(db, async () => {
        await db.execute("UPDATE reminders SET enabled = ? WHERE id = ?", [0, id]);
        if (current) {
          await insertReminderEvent(db, {
            id: createId("reminder_event"),
            reminderId: id,
            taskId: current.taskId,
            eventType: "disabled",
            detail: null,
            createdAt: nowIso(),
          });
        }
      });

      if (!current) {
        return { data: cache, patch: { affectedKeys: [] } };
      }

      const updated: Reminder = {
        ...current,
        enabled: false,
      };
      return this.commitCache(this.replaceReminderInCache(cache, updated), ["reminders"]);
    });
  }

  async loadReminderEvents(reminderId: string) {
    return this.enqueueMutation(async () => {
      const db = await this.connect();
      const rows = (await db.select(
        `SELECT id, reminder_id, task_id, event_type, detail, created_at
         FROM reminder_events
         WHERE reminder_id = ?
         ORDER BY created_at DESC`,
        [reminderId],
      )) as Record<string, unknown>[];
      return rows.map(rowToReminderEvent);
    });
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

      const nextSettings = clearDefaultSavedViewIfNeeded(cache.settings, id);
      const settingsChanged = nextSettings.defaultSavedViewId !== cache.settings.defaultSavedViewId;

      await this.withTransaction(db, async () => {
        await db.execute("DELETE FROM saved_views WHERE id = ?", [id]);
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
      });

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
    return this.enqueueMutation(async () => {
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
    });
  }

  async importBackup(payload: BackupPayload, mode: ImportBackupMode = "replace") {
    return this.enqueueMutation(async () => {
      const validation = parseBackupPayload(payload);
      if (!validation.success) {
        throw new Error(`Invalid backup payload: ${validation.error}`);
      }
      const validatedPayload = (validation.data ?? payload) as BackupPayload;
      const backup = normalizeBackupPayload(validatedPayload);
      const incomingEvents = normalizeReminderEvents(validatedPayload.reminderEvents);
      const db = await this.connect();

      await this.withTransaction(db, async () => {
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
      });

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
    return this.enqueueMutation(async () => {
      const db = await this.connect();
      const taskRows = (await db.select(
        "SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
        [this.workspaceId],
      )) as Record<string, unknown>[];
      const cache = this.cachedData ?? (await this.readAll());
      return buildTasksCsv({ projects: cache.projects, tasks: taskRows.map(rowToTask) });
    });
  }

  async exportCurrentWorkspaceIcs() {
    return this.enqueueMutation(async () => {
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
    });
  }

  private async connect() {
    this.db ??= getSqliteClient();
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

