import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "@tauri-apps/plugin-sql";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(),
  },
}));

import { buildReminderDate } from "./date";
import { CANNOT_DELETE_LAST_WORKSPACE, LocalRepository, SqlRepository } from "./repository";

describe("LocalRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps each reminder offset when task due time changes after default reminder changes", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createTask({
      title: "Offset task",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      reminderOffset: 60,
    })).data;
    const task = data.tasks[0];
    expect(data.reminders[0].offsetMinutes).toBe(60);

    await repository.saveSettings({ ...data.settings, defaultReminderOffset: 5 });
    data = (await repository.updateTask(task.id, { dueTime: "11:00" })).data;

    expect(data.reminders[0].remindAt).toBe(buildReminderDate({ dueDate: "2026-06-01", dueTime: "11:00" }, 60));
  });

  it("soft deletes and restores tasks and workspace folders", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createTask({ title: "Delete me", dueDate: "2026-06-01" })).data;
    const taskId = data.tasks[0].id;
    data = (await repository.deleteTask(taskId)).data;
    expect(data.tasks.find((task) => task.id === taskId)).toBeUndefined();
    expect((await repository.loadRecoveryItems()).deletedTasks.find((task) => task.id === taskId)?.title).toBe("Delete me");

    data = (await repository.restoreTask(taskId)).data;
    expect(data.tasks.find((task) => task.id === taskId)?.title).toBe("Delete me");

    data = (await repository.createWorkspaceFolder({ name: "Docs", path: "D:\\Docs" })).data;
    const folderId = data.workspaceFolders[0].id;
    data = (await repository.deleteWorkspaceFolder(folderId)).data;
    expect(data.workspaceFolders.find((folder) => folder.id === folderId)).toBeUndefined();
    expect((await repository.loadRecoveryItems()).deletedWorkspaceFolders.find((folder) => folder.id === folderId)?.name).toBe("Docs");

    data = (await repository.restoreWorkspaceFolder(folderId)).data;
    expect(data.workspaceFolders.find((folder) => folder.id === folderId)?.name).toBe("Docs");
  });

  it("soft deletes and restores workspaces while keeping one active workspace", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createWorkspace({ name: "Extra", color: "#6cc083" })).data;
    const extraId = data.workspaceId;

    data = (await repository.deleteWorkspace(extraId)).data;
    expect(data.workspaces.find((workspace) => workspace.id === extraId)).toBeUndefined();
    expect((await repository.loadRecoveryItems()).deletedWorkspaces.some((workspace) => workspace.id === extraId)).toBe(true);

    data = (await repository.restoreWorkspace(extraId)).data;
    expect(data.workspaces.some((workspace) => workspace.id === extraId)).toBe(true);

    data = (await repository.deleteWorkspace(extraId)).data;
    await expect(repository.deleteWorkspace(data.workspaceId)).rejects.toThrow(CANNOT_DELETE_LAST_WORKSPACE);
  });

  it("clears default saved view when deleting that view", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createSavedView({
      name: "Default view",
      filters: { scope: "open", priority: "all", projectId: "all", reminder: "all", folder: "all", dateRange: "all", tags: [], tagMatch: "any", advancedFilter: null },
    })).data;
    const viewId = data.savedViews[0].id;
    data = (await repository.saveSettings({ ...data.settings, defaultSavedViewId: viewId })).data;
    expect(data.settings.defaultSavedViewId).toBe(viewId);

    data = (await repository.deleteSavedView(viewId)).data;
    expect(data.settings.defaultSavedViewId).toBeNull();
  });

  it("isolates settings per workspace and preserves all in backups", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    const defaultId = data.workspaceId;

    await repository.saveSettings({ ...data.settings, theme: "dark" });

    data = (await repository.createWorkspace({ name: "Second", color: "#6cc083" })).data;
    const secondId = data.workspaceId;
    expect(data.settings.theme).toBe("system");

    await repository.saveSettings({ ...data.settings, theme: "light" });

    data = (await repository.selectWorkspace(defaultId)).data;
    expect(data.settings.theme).toBe("dark");
    expect(data.settingsByWorkspace[defaultId].theme).toBe("dark");
    expect(data.settingsByWorkspace[secondId].theme).toBe("light");

    const backup = await repository.exportBackup();
    expect(backup.settingsByWorkspace[defaultId].theme).toBe("dark");
    expect(backup.settingsByWorkspace[secondId].theme).toBe("light");
  });

  it("loads cross-workspace available tasks on demand", async () => {
    const repository = new LocalRepository();
    await repository.load();

    let data = (await repository.createTask({ title: "Default task", dueDate: "2026-06-01" })).data;
    const defaultTaskId = data.tasks[0].id;
    data = (await repository.createWorkspace({ name: "Side workspace", color: "#4fb8d8" })).data;

    expect(data.tasks).toEqual([]);
    expect(data.availableTasks).toEqual([]);
    expect((await repository.loadAvailableTasks()).map((task) => task.id)).toContain(defaultTaskId);
  });

  it("loads recovery items on demand", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createTask({ title: "Recover task", dueDate: "2026-06-01" })).data;
    const taskId = data.tasks[0].id;
    data = (await repository.deleteTask(taskId)).data;
    data = (await repository.createWorkspaceFolder({ name: "Recover folder", path: "D:\\Recover" })).data;
    const folderId = data.workspaceFolders[0].id;
    data = (await repository.deleteWorkspaceFolder(folderId)).data;
    data = (await repository.createProject({ name: "Recover project", color: "#4fb8d8", dueDate: null, workingFolder: null })).data;
    const projectId = data.projects[0].id;
    data = (await repository.archiveProject(projectId)).data;

    expect(data.deletedTasks).toEqual([]);
    expect(data.deletedWorkspaceFolders).toEqual([]);
    expect(data.projects.find((project) => project.id === projectId)).toBeUndefined();

    const recovery = await repository.loadRecoveryItems();
    expect(recovery.deletedTasks.map((task) => task.id)).toContain(taskId);
    expect(recovery.deletedWorkspaceFolders.map((folder) => folder.id)).toContain(folderId);
    expect(recovery.archivedProjects.map((project) => project.id)).toContain(projectId);
  });

  it("loads task pages with filters, totals, and reminders", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createProject({
      name: "Client launch",
      color: "#4fb8d8",
      dueDate: null,
      workingFolder: null,
    })).data;
    const projectId = data.projects[0].id;

    data = (await repository.createTask({
      title: "Alpha task",
      dueDate: "2026-06-01",
      projectId,
      priority: "high",
      workingFolder: "D:\\Projects\\Client",
      reminderOffset: 30,
    })).data;
    data = (await repository.createTask({
      title: "Beta task",
      dueDate: "2026-06-01",
      priority: "low",
    })).data;
    await repository.createTask({
      title: "Other day",
      dueDate: "2026-06-02",
    });

    const result = await repository.loadTaskPage({
      scope: "open",
      date: "2026-06-01",
      projectId,
      priority: "high",
      reminder: "with",
      folder: "with",
      dateRange: "week",
      referenceDate: "2026-06-01",
      query: "client",
      limit: 10,
      offset: 0,
      sort: "overview",
    });

    expect(result.total).toBe(1);
    expect(result.tasks.map((task) => task.title)).toEqual(["Alpha task"]);
    expect(result.reminders.map((reminder) => reminder.taskId)).toEqual([data.tasks.find((task) => task.title === "Alpha task")?.id]);
  });

  it("snoozes and disables reminders", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createTask({
      title: "Reminder task",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      reminderOffset: 30,
    })).data;
    const reminderId = data.reminders[0].id;

    data = (await repository.markReminderFired(reminderId)).data;
    expect(data.reminders[0].firedAt).not.toBeNull();

    data = (await repository.snoozeReminder(reminderId, "2026-06-01T09:45:00.000Z")).data;
    expect(data.reminders[0].snoozedUntil).toBe("2026-06-01T09:45:00.000Z");
    expect(data.reminders[0].firedAt).toBeNull();

    data = (await repository.disableReminder(reminderId)).data;
    expect(data.reminders[0].enabled).toBe(false);
  });

  it("stores saved views and imports exported backups", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createSavedView({
      name: "High priority",
      filters: {
        scope: "open",
        priority: "high",
        projectId: "all",
        reminder: "all",
        folder: "all",
        dateRange: "week",
        tags: [],
        tagMatch: "any",
        advancedFilter: null,
      },
    })).data;
    expect(data.savedViews[0].name).toBe("High priority");

    const backup = await repository.exportBackup();
    const restoredRepository = new LocalRepository();
    const restored = (await restoredRepository.importBackup(backup)).data;

    expect(restored.savedViews[0].filters.priority).toBe("high");
    expect(restored.workspaceId).toBe(data.workspaceId);
  });

  it("creates recurring tasks with a template and first instance", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = (await repository.createRecurringTask({
      title: "Daily review",
      dueDate: "2026-06-01",
      dueTime: "09:00",
      frequency: "daily",
      endDate: "2026-06-05",
      reminderOffset: 15,
    })).data;

    expect(data.recurringTaskTemplates).toHaveLength(1);
    expect(data.recurringTaskTemplates[0]).toMatchObject({
      title: "Daily review",
      frequency: "daily",
      anchorDate: "2026-06-01",
      endDate: "2026-06-05",
      reminderOffset: 15,
    });
    expect(data.tasks[0]).toMatchObject({
      title: "Daily review",
      dueDate: "2026-06-01",
      recurrenceTemplateId: data.recurringTaskTemplates[0].id,
      recurrenceInstanceDate: "2026-06-01",
    });
    expect(data.reminders[0].taskId).toBe(data.tasks[0].id);
    expect(data.reminders[0].offsetMinutes).toBe(15);
  });

  it("generates the next recurring instance once when completing a task", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createRecurringTask({
      title: "Weekly sync",
      dueDate: "2026-06-01",
      frequency: "weekly",
      reminderOffset: 30,
    })).data;
    const firstTaskId = data.tasks[0].id;

    data = (await repository.toggleTask(firstTaskId)).data;
    expect(data.tasks.map((task) => task.dueDate).sort()).toEqual(["2026-06-01", "2026-06-08"]);
    expect(data.reminders).toHaveLength(2);

    data = (await repository.toggleTask(firstTaskId)).data;
    data = (await repository.toggleTask(firstTaskId)).data;
    expect(data.tasks.filter((task) => task.dueDate === "2026-06-08")).toHaveLength(1);
  });

  it("does not generate future instances after a template is disabled or past end date", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createRecurringTask({
      title: "Ends tomorrow",
      dueDate: "2026-06-01",
      frequency: "daily",
      endDate: "2026-06-01",
    })).data;
    data = (await repository.toggleTask(data.tasks[0].id)).data;
    expect(data.tasks).toHaveLength(1);

    data = (await repository.createRecurringTask({
      title: "Disabled",
      dueDate: "2026-06-02",
      frequency: "daily",
    })).data;
    const disabledTaskId = data.tasks[0].id;
    data = (await repository.disableRecurringTaskTemplate(data.recurringTaskTemplates[0].id)).data;
    data = (await repository.toggleTask(disabledTaskId)).data;
    expect(data.tasks.filter((task) => task.title === "Disabled")).toHaveLength(1);
  });

  it("sets task status to in_progress and cancelled via setTaskStatus", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createTask({ title: "Task A", dueDate: "2026-06-01" })).data;
    const taskId = data.tasks[0].id;

    data = (await repository.setTaskStatus(taskId, "in_progress")).data;
    expect(data.tasks[0].status).toBe("in_progress");
    expect(data.tasks[0].completedAt).toBeNull();

    data = (await repository.setTaskStatus(taskId, "cancelled")).data;
    expect(data.tasks[0].status).toBe("cancelled");
    expect(data.tasks[0].completedAt).toBeNull();

    data = (await repository.setTaskStatus(taskId, "completed")).data;
    expect(data.tasks[0].status).toBe("completed");
    expect(data.tasks[0].completedAt).not.toBeNull();
  });

  it("bulk sets status, deletes, and moves tasks", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createTask({ title: "Task A", dueDate: "2026-06-01" })).data;
    data = (await repository.createTask({ title: "Task B", dueDate: "2026-06-02" })).data;
    data = (await repository.createProject({ name: "Proj", color: "#4fb8d8" })).data;
    const projectId = data.projects[0].id;
    const taskIds = data.tasks.filter((task) => task.deletedAt === null).map((task) => task.id);

    data = (await repository.bulkSetTaskStatus(taskIds, "completed")).data;
    expect(data.tasks.filter((task) => task.status === "completed")).toHaveLength(2);

    data = (await repository.bulkSetTaskStatus(taskIds, "todo")).data;
    data = (await repository.bulkMoveTasksToProject(taskIds, projectId)).data;
    expect(data.tasks.every((task) => task.projectId === projectId)).toBe(true);

    data = (await repository.bulkDeleteTasks(taskIds)).data;
    expect(data.tasks.every((task) => task.deletedAt !== null)).toBe(true);
  });

  it("bulk operations are no-ops with empty id arrays", async () => {
    const repository = new LocalRepository();
    await repository.load();
    const before = (await repository.bulkSetTaskStatus([], "completed")).data;
    expect(before.tasks).toEqual((await repository.bulkDeleteTasks([])).data.tasks);
    expect(before.tasks).toEqual((await repository.bulkMoveTasksToProject([], null)).data.tasks);
  });

  it("exports version 2 backups and imports version 1 backups without recurring templates", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createRecurringTask({ title: "Monthly close", dueDate: "2026-01-31", frequency: "monthly" })).data;

    const backup = await repository.exportBackup();
    expect(backup.whattodoBackupVersion).toBe(2);
    expect(backup.recurringTaskTemplates).toHaveLength(1);

    const legacyRepository = new LocalRepository();
    const legacy = (await legacyRepository.importBackup({
      whattodoBackupVersion: 1,
      exportedAt: "2026-06-01T00:00:00.000Z",
      workspaceId: data.workspaceId,
      workspaces: data.workspaces,
      workspaceFolders: data.workspaceFolders,
      projects: data.projects,
      tasks: data.tasks.map((task) => ({ ...task, recurrenceTemplateId: null, recurrenceInstanceDate: null })),
      reminders: data.reminders,
      settingsByWorkspace: { [data.workspaceId]: data.settings },
      savedViews: data.savedViews,
    })).data;

    expect(legacy.recurringTaskTemplates).toEqual([]);
    expect(legacy.tasks[0].recurrenceTemplateId).toBeNull();
  });

  it("returns targeted patch keys for LocalRepository mutations", async () => {
    const repository = new LocalRepository();
    await repository.load();

    const createResult = await repository.createTask({
      title: "Patch test",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      reminderOffset: 30,
    });
    expect(createResult.patch.affectedKeys).toContain("tasks");
    expect(createResult.patch.affectedKeys).toContain("reminders");
    expect(createResult.patch.affectedKeys).not.toContain("settings");

    const settingsResult = await repository.saveSettings({ ...createResult.data.settings, theme: "dark" });
    expect(settingsResult.patch.affectedKeys).toContain("settings");
    expect(settingsResult.patch.affectedKeys).not.toContain("tasks");
  });
});

