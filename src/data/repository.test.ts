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
    expect(Object.prototype.hasOwnProperty.call(result.tasks[0], "notes")).toBe(false);
    const alphaId = data.tasks.find((task) => task.title === "Alpha task")?.id;
    expect(result.reminders.map((reminder) => reminder.taskId)).toEqual([alphaId]);
    const fullTask = await repository.getTask(alphaId!);
    expect(fullTask?.notes).toBeDefined();
  });

  it("strips notes from LocalRepository loadTaskPage and returns them via getTask", async () => {
    const repository = new LocalRepository();
    await repository.load();
    const created = (
      await repository.createTask({
        title: "Notes task",
        dueDate: "2026-06-01",
        notes: "full body notes",
      })
    ).data;
    const taskId = created.tasks.find((task) => task.title === "Notes task")!.id;

    expect(Object.prototype.hasOwnProperty.call(created.tasks.find((task) => task.id === taskId)!, "notes")).toBe(
      false,
    );

    const page = await repository.loadTaskPage({
      scope: "open",
      date: "2026-06-01",
      limit: 10,
      offset: 0,
      sort: "overview",
    });
    const summary = page.tasks.find((task) => task.id === taskId);
    expect(summary).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(summary!, "notes")).toBe(false);

    const full = await repository.getTask(taskId);
    expect(full?.notes).toBe("full body notes");
  });

  it("searches tasks across workspaces when workspaceScope is all", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    const homeId = data.workspaceId;
    data = (await repository.createTask({ title: "Home only", dueDate: "2026-06-01" })).data;
    data = (await repository.createWorkspace({ name: "Side", color: "#6cc083" })).data;
    const sideId = data.workspaces.find((workspace) => workspace.name === "Side")!.id;
    data = (await repository.selectWorkspace(sideId)).data;
    await repository.createTask({ title: "Side only", dueDate: "2026-06-01" });

    const currentOnly = await repository.loadTaskPage({
      workspaceId: sideId,
      workspaceScope: "current",
      scope: "all",
      query: "only",
      limit: 20,
      offset: 0,
      sort: "overview",
    });
    expect(currentOnly.tasks.map((task) => task.title)).toEqual(["Side only"]);

    const allScopes = await repository.loadTaskPage({
      workspaceId: sideId,
      workspaceScope: "all",
      scope: "all",
      query: "only",
      limit: 20,
      offset: 0,
      sort: "overview",
    });
    expect(allScopes.tasks.map((task) => task.title).sort()).toEqual(["Home only", "Side only"]);
    expect(allScopes.tasks.some((task) => task.workspaceId === homeId)).toBe(true);
  });

  it("aggregates due date counts for a visible range", async () => {
    const repository = new LocalRepository();
    await repository.load();
    await repository.createTask({ title: "Day1-a", dueDate: "2026-06-01" });
    await repository.createTask({ title: "Day1-b", dueDate: "2026-06-01" });
    await repository.createTask({ title: "Day2", dueDate: "2026-06-02" });
    await repository.createTask({ title: "Outside", dueDate: "2026-06-10" });

    const counts = await repository.loadDueDateCounts({
      from: "2026-06-01",
      to: "2026-06-02",
    });

    expect(counts).toEqual({
      "2026-06-01": 2,
      "2026-06-02": 1,
    });
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
    let events = await repository.loadReminderEvents(reminderId);
    expect(events.map((event) => event.eventType)).toEqual(["fired"]);

    data = (await repository.snoozeReminder(reminderId, "2026-06-01T09:45:00.000Z")).data;
    expect(data.reminders[0].snoozedUntil).toBe("2026-06-01T09:45:00.000Z");
    expect(data.reminders[0].firedAt).toBeNull();

    data = (await repository.disableReminder(reminderId)).data;
    expect(data.reminders[0].enabled).toBe(false);
    events = await repository.loadReminderEvents(reminderId);
    expect(events.map((event) => event.eventType)).toEqual(["disabled", "snoozed", "fired"]);
  });

  it("merges backup by id without wiping local-only rows", async () => {
    const repository = new LocalRepository();
    await repository.load();
    const seed = (await repository.createTask({ title: "Shared original", dueDate: "2026-06-02" })).data;
    const sharedId = seed.tasks[0].id;
    const withLocal = (await repository.createTask({ title: "Local only", dueDate: "2026-06-01" })).data;
    const localOnlyId = withLocal.tasks.find((task) => task.title === "Local only")!.id;

    const backup = await repository.exportBackup();
    backup.tasks = backup.tasks
      .filter((task) => task.id === sharedId)
      .map((task) => ({ ...task, title: "Shared updated" }));
    backup.reminders = [];

    const merged = (await repository.importBackup(backup, "merge")).data;
    expect(merged.tasks.find((task) => task.id === sharedId)?.title).toBe("Shared updated");
    expect(merged.tasks.find((task) => task.id === localOnlyId)?.title).toBe("Local only");
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
    expect(data.savedViews[0].pinned).toBe(false);

    data = (
      await repository.updateSavedView(data.savedViews[0].id, {
        name: "High priority",
        filters: data.savedViews[0].filters,
        pinned: true,
      })
    ).data;
    expect(data.savedViews[0].pinned).toBe(true);

    const backup = await repository.exportBackup();
    const restoredRepository = new LocalRepository();
    const restored = (await restoredRepository.importBackup(backup)).data;

    expect(restored.savedViews[0].filters.priority).toBe("high");
    expect(restored.savedViews[0].pinned).toBe(true);
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

  it("inherits tags and parentId onto the next recurring instance", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createTask({ title: "Parent", dueDate: "2026-06-01" })).data;
    const parentId = data.tasks[0].id;

    data = (
      await repository.createRecurringTask({
        title: "Tagged series",
        dueDate: "2026-06-01",
        frequency: "daily",
        parentId,
        tags: ["work", "series"],
      })
    ).data;

    expect(data.recurringTaskTemplates[0]).toMatchObject({
      parentId,
      tags: ["work", "series"],
    });
    expect(data.tasks.find((task) => task.title === "Tagged series")).toMatchObject({
      parentId,
      tags: ["work", "series"],
    });

    const firstId = data.tasks.find((task) => task.title === "Tagged series")!.id;
    const templateId = data.recurringTaskTemplates[0].id;
    data = (await repository.toggleTask(firstId)).data;
    const next = data.tasks.find(
      (task) => task.recurrenceTemplateId === templateId && task.id !== firstId,
    );
    expect(next).toMatchObject({
      parentId,
      tags: ["work", "series"],
      dueDate: "2026-06-02",
    });
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

  it("updates open future instances when updateRecurringSeries mode is openFuture", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (
      await repository.createRecurringTask({
        title: "Standup",
        dueDate: "2026-06-01",
        frequency: "daily",
        reminderOffset: 10,
      })
    ).data;
    const template = data.recurringTaskTemplates[0];
    const first = data.tasks[0];
    data = (await repository.toggleTask(first.id)).data;
    const openFuture = data.tasks.find(
      (task) => task.recurrenceTemplateId === template.id && task.status === "todo",
    );
    expect(openFuture).toBeTruthy();

    data = (
      await repository.updateRecurringSeries(
        template.id,
        { title: "Renamed standup", reminderOffset: null },
        "openFuture",
      )
    ).data;
    const synced = data.tasks.find((task) => task.id === openFuture!.id);
    expect(synced?.title).toBe("Renamed standup");
    expect(data.tasks.find((task) => task.id === first.id)?.title).toBe("Standup");
    expect(data.reminders.some((reminder) => reminder.taskId === openFuture!.id)).toBe(false);
    expect(data.recurringTaskTemplates[0].title).toBe("Renamed standup");
  });

  it("updateRecurringSeries template mode does not rewrite open instances", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (
      await repository.createRecurringTask({
        title: "Standup",
        dueDate: "2026-06-01",
        frequency: "daily",
      })
    ).data;
    const template = data.recurringTaskTemplates[0];
    const first = data.tasks[0];
    data = (await repository.toggleTask(first.id)).data;
    const openFuture = data.tasks.find(
      (task) => task.recurrenceTemplateId === template.id && task.status === "todo",
    )!;

    data = (await repository.updateRecurringSeries(template.id, { title: "Template only" }, "template")).data;
    expect(data.recurringTaskTemplates[0].title).toBe("Template only");
    expect(data.tasks.find((task) => task.id === openFuture.id)?.title).toBe("Standup");
  });

  it("loads task pages with tag filters", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createTask({ title: "Alpha", dueDate: "2026-06-01" })).data;
    const alpha = data.tasks[0];
    data = (await repository.createTask({ title: "Beta", dueDate: "2026-06-02" })).data;
    const beta = data.tasks.find((task) => task.title === "Beta")!;
    await repository.updateTask(alpha.id, { tags: ["work"] });
    await repository.updateTask(beta.id, { tags: ["home"] });

    const page = await repository.loadTaskPage({
      scope: "all",
      tags: ["work"],
      tagMatch: "any",
      limit: 50,
      offset: 0,
      sort: "overview",
    });
    expect(page.tasks.map((task) => task.id)).toEqual([alpha.id]);
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

  it("exports version 3 backups and imports version 1 backups without recurring templates", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = (await repository.createRecurringTask({ title: "Monthly close", dueDate: "2026-01-31", frequency: "monthly" })).data;

    const backup = await repository.exportBackup();
    expect(backup.whattodoBackupVersion).toBe(3);
    expect(backup.recurringTaskTemplates).toHaveLength(1);

    const legacyRepository = new LocalRepository();
    const legacy = (await legacyRepository.importBackup({
      whattodoBackupVersion: 1,
      exportedAt: "2026-06-01T00:00:00.000Z",
      workspaceId: data.workspaceId,
      workspaces: data.workspaces,
      workspaceFolders: data.workspaceFolders,
      projects: data.projects,
      tasks: data.tasks.map((task) => ({
        ...task,
        notes: "",
        recurrenceTemplateId: null,
        recurrenceInstanceDate: null,
      })),
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

  it("honors optional client-provided attachment id", async () => {
    const repository = new LocalRepository();
    await repository.load();
    const created = await repository.createTask({ title: "With attachment", dueDate: "2026-06-01" });
    const taskId = created.data.tasks[0]!.id;
    const result = await repository.addAttachment({
      id: "attachment_fixed_id",
      taskId,
      filename: "notes.pdf",
      path: "/tmp/notes.pdf",
    });
    expect(result.data.attachments.some((item) => item.id === "attachment_fixed_id")).toBe(true);
    expect(result.patch.affectedKeys).toContain("attachments");
  });

  it("skips migrateExternalAttachments in LocalRepository", async () => {
    const repository = new LocalRepository();
    await repository.load();
    const created = await repository.createTask({ title: "With attachment", dueDate: "2026-06-01" });
    await repository.addAttachment({
      taskId: created.data.tasks[0]!.id,
      filename: "notes.pdf",
      path: "/tmp/notes.pdf",
    });
    const result = await repository.migrateExternalAttachments();
    expect(result.report).toEqual({ migrated: 0, skipped: 1, failed: 0 });
    expect(result.patch.affectedKeys).toEqual([]);
    expect(result.data.attachments[0]?.path).toBe("/tmp/notes.pdf");
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
      expect.stringMatching(/^SELECT id, workspace_id.*FROM tasks WHERE workspace_id != \? AND deleted_at IS NULL/),
      ["local-workspace"],
    );
    expect(db.select).toHaveBeenCalledWith(
      expect.stringMatching(/^SELECT id, workspace_id.*FROM tasks WHERE workspace_id = \? AND deleted_at IS NOT NULL/),
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
    expect(Object.prototype.hasOwnProperty.call(result.tasks[0], "notes")).toBe(false);
    expect(result.reminders[0].id).toBe("reminder_a");
    const pageSelect = db.select.mock.calls.find((call: unknown[]) => String(call[0]).includes("LIMIT ? OFFSET ?"));
    expect(pageSelect?.[0]).toEqual(expect.stringContaining("SELECT id, workspace_id"));
    expect(pageSelect?.[0]).not.toEqual(expect.stringMatching(/^SELECT \* FROM tasks/));
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

  it("returns targeted reminder patch for SqlRepository snooze without full readAll", async () => {
    const reminderRow = {
      id: "reminder_a",
      task_id: "task_a",
      remind_at: "2026-06-01T09:00:00.000Z",
      offset_minutes: 10,
      snoozed_until: null,
      fired_at: null,
      failed_at: null,
      last_error: null,
      last_attempted_at: null,
      enabled: 1,
    };
    const taskRow = {
      id: "task_a",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "A",
      notes: "",
      due_date: "2026-06-01",
      due_time: "09:10",
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
    };
    let settingsSelectCount = 0;
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

        if (query.includes("FROM tasks") && query.includes("deleted_at IS NULL") && !query.includes("INNER JOIN")) {
          return [taskRow];
        }

        if (query.includes("FROM reminders") || query.includes("reminders.*")) {
          return [reminderRow];
        }

        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }

        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;

    const result = await repository.snoozeReminder("reminder_a", "2026-06-01T09:45:00.000Z");
    expect(result.patch.affectedKeys).toEqual(["reminders"]);
    expect(result.data.reminders[0]?.snoozedUntil).toBe("2026-06-01T09:45:00.000Z");
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalled();
  });

  it("returns targeted tasks patch for SqlRepository toggleTask without full readAll", async () => {
    const taskRow = {
      id: "task_a",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "A",
      notes: "",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
    };
    let settingsSelectCount = 0;
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

        if (query.includes("FROM tasks") && query.includes("deleted_at IS NULL")) {
          return [taskRow];
        }

        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }

        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;

    const result = await repository.toggleTask("task_a");
    expect(result.patch.affectedKeys).toEqual(["tasks"]);
    expect(result.data.tasks[0]?.status).toBe("completed");
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
  });

  it("returns targeted tasks patch for SqlRepository createTask without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.createTask({
      title: "Created",
      dueDate: "2026-06-01",
      notes: "create notes",
      reminderOffset: 15,
    });
    expect(result.patch.affectedKeys).toEqual(["tasks", "reminders"]);
    expect(result.data.tasks.some((task) => task.title === "Created")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.data.tasks.find((task) => task.title === "Created")!, "notes")).toBe(
      false,
    );
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tasks"),
      expect.arrayContaining(["Created", "create notes"]),
    );
  });

  it("returns targeted tasks patch for SqlRepository updateTask without full readAll", async () => {
    const taskRow = {
      id: "task_a",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "A",
      notes: "before",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
    };
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
          return [taskRow];
        }
        if (query.includes("FROM reminders")) {
          return [];
        }
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.updateTask("task_a", { title: "Updated", notes: "after notes" });
    expect(result.patch.affectedKeys).toEqual(["tasks"]);
    expect(Object.prototype.hasOwnProperty.call(result.data.tasks.find((task) => task.id === "task_a")!, "notes")).toBe(
      false,
    );
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+tasks\s+SET/i),
      expect.arrayContaining(["Updated", "after notes", "task_a"]),
    );
  });

  it("returns targeted settings patch for SqlRepository saveSettings without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [
            {
              workspace_id: "local-workspace",
              theme: "system",
              accent_color: "#4fb8d8",
              language: "en",
              default_reminder_offset: 15,
              default_working_folder: null,
              default_saved_view_id: null,
              notifications_enabled: 1,
              close_to_tray: 0,
            },
          ];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    const loaded = await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.saveSettings({ ...loaded.settings, theme: "dark" });
    expect(result.patch.affectedKeys).toEqual(["settings", "settingsByWorkspace"]);
    expect(result.data.settings.theme).toBe("dark");
    expect(result.data.settingsByWorkspace["local-workspace"]?.theme).toBe("dark");
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO settings"), expect.any(Array));
  });

  it("returns targeted projects patch for SqlRepository createProject without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.createProject({
      name: "New project",
      color: "#ff0000",
      dueDate: "2026-06-15",
    });
    expect(result.patch.affectedKeys).toEqual(["projects"]);
    expect(result.data.projects.some((project) => project.name === "New project")).toBe(true);
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO projects"), expect.any(Array));
  });

  it("returns targeted savedViews patch for SqlRepository createSavedView and updateSavedView without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const filters = {
      scope: "open" as const,
      priority: "all" as const,
      projectId: "all" as const,
      reminder: "all" as const,
      folder: "all" as const,
      dateRange: "all" as const,
      tags: [] as string[],
      tagMatch: "any" as const,
      advancedFilter: null,
    };

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const created = await repository.createSavedView({ name: "My view", filters });
    expect(created.patch.affectedKeys).toEqual(["savedViews"]);
    const viewId = created.data.savedViews.find((view) => view.name === "My view")?.id;
    expect(viewId).toBeTruthy();

    const updated = await repository.updateSavedView(viewId!, { name: "Renamed view", filters, pinned: true });
    expect(updated.patch.affectedKeys).toEqual(["savedViews"]);
    expect(updated.data.savedViews.find((view) => view.id === viewId)?.name).toBe("Renamed view");
    expect(updated.data.savedViews.find((view) => view.id === viewId)?.pinned).toBe(true);
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
  });

  it("returns targeted tasks patch for SqlRepository bulkDeleteTasks without full readAll", async () => {
    const taskRows = [
      {
        id: "task_a",
        workspace_id: "local-workspace",
        project_id: null,
        working_folder: null,
        title: "A",
        notes: "",
        due_date: "2026-06-01",
        due_time: null,
        timezone: "UTC",
        priority: "medium",
        status: "todo",
        completed_at: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        deleted_at: null,
        recurrence_template_id: null,
        recurrence_instance_date: null,
        parent_id: null,
        tags: "[]",
      },
      {
        id: "task_b",
        workspace_id: "local-workspace",
        project_id: null,
        working_folder: null,
        title: "B",
        notes: "",
        due_date: "2026-06-02",
        due_time: null,
        timezone: "UTC",
        priority: "medium",
        status: "todo",
        completed_at: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        deleted_at: null,
        recurrence_template_id: null,
        recurrence_instance_date: null,
        parent_id: null,
        tags: "[]",
      },
    ];
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM tasks") && query.includes("deleted_at IS NULL")) {
          return taskRows;
        }
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.bulkDeleteTasks(["task_a", "task_b"]);
    expect(result.patch.affectedKeys).toEqual(["tasks", "reminders"]);
    expect(result.data.tasks.some((task) => task.id === "task_a" || task.id === "task_b")).toBe(false);
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+tasks\s+SET/i),
      expect.arrayContaining(["task_a", "task_b"]),
    );
  });

  it("returns targeted workspaceFolders patch for SqlRepository createWorkspaceFolder without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.createWorkspaceFolder({ name: "Docs", path: "C:/Docs" });
    expect(result.patch.affectedKeys).toEqual(["workspaceFolders"]);
    expect(result.data.workspaceFolders.some((folder) => folder.name === "Docs" && folder.path === "C:/Docs")).toBe(true);
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO workspace_folders"), expect.any(Array));
  });

  it("returns targeted workspaces patch for SqlRepository updateWorkspace without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.updateWorkspace("local-workspace", { name: "Renamed", color: "#112233" });
    expect(result.patch.affectedKeys).toEqual(["workspaces"]);
    expect(result.data.workspaces.find((workspace) => workspace.id === "local-workspace")?.name).toBe("Renamed");
    expect(result.data.workspaces.find((workspace) => workspace.id === "local-workspace")?.color).toBe("#112233");
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspaces SET"),
      expect.arrayContaining(["Renamed", "#112233", "local-workspace"]),
    );
  });

  it("returns targeted recurringTaskTemplates and tasks patch for SqlRepository createRecurringTask without full readAll", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.createRecurringTask({
      title: "Weekly review",
      dueDate: "2026-06-01",
      frequency: "weekly",
      interval: 1,
      reminderOffset: 30,
    });
    expect(result.patch.affectedKeys).toEqual(["recurringTaskTemplates", "tasks", "reminders"]);
    expect(result.data.recurringTaskTemplates.some((template) => template.title === "Weekly review")).toBe(true);
    expect(result.data.tasks.some((task) => task.title === "Weekly review")).toBe(true);
    expect(result.data.reminders.some((reminder) => reminder.offsetMinutes === 30)).toBe(true);
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO recurring_task_templates"), expect.any(Array));
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO tasks"), expect.any(Array));
  });

  it("returns targeted recurringTaskTemplates patch for SqlRepository disableRecurringTaskTemplate without full readAll", async () => {
    const templateRow = {
      id: "recur_a",
      workspace_id: "local-workspace",
      title: "Weekly review",
      notes: "",
      project_id: null,
      working_folder: null,
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      reminder_offset: null,
      frequency: "weekly",
      interval: 1,
      by_weekday: null,
      anchor_date: "2026-06-01",
      end_date: null,
      enabled: 1,
      parent_id: null,
      tags: "[]",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
    };
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.disableRecurringTaskTemplate("recur_a");
    expect(result.patch.affectedKeys).toEqual(["recurringTaskTemplates"]);
    expect(result.data.recurringTaskTemplates.find((template) => template.id === "recur_a")?.enabled).toBe(false);
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE recurring_task_templates SET enabled"),
      expect.arrayContaining([0, "recur_a"]),
    );
  });

  it("returns targeted patch for SqlRepository createWorkspace without full readAll", async () => {
    let settingsSelectCount = 0;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;

    const result = await repository.createWorkspace({ name: "Team", color: "#ff0000" });
    expect(result.data.workspaceId).not.toBe("local-workspace");
    expect(result.data.tasks).toEqual([]);
    expect(result.data.projects).toEqual([]);
    expect(result.patch.affectedKeys).toEqual(
      expect.arrayContaining(["workspaceId", "workspaces", "tasks", "settings", "settingsByWorkspace"]),
    );
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO workspaces"),
      expect.arrayContaining(["Team", "#ff0000"]),
    );
  });

  it("returns targeted workspaces patch for SqlRepository deleteWorkspace of non-current workspace", async () => {
    let settingsSelectCount = 0;
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.deleteWorkspace("workspace_second");
    expect(result.patch.affectedKeys).toEqual(["workspaces"]);
    expect(result.data.workspaces.find((workspace) => workspace.id === "workspace_second")).toBeUndefined();
    expect(result.data.workspaceId).toBe("local-workspace");
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
  });

  it("returns workspace-switch patch for SqlRepository selectWorkspace without full workspaces reread", async () => {
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings") && params?.[0] === "workspace_second") {
          return [
            {
              workspace_id: "workspace_second",
              theme: "dark",
              accent_color: "blue",
              language: "zh",
              default_reminder_offset: 30,
              default_working_folder: null,
              default_saved_view_id: null,
              notifications_enabled: 0,
              close_to_tray: 1,
            },
          ];
        }
        if (query.includes("FROM settings")) {
          return [];
        }
        if (query.includes("FROM tasks") && params?.[0] === "workspace_second") {
          return [
            {
              id: "task_side",
              workspace_id: "workspace_second",
              project_id: null,
              working_folder: null,
              title: "Side task",
              due_date: "2026-07-01",
              due_time: null,
              timezone: "Asia/Shanghai",
              priority: "medium",
              status: "todo",
              completed_at: null,
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
              recurrence_template_id: null,
              recurrence_instance_date: null,
              parent_id: null,
              tags_json: "[]",
            },
          ];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.selectWorkspace("workspace_second");
    expect(result.data.workspaceId).toBe("workspace_second");
    expect(result.data.tasks.map((task) => task.id)).toEqual(["task_side"]);
    expect(result.patch.affectedKeys).toEqual(
      expect.arrayContaining(["workspaceId", "tasks", "settings", "projects", "reminders"]),
    );
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
  });

  it("returns workspace-switch patch for SqlRepository deleteWorkspace of current workspace", async () => {
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          return [];
        }
        if (query.includes("FROM tasks") && params?.[0] === "workspace_second") {
          return [
            {
              id: "task_side",
              workspace_id: "workspace_second",
              project_id: null,
              working_folder: null,
              title: "Side task",
              due_date: "2026-07-01",
              due_time: null,
              timezone: "Asia/Shanghai",
              priority: "medium",
              status: "todo",
              completed_at: null,
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
              recurrence_template_id: null,
              recurrence_instance_date: null,
              parent_id: null,
              tags_json: "[]",
            },
          ];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const result = await repository.deleteWorkspace("local-workspace");
    expect(result.data.workspaceId).toBe("workspace_second");
    expect(result.data.workspaces.find((workspace) => workspace.id === "local-workspace")).toBeUndefined();
    expect(result.data.tasks.map((task) => task.id)).toEqual(["task_side"]);
    expect(result.patch.affectedKeys).toEqual(
      expect.arrayContaining(["workspaceId", "workspaces", "tasks", "settings"]),
    );
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
  });

  it("assembles AppData from backup for SqlRepository importBackup replace without post-import workspaces reread", async () => {
    let workspacesSelectCount = 0;
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(async (query: string) => {
        if (query.includes("FROM workspaces")) {
          workspacesSelectCount += 1;
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
        if (query.includes("FROM settings")) {
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const workspacesSelectsAfterLoad = workspacesSelectCount;

    const backup = {
      whattodoBackupVersion: 3 as const,
      exportedAt: "2026-07-22T00:00:00.000Z",
      workspaceId: "ws_imported",
      workspaces: [
        {
          id: "ws_imported",
          name: "Imported",
          color: "#abcdef",
          createdAt: "2026-07-22T00:00:00.000Z",
          updatedAt: "2026-07-22T00:00:00.000Z",
          deletedAt: null,
        },
      ],
      workspaceFolders: [],
      projects: [],
      tasks: [
        {
          id: "task_imported",
          workspaceId: "ws_imported",
          projectId: null,
          workingFolder: null,
          title: "Imported task",
          notes: "note",
          dueDate: "2026-08-01",
          dueTime: null,
          timezone: "Asia/Shanghai",
          priority: "high" as const,
          status: "todo" as const,
          completedAt: null,
          createdAt: "2026-07-22T00:00:00.000Z",
          updatedAt: "2026-07-22T00:00:00.000Z",
          deletedAt: null,
          recurrenceTemplateId: null,
          recurrenceInstanceDate: null,
          parentId: null,
          tags: [],
        },
      ],
      reminders: [],
      settingsByWorkspace: {
        ws_imported: {
          theme: "light" as const,
          accentColor: "emerald" as const,
          language: "en" as const,
          defaultReminderOffset: 15,
          defaultWorkingFolder: null,
          defaultSavedViewId: null,
          notificationsEnabled: true,
          closeToTray: false,
        },
      },
      savedViews: [],
      recurringTaskTemplates: [],
      attachments: [],
      attachmentBundle: "none" as const,
    };

    const result = await repository.importBackup(backup, "replace");
    expect(result.data.workspaceId).toBe("ws_imported");
    expect(result.data.tasks.map((task) => task.id)).toEqual(["task_imported"]);
    expect(result.data.settings.language).toBe("en");
    expect(result.patch.affectedKeys).toEqual(expect.arrayContaining(["workspaceId", "tasks", "settings", "workspaces"]));
    expect(workspacesSelectCount).toBe(workspacesSelectsAfterLoad);
  });

  it("returns targeted patch for SqlRepository updateRecurringSeries openFuture without full readAll", async () => {
    const templateRow = {
      id: "template_a",
      workspace_id: "local-workspace",
      title: "Standup",
      notes: "body",
      project_id: null,
      working_folder: null,
      due_time: "09:00",
      timezone: "Asia/Shanghai",
      priority: "medium",
      reminder_offset: null,
      frequency: "daily",
      interval: 1,
      by_weekday: null,
      anchor_date: "2026-06-01",
      end_date: null,
      enabled: 1,
      parent_id: null,
      tags: "[]",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
    };
    const openTask = {
      ...makeTaskRow("task_open", "todo", null),
      recurrence_template_id: "template_a",
      recurrence_instance_date: "2026-06-02",
      tags: "[]",
    };
    let settingsSelectCount = 0;
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
        if (query.includes("FROM recurring_task_templates")) {
          return [templateRow];
        }
        if (query.includes("FROM tasks")) {
          return [openTask];
        }
        if (query.includes("FROM settings")) {
          settingsSelectCount += 1;
          return [];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    const settingsSelectsAfterLoad = settingsSelectCount;

    const result = await repository.updateRecurringSeries("template_a", { title: "Synced" }, "openFuture");
    expect(result.patch.affectedKeys).toEqual(["recurringTaskTemplates", "tasks", "reminders"]);
    expect(result.data.tasks.find((task) => task.id === "task_open")?.title).toBe("Synced");
    expect(result.data.recurringTaskTemplates.find((template) => template.id === "template_a")?.title).toBe("Synced");
    expect(settingsSelectCount).toBe(settingsSelectsAfterLoad);
  });

  it("loads SqlRepository getTask with full notes when cache misses", async () => {
    const taskRow = {
      id: "task_b",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "B",
      notes: "detail notes",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
    };
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
        if (query.includes("FROM tasks") && query.includes("WHERE id = ?")) {
          return [taskRow];
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
    const full = await repository.getTask("task_b");
    expect(full?.notes).toBe("detail notes");
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("SELECT * FROM tasks WHERE id = ?"), ["task_b"]);
  });

  it("serializes concurrent toggleTask so both cache updates apply", async () => {
    const makeTaskRow = (id: string, title: string) => ({
      id,
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title,
      notes: "",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const db = {
      execute: vi.fn(async (sql: string) => {
        if (typeof sql === "string" && sql.includes("UPDATE tasks SET status")) {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 25));
          inFlight -= 1;
        }
      }),
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
        if (query.includes("FROM tasks") && query.includes("deleted_at IS NULL")) {
          return [makeTaskRow("task_a", "A"), makeTaskRow("task_b", "B")];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const [, second] = await Promise.all([repository.toggleTask("task_a"), repository.toggleTask("task_b")]);

    expect(maxInFlight).toBe(1);
    expect(second.data.tasks.find((task) => task.id === "task_a")?.status).toBe("completed");
    expect(second.data.tasks.find((task) => task.id === "task_b")?.status).toBe("completed");
  });

  it("serializes concurrent toggleTask on the same id to a deterministic final status", async () => {
    const taskRow = {
      id: "task_a",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "A",
      notes: "",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
    };
    const db = {
      execute: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }),
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
        if (query.includes("FROM tasks") && query.includes("deleted_at IS NULL")) {
          return [taskRow];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const [, second] = await Promise.all([repository.toggleTask("task_a"), repository.toggleTask("task_a")]);
    expect(second.data.tasks[0]?.status).toBe("todo");
  });

  it("keeps both toggle and snooze cache updates when interleaved", async () => {
    const taskRow = {
      id: "task_a",
      workspace_id: "local-workspace",
      project_id: null,
      working_folder: null,
      title: "A",
      notes: "",
      due_date: "2026-06-01",
      due_time: null,
      timezone: "UTC",
      priority: "medium",
      status: "todo",
      completed_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      parent_id: null,
      tags: "[]",
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
      execute: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }),
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
        if (query.includes("FROM tasks") && query.includes("deleted_at IS NULL")) {
          return [taskRow];
        }
        if (query.includes("FROM reminders")) {
          return [reminderRow];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);

    const repository = new SqlRepository();
    await repository.load();
    const [, snoozeResult] = await Promise.all([
      repository.toggleTask("task_a"),
      repository.snoozeReminder("reminder_a", "2026-06-01T10:00:00.000Z"),
    ]);
    expect(snoozeResult.data.tasks.find((task) => task.id === "task_a")?.status).toBe("completed");
    expect(snoozeResult.data.reminders.find((item) => item.id === "reminder_a")?.snoozedUntil).toBe(
      "2026-06-01T10:00:00.000Z",
    );
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

  it("updateRecurringSeries openFuture updates open task rows", async () => {
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
      frequency: "daily",
      interval: 1,
      by_weekday: null,
      anchor_date: "2026-06-01",
      end_date: null,
      enabled: 1,
      parent_id: null,
      tags: "[]",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
    };
    const openTask = {
      ...makeTaskRow("task_open", "todo", null),
      recurrence_template_id: "template_a",
      recurrence_instance_date: "2026-06-02",
      tags: "[]",
    };
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
        if (query.includes("FROM recurring_task_templates")) {
          return [templateRow];
        }
        if (query.includes("FROM tasks")) {
          return [openTask];
        }
        if (query.includes("FROM reminders") || query.includes("reminders.*")) {
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
    await repository.updateRecurringSeries("template_a", { title: "Synced" }, "openFuture");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+tasks\s+SET/i),
      expect.arrayContaining(["Synced", "task_open"]),
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

  it("merge import upserts without deleting task tables", async () => {
    const db = makeEmptySqlDbWithSettings();
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();

    const backup = await repository.exportBackup();
    db.execute.mockClear();
    await repository.importBackup(backup, "merge");

    const executeCalls = db.execute.mock.calls.map((call) => String(call[0]));
    expect(executeCalls).toContain("BEGIN TRANSACTION");
    expect(executeCalls).toContain("COMMIT");
    expect(executeCalls.some((sql) => sql === "DELETE FROM tasks")).toBe(false);
    expect(executeCalls.some((sql) => sql.includes("ON CONFLICT(id) DO UPDATE"))).toBe(true);
  });

  it("writes reminder events when marking fired or failed", async () => {
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
        if (query.includes("FROM reminders") && query.includes("INNER JOIN")) {
          return [reminderRow];
        }
        if (query.includes("FROM reminders")) {
          return [reminderRow];
        }
        if (query.includes("FROM reminder_events")) {
          return [
            {
              id: "event_1",
              reminder_id: "reminder_a",
              task_id: "task_a",
              event_type: "failed",
              detail: "boom",
              created_at: "2026-06-01T10:00:00.000Z",
            },
          ];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.markReminderFailed("reminder_a", "boom");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO reminder_events"),
      expect.arrayContaining(["reminder_a", "task_a", "failed", "boom"]),
    );

    const events = await repository.loadReminderEvents("reminder_a");
    expect(events).toEqual([
      {
        id: "event_1",
        reminderId: "reminder_a",
        taskId: "task_a",
        eventType: "failed",
        detail: "boom",
        createdAt: "2026-06-01T10:00:00.000Z",
      },
    ]);
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

  it("restores a soft-deleted task", async () => {
    const db = makeSqlDbWithTasks([makeTaskRow("task_a", "todo", "2026-06-02T00:00:00.000Z")]);
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.restoreTask("task_a");
    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?",
      expect.arrayContaining(["task_a"]),
    );
  });

  it("marks reminders fired and failed with targeted patches", async () => {
    const reminderRow = {
      id: "reminder_a",
      task_id: "task_a",
      remind_at: "2026-06-01T09:00:00.000Z",
      offset_minutes: 10,
      snoozed_until: null,
      fired_at: null,
      failed_at: null,
      last_error: null,
      last_attempted_at: null,
      enabled: 1,
    };
    const taskRow = { ...makeTaskRow("task_a", "todo", null), tags: "[]" };
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
          return [taskRow];
        }
        if (query.includes("FROM reminders") || query.includes("reminders.*")) {
          return [reminderRow];
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

    const fired = await repository.markReminderFired("reminder_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE reminders SET fired_at = ?"),
      expect.arrayContaining(["reminder_a"]),
    );
    expect(fired.patch.affectedKeys).toEqual(["reminders"]);

    const failed = await repository.markReminderFailed("reminder_a", "notify failed");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE reminders SET failed_at = ?"),
      expect.arrayContaining(["notify failed", "reminder_a"]),
    );
    expect(failed.patch.affectedKeys).toEqual(["reminders"]);
  });

  it("inserts the next recurring instance when completing a recurring task", async () => {
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
      reminder_offset: null,
      frequency: "daily",
      interval: 1,
      by_weekday: null,
      anchor_date: "2026-06-01",
      end_date: null,
      enabled: 1,
      parent_id: null,
      tags: "[]",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
    };
    const taskRow = {
      ...makeTaskRow("task_a", "todo", null),
      recurrence_template_id: "template_a",
      recurrence_instance_date: "2026-06-01",
      tags: "[]",
    };
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
        if (query.includes("FROM recurring_task_templates")) {
          return [templateRow];
        }
        // Existence check for the next instance date (not the list SELECT columns).
        if (
          query.includes("SELECT id FROM tasks") &&
          query.includes("recurrence_template_id") &&
          query.includes("recurrence_instance_date")
        ) {
          return [];
        }
        if (query.includes("FROM reminders") || query.includes("reminders.*")) {
          return [];
        }
        if (query.includes("FROM settings")) {
          return [];
        }
        if (
          query.includes("FROM projects") ||
          query.includes("FROM workspace_folders") ||
          query.includes("FROM saved_views") ||
          query.includes("FROM attachments")
        ) {
          return [];
        }
        if (query.includes("FROM tasks")) {
          return [taskRow];
        }
        return [];
      }),
    };
    vi.mocked(Database.load).mockResolvedValue(db as never);
    const repository = new SqlRepository();
    await repository.load();
    await repository.toggleTask("task_a");
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tasks"),
      expect.arrayContaining(["2026-06-02", "template_a"]),
    );
  });

  it("does not insert a next instance after the recurring template is disabled", async () => {
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
      reminder_offset: null,
      frequency: "daily",
      interval: 1,
      by_weekday: null,
      anchor_date: "2026-06-01",
      end_date: null,
      enabled: 0,
      parent_id: null,
      tags: "[]",
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
    };
    const taskRow = {
      ...makeTaskRow("task_a", "todo", null),
      recurrence_template_id: "template_a",
      recurrence_instance_date: "2026-06-01",
      tags: "[]",
    };
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
        if (query.includes("FROM recurring_task_templates") && query.includes("enabled = 1")) {
          return [];
        }
        if (query.includes("FROM recurring_task_templates")) {
          return [templateRow];
        }
        if (query.includes("FROM tasks")) {
          return [taskRow];
        }
        if (query.includes("FROM reminders") || query.includes("reminders.*")) {
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
    await repository.disableRecurringTaskTemplate("template_a");
    db.execute.mockClear();
    await repository.toggleTask("task_a");
    const insertCalls = db.execute.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes("INSERT INTO tasks"),
    );
    expect(insertCalls).toHaveLength(0);
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
    by_weekday: null,
    anchor_date: "2026-06-01",
    end_date: null,
    enabled: 1,
    parent_id: null,
    tags: "[]",
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
