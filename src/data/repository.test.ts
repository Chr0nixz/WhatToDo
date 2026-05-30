import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "@tauri-apps/plugin-sql";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(),
  },
}));

import { buildReminderDate } from "./date";
import { LocalRepository, SqlRepository } from "./repository";

describe("LocalRepository", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps each reminder offset when task due time changes after default reminder changes", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = await repository.createTask({
      title: "Offset task",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      reminderOffset: 60,
    });
    const task = data.tasks[0];
    expect(data.reminders[0].offsetMinutes).toBe(60);

    await repository.saveSettings({ ...data.settings, defaultReminderOffset: 5 });
    data = await repository.updateTask(task.id, { dueTime: "11:00" });

    expect(data.reminders[0].remindAt).toBe(buildReminderDate({ dueDate: "2026-06-01", dueTime: "11:00" }, 60));
  });

  it("soft deletes and restores tasks and workspace folders", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = await repository.createTask({ title: "Delete me", dueDate: "2026-06-01" });
    const taskId = data.tasks[0].id;
    data = await repository.deleteTask(taskId);
    expect(data.tasks.find((task) => task.id === taskId)).toBeUndefined();
    expect(data.deletedTasks.find((task) => task.id === taskId)?.title).toBe("Delete me");

    data = await repository.restoreTask(taskId);
    expect(data.tasks.find((task) => task.id === taskId)?.title).toBe("Delete me");

    data = await repository.createWorkspaceFolder({ name: "Docs", path: "D:\\Docs" });
    const folderId = data.workspaceFolders[0].id;
    data = await repository.deleteWorkspaceFolder(folderId);
    expect(data.workspaceFolders.find((folder) => folder.id === folderId)).toBeUndefined();
    expect(data.deletedWorkspaceFolders.find((folder) => folder.id === folderId)?.name).toBe("Docs");

    data = await repository.restoreWorkspaceFolder(folderId);
    expect(data.workspaceFolders.find((folder) => folder.id === folderId)?.name).toBe("Docs");
  });

  it("keeps current workspace tasks separate from available tasks", async () => {
    const repository = new LocalRepository();
    await repository.load();

    let data = await repository.createTask({ title: "Default task", dueDate: "2026-06-01" });
    const defaultTaskId = data.tasks[0].id;
    data = await repository.createWorkspace({ name: "Side workspace", color: "#4fb8d8" });

    expect(data.tasks).toEqual([]);
    expect(data.availableTasks.map((task) => task.id)).toContain(defaultTaskId);
  });

  it("snoozes and disables reminders", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = await repository.createTask({
      title: "Reminder task",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      reminderOffset: 30,
    });
    const reminderId = data.reminders[0].id;

    data = await repository.markReminderFired(reminderId);
    expect(data.reminders[0].firedAt).not.toBeNull();

    data = await repository.snoozeReminder(reminderId, "2026-06-01T09:45:00.000Z");
    expect(data.reminders[0].snoozedUntil).toBe("2026-06-01T09:45:00.000Z");
    expect(data.reminders[0].firedAt).toBeNull();

    data = await repository.disableReminder(reminderId);
    expect(data.reminders[0].enabled).toBe(false);
  });

  it("stores saved views and imports exported backups", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = await repository.createSavedView({
      name: "High priority",
      filters: {
        scope: "open",
        priority: "high",
        projectId: "all",
        reminder: "all",
        folder: "all",
        dateRange: "week",
      },
    });
    expect(data.savedViews[0].name).toBe("High priority");

    const backup = await repository.exportBackup();
    const restoredRepository = new LocalRepository();
    const restored = await restoredRepository.importBackup(backup);

    expect(restored.savedViews[0].filters.priority).toBe("high");
    expect(restored.workspaceId).toBe(data.workspaceId);
  });

  it("creates recurring tasks with a template and first instance", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();

    data = await repository.createRecurringTask({
      title: "Daily review",
      dueDate: "2026-06-01",
      dueTime: "09:00",
      frequency: "daily",
      endDate: "2026-06-05",
      reminderOffset: 15,
    });

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
    data = await repository.createRecurringTask({
      title: "Weekly sync",
      dueDate: "2026-06-01",
      frequency: "weekly",
      reminderOffset: 30,
    });
    const firstTaskId = data.tasks[0].id;

    data = await repository.toggleTask(firstTaskId);
    expect(data.tasks.map((task) => task.dueDate).sort()).toEqual(["2026-06-01", "2026-06-08"]);
    expect(data.reminders).toHaveLength(2);

    data = await repository.toggleTask(firstTaskId);
    data = await repository.toggleTask(firstTaskId);
    expect(data.tasks.filter((task) => task.dueDate === "2026-06-08")).toHaveLength(1);
  });

  it("does not generate future instances after a template is disabled or past end date", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = await repository.createRecurringTask({
      title: "Ends tomorrow",
      dueDate: "2026-06-01",
      frequency: "daily",
      endDate: "2026-06-01",
    });
    data = await repository.toggleTask(data.tasks[0].id);
    expect(data.tasks).toHaveLength(1);

    data = await repository.createRecurringTask({
      title: "Disabled",
      dueDate: "2026-06-02",
      frequency: "daily",
    });
    const disabledTaskId = data.tasks[0].id;
    data = await repository.disableRecurringTaskTemplate(data.recurringTaskTemplates[0].id);
    data = await repository.toggleTask(disabledTaskId);
    expect(data.tasks.filter((task) => task.title === "Disabled")).toHaveLength(1);
  });

  it("exports version 2 backups and imports version 1 backups without recurring templates", async () => {
    const repository = new LocalRepository();
    let data = await repository.load();
    data = await repository.createRecurringTask({ title: "Monthly close", dueDate: "2026-01-31", frequency: "monthly" });

    const backup = await repository.exportBackup();
    expect(backup.whattodoBackupVersion).toBe(2);
    expect(backup.recurringTaskTemplates).toHaveLength(1);

    const legacyRepository = new LocalRepository();
    const legacy = await legacyRepository.importBackup({
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
    });

    expect(legacy.recurringTaskTemplates).toEqual([]);
    expect(legacy.tasks[0].recurrenceTemplateId).toBeNull();
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

    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE reminders SET snoozed_until = ?, fired_at = NULL, failed_at = NULL, last_error = NULL WHERE id = ?",
      ["2026-06-01T09:45:00.000Z", "reminder_a"],
    );
    expect(db.execute).toHaveBeenCalledWith("UPDATE reminders SET enabled = ? WHERE id = ?", [0, "reminder_a"]);
  });
});