describe("SqlRepository", () => {
  beforeEach(() => {
    vi.mocked(Database.load).mockReset();
  });

  it("updates snoozed and disabled reminder fields", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          return [
            {
              id: "local-workspace",
              name: "Default",
              color: "#4fb8d8",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ];
        }

        if (query.includes("FROM tasks")) {
          return [];
        }

        if (query.includes("FROM reminders")) {
          return [];
        }

        if (query.includes("FROM settings")) {
          return [];
        }

        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    await repository.snoozeReminder("reminder_a", "2026-06-01T09:45:00.000Z");
    await repository.disableReminder("reminder_a");
    await repository.loadAvailableTasks();
    await repository.loadRecoveryItems();

    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE reminders SET snoozed_until = ?, fired_at = NULL, failed_at = NULL, last_error = NULL WHERE id = ?",
      ["2026-06-01T09:45:00.000Z", "reminder_a"],
    );
    expect(db.execute).toHaveBeenCalledWith("UPDATE reminders SET enabled = ? WHERE id = ?", [0, "reminder_a"]);
    expect(db.select).toHaveBeenCalledWith(
      "SELECT * FROM tasks WHERE workspace_id != ? AND deleted_at IS NULL ORDER BY created_at DESC",
      ["local-workspace"],
    );
  });

  it("loads task pages with SQL filters and reminder rows", async () => {
    const taskRow = {
      id: "task_a",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "Alpha task",
      notes: "",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "Asia/Shanghai",
      priority: "high",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
    };
    const reminderRow = {
      id: "reminder_a",
      task_id: "task_a",
      remind_at: "2026-06-01T09:30:00.000Z",
      offset_minutes: 30,
      snoozed_until: null,
      fired_at: null,
      failed_at: null,
      last_error: null,
      last_attempted_at: null,
      enabled: 1,
    };
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.startsWith("SELECT COUNT(*)")) {
          return [{ total: 1 }];
        }

        if (query.includes("FROM tasks WHERE")) {
          return [taskRow];
        }

        if (query.includes("FROM reminders WHERE task_id IN")) {
          return [reminderRow];
        }

        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    const result = await repository.loadTaskPage({
      workspaceId: "local-workspace",
      scope: "open",
      date: "2026-06-01",
      projectId: null,
      priority: "high",
      reminder: "with",
      folder: "without",
      dateRange: "today",
      referenceDate: "2026-06-01",
      query: "alpha",
      limit: 25,
      offset: 0,
      sort: "overview",
    });

    expect(result.total).toBe(1);
    expect(result.tasks[0].id).toBe("task_a");
    expect(result.reminders[0].id).toBe("reminder_a");
    // "open" scope now matches both "todo" and "in_progress" (active tasks)
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("LIMIT ? OFFSET ?"), [
      "local-workspace",
      "todo",
      "in_progress",
      "2026-06-01",
      "high",
      "2026-06-01",
      "%alpha%",
      "%alpha%",
      "%alpha%",
      "%alpha%",
      "%alpha%",
      25,
      0,
    ]);
  });

  it("returns full patch for SqlRepository mutations", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          return [
            {
              id: "local-workspace",
              name: "Default",
              color: "#4fb8d8",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ];
        }

        if (query.includes("FROM tasks")) {
          return [];
        }

        if (query.includes("FROM reminders")) {
          return [];
        }

        if (query.includes("FROM settings")) {
          return [];
        }

        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.snoozeReminder("reminder_a", "2026-06-01T09:45:00.000Z");
    expect(result.patch.affectedKeys.length).toBeGreaterThan(10);
  });

  it("creates a workspace with INSERT sql", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.createWorkspace({ name: "Team", color: "#ff0000" });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO workspaces"),
      expect.arrayContaining(["Team", "#ff0000"]),
    );
    expect(result.patch.affectedKeys).toContain("workspaces");
  });

  it("updates a workspace name and color", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.updateWorkspace("local-workspace", { name: "Renamed", color: "#00ff00" });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspaces SET name = ?, color = ?"),
      expect.arrayContaining(["Renamed", "#00ff00", "local-workspace"]),
    );
    expect(result.patch.affectedKeys).toContain("workspaces");
  });

  it("soft-deletes a workspace by id", async () => {
    // 自定义 mock：直接返回 2 个 workspace，避免触发 CANNOT_DELETE_LAST_WORKSPACE
    // （makeEmptySqlDb 只返回 1 个，且 createWorkspace 的 INSERT 不会改变 mock 状态）
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          return [
            {
              id: "local-workspace",
              name: "Default",
              color: "#4fb8d8",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
            {
              id: "workspace_second",
              name: "Second",
              color: "#00ff00",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ];
        }
        if (query.includes("FROM tasks")) {
          return [];
        }
        if (query.includes("FROM reminders")) {
          return [];
        }
        if (query.includes("FROM settings")) {
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.deleteWorkspace("local-workspace");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspaces SET deleted_at = ?"),
      expect.arrayContaining(["local-workspace"]),
    );
  });

  it("creates a project linked to workspace", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.createProject({ name: "Web", color: "#abc", workingFolder: "D:\\web" });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO projects"),
      expect.arrayContaining(["Web", "#abc", "D:\\web"]),
    );
    expect(result.patch.affectedKeys).toContain("projects");
  });

  it("updates project status to archived", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.archiveProject("project_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects SET status = ?, archived_at = ?"),
      expect.arrayContaining(["archived", "project_a"]),
    );
  });

  it("archives a project as soft-delete equivalent", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    // deleteProject 不存在，用 archiveProject 验证归档路径
    await repository.archiveProject("project_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects SET status = ?, archived_at = ?"),
      expect.arrayContaining(["archived", "project_a"]),
    );
  });

  it("creates a task with reminderOffset", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.createTask({
      title: "Task A",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      reminderOffset: 30,
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tasks"),
      expect.arrayContaining(["Task A", "2026-06-01", "10:00"]),
    );
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO reminders"),
      expect.arrayContaining([expect.any(String), 30]),
    );
    expect(result.patch.affectedKeys).toContain("tasks");
    expect(result.patch.affectedKeys).toContain("reminders");
  });

  it("updates task title and dueDate", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.updateTask("task_a", { title: "Updated", dueDate: "2026-06-05" });
    // SqlRepository.updateTask 写入整行（全字段 UPDATE），验证关键字段在参数中
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+tasks\s+SET/i),
      expect.arrayContaining(["Updated", "2026-06-05", "task_a"]),
    );
  });

  it("toggles task status to completed", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.toggleTask("task_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks SET status = ?, completed_at = ?"),
      expect.arrayContaining(["completed", "task_a"]),
    );
  });

  it("soft-deletes a task", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.deleteTask("task_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks SET deleted_at = ?"),
      expect.arrayContaining(["task_a"]),
    );
  });

  it("sets task status to in_progress via setTaskStatus", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.setTaskStatus("task_a", "in_progress");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks SET status = ?, completed_at = ?"),
      expect.arrayContaining(["in_progress", "task_a"]),
    );
  });

  it("bulk sets task status for multiple tasks", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
      makeTaskRow("task_b", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.bulkSetTaskStatus(["task_a", "task_b"], "completed");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE tasks SET status = \?, completed_at = \?, updated_at = \? WHERE id IN/i),
      expect.arrayContaining(["completed", "task_a", "task_b"]),
    );
  });

  it("bulk deletes multiple tasks", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
      makeTaskRow("task_b", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.bulkDeleteTasks(["task_a", "task_b"]);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE tasks SET deleted_at = \?, updated_at = \? WHERE id IN/i),
      expect.arrayContaining(["task_a", "task_b"]),
    );
  });

  it("bulk moves tasks to a project", async () => {
    const db = makeSqlDbWithTasks([
      makeTaskRow("task_a", "todo", null),
      makeTaskRow("task_b", "todo", null),
    ]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.bulkMoveTasksToProject(["task_a", "task_b"], "project_x");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE tasks SET project_id = \?, updated_at = \? WHERE id IN/i),
      expect.arrayContaining(["project_x", "task_a", "task_b"]),
    );
  });

  it("creates a recurring task template", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.createRecurringTask({
      title: "Daily standup",
      dueDate: "2026-06-01",
      dueTime: "09:00",
      frequency: "weekly",
      reminderOffset: 15,
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO recurring_task_templates"),
      expect.arrayContaining(["Daily standup", "weekly"]),
    );
    expect(result.patch.affectedKeys).toContain("recurringTaskTemplates");
  });

  it("updates recurring template frequency", async () => {
    const db = makeSqlDbWithTemplates();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.updateRecurringTaskTemplate("template_a", { frequency: "daily" });
    // SqlRepository.updateRecurringTaskTemplate 写入整行（全字段 UPDATE），验证关键字段在参数中
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+recurring_task_templates\s+SET/i),
      expect.arrayContaining(["daily", "template_a"]),
    );
  });

  it("saves per-workspace settings", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const result = await repository.saveSettings({
      theme: "dark",
      accentColor: "emerald",
      language: "zh",
      defaultReminderOffset: 20,
      defaultWorkingFolder: null,
      defaultSavedViewId: null,
      notificationsEnabled: true,
      closeToTray: true,
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO settings"),
      expect.any(Array),
    );
    expect(result.patch.affectedKeys).toContain("settings");
    expect(result.patch.affectedKeys).toContain("settingsByWorkspace");
  });

  it("creates and deletes a saved view", async () => {
    const db = makeEmptySqlDb();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.createSavedView({
      name: "My view",
      filters: {
        scope: "open",
        priority: "all",
        projectId: "all",
        reminder: "all",
        folder: "all",
        dateRange: "all",
        tags: [],
        tagMatch: "any",
        advancedFilter: null,
      },
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO saved_views"),
      expect.any(Array),
    );

    await repository.deleteSavedView("view_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM saved_views WHERE id = ?"),
      expect.arrayContaining(["view_a"]),
    );
  });

  it("imports backup transaction commits all inserts", async () => {
    const db = makeEmptySqlDbWithSettings();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();

    const backup = await repository.exportBackup();
    await repository.importBackup(backup);

    const executeCalls = db.execute.mock.calls.map((call) => call[0]);
    expect(executeCalls).toContain("BEGIN TRANSACTION");
    expect(executeCalls).toContain("COMMIT");
    expect(executeCalls).toContain("DELETE FROM tasks");
    expect(executeCalls).toContain("DELETE FROM workspaces");
    expect(executeCalls.some((sql) => sql.includes("INSERT INTO workspaces"))).toBe(true);
  });

  it("importBackup reads normalized backup settings not payload", async () => {
    const db = makeEmptySqlDbWithSettings();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();

    const backup = await repository.exportBackup();
    expect(backup.settingsByWorkspace).toBeDefined();
    // 验证 importBackup 不抛错（读取 backup.settingsByWorkspace 而非 payload）
    await expect(repository.importBackup(backup)).resolves.toBeDefined();
  });

  it("loadRecovery returns deleted tasks and archived projects", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          return [
            {
              id: "local-workspace",
              name: "Default",
              color: "#4fb8d8",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ];
        }
        if (query.includes("deleted_at IS NOT NULL") && query.includes("FROM tasks")) {
          return [makeTaskRow("deleted_task", "todo", "2026-06-01T00:00:00.000Z")];
        }
        if (query.includes("status = ?") && query.includes("archived")) {
          return [
            {
              id: "archived_project",
              workspace_id: "local-workspace",
              name: "Old",
              color: "#000",
              status: "archived",
              due_date: null,
              working_folder: null,
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              archived_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const recovery = await repository.loadRecoveryItems();
    expect(recovery.deletedTasks.length).toBeGreaterThan(0);
  });
});

// 辅助工厂：空数据库 mock（只有默认 workspace，无其他数据）
function makeEmptySqlDb() {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(async (query: string) => {
      if (query.includes("FROM workspaces")) {
        return [
          {
            id: "local-workspace",
            name: "Default",
            color: "#4fb8d8",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
            deleted_at: null,
          },
        ];
      }
      if (query.includes("FROM tasks")) {
        return [];
      }
      if (query.includes("FROM reminders")) {
        return [];
      }
      if (query.includes("FROM settings")) {
        return [];
      }
      return [];
    }),
  };
}

function makeTaskRow(id: string, status: string, deletedAt: string | null) {
  return {
    id,
    workspace_id: "local-workspace",
    project_id: null,
    working_folder: null,
    title: `Task ${id}`,
    notes: "",
    due_date: "2026-06-01",
    due_time: null,
    timezone: "Asia/Shanghai",
    priority: "medium",
    status,
    completed_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    deleted_at: deletedAt,
    recurrence_template_id: null,
    recurrence_instance_date: null,
  };
}

function makeSqlDbWithTasks(taskRows: ReturnType<typeof makeTaskRow>[]) {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(async (query: string) => {
      if (query.includes("FROM workspaces")) {
        return [
          {
            id: "local-workspace",
            name: "Default",
            color: "#4fb8d8",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
            deleted_at: null,
          },
        ];
      }
      if (query.includes("FROM tasks") && query.includes("WHERE id = ?")) {
        // 单任务查询（updateTask/toggleTask 需要）
        return taskRows;
      }
      if (query.includes("FROM tasks")) {
        return taskRows;
      }
      if (query.includes("FROM reminders")) {
        return [];
      }
      if (query.includes("FROM settings")) {
        return [];
      }
      return [];
    }),
  };
}

function makeSqlDbWithTemplates() {
  const templateRow = {
    id: "template_a",
    workspace_id: "local-workspace",
    title: "Standup",
    notes: "",
    project_id: null,
    working_folder: null,
    due_time: "09:00",
    timezone: "Asia/Shanghai",
    priority: "medium",
    reminder_offset: 15,
    frequency: "weekly",
    interval: 1,
    anchor_date: "2026-06-01",
    end_date: null,
    enabled: 1,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    deleted_at: null,
  };
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(async (query: string) => {
      if (query.includes("FROM workspaces")) {
        return [
          {
            id: "local-workspace",
            name: "Default",
            color: "#4fb8d8",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
            deleted_at: null,
          },
        ];
      }
      if (query.includes("FROM recurring_task_templates")) {
        return [templateRow];
      }
      if (query.includes("FROM tasks")) {
        return [];
      }
      if (query.includes("FROM reminders")) {
        return [];
      }
      if (query.includes("FROM settings")) {
        return [];
      }
      return [];
    }),
  };
}

function makeEmptySqlDbWithSettings() {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(async (query: string) => {
      if (query.includes("FROM workspaces")) {
        return [
          {
            id: "local-workspace",
            name: "Default",
            color: "#4fb8d8",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
            deleted_at: null,
          },
        ];
      }
      if (query.includes("FROM tasks")) {
        return [];
      }
      if (query.includes("FROM reminders")) {
        return [];
      }
      if (query.includes("FROM settings")) {
        return [
          {
            workspace_id: "local-workspace",
            theme: "dark",
            accent_color: "blue",
            language: "zh",
            default_reminder_offset: 15,
            default_working_folder: null,
            default_saved_view_id: null,
            notifications_enabled: 1,
            close_to_tray: 1,
          },
        ];
      }
      return [];
    }),
  };
}
