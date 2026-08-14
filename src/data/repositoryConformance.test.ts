/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemorySqliteClient } from "./nodeSqliteClient";
import type { TodoRepository } from "./repositoryContract";
import { LocalRepository, SqlRepository } from "./repository";
import { setSqliteClientForTests } from "./sqliteClient";
import type { BackupPayload } from "./types";

type CaseRunner = (createRepo: () => Promise<TodoRepository>) => void;

const runAgainstBoth = (name: string, run: CaseRunner) => {
  describe(`${name} (LocalRepository)`, () => {
    beforeEach(() => {
      localStorage.clear();
    });
    run(async () => {
      const repository = new LocalRepository();
      await repository.load();
      return repository;
    });
  });

  describe(`${name} (SqlRepository)`, () => {
    afterEach(() => {
      setSqliteClientForTests(null);
    });
    run(async () => {
      setSqliteClientForTests(createMemorySqliteClient());
      const repository = new SqlRepository();
      await repository.load();
      return repository;
    });
  });
};

describe("repository conformance", () => {
  runAgainstBoth("create/update/delete/toggle task", (createRepo) => {
    it("creates a task without notes in list snapshots and getTask can still load detail shape", async () => {
      const repository = await createRepo();
      const created = await repository.createTask({ title: "Conformance task", dueDate: "2026-06-01", notes: "secret" });
      expect(created.patch.affectedKeys).toEqual(expect.arrayContaining(["tasks"]));
      const listTask = created.data.tasks.find((task) => task.title === "Conformance task");
      expect(listTask).toBeDefined();
      expect(listTask && "notes" in listTask).toBe(false);

      const detail = await repository.getTask(listTask!.id);
      expect(detail?.notes).toBe("secret");
    });

    it("updates dueDate and toggles completion", async () => {
      const repository = await createRepo();
      const created = await repository.createTask({ title: "Toggle me", dueDate: "2026-06-01" });
      const taskId = created.data.tasks[0].id;

      const updated = await repository.updateTask(taskId, { dueDate: "2026-06-02" });
      expect(updated.data.tasks.find((task) => task.id === taskId)?.dueDate).toBe("2026-06-02");
      expect(updated.patch.affectedKeys).toEqual(expect.arrayContaining(["tasks"]));

      const toggled = await repository.toggleTask(taskId);
      expect(toggled.data.tasks.find((task) => task.id === taskId)?.status).toBe("completed");
    });

    it("deletes a task from the active list", async () => {
      const repository = await createRepo();
      const created = await repository.createTask({ title: "Delete me", dueDate: "2026-06-01" });
      const taskId = created.data.tasks[0].id;
      const deleted = await repository.deleteTask(taskId);
      expect(deleted.data.tasks.find((task) => task.id === taskId)).toBeUndefined();
      expect(deleted.patch.affectedKeys).toEqual(expect.arrayContaining(["tasks"]));
    });
  });

  runAgainstBoth("settings / project / saved view / bulk", (createRepo) => {
    it("saveSettings patches theme without requiring tasks reload semantics", async () => {
      const repository = await createRepo();
      const before = await repository.load();
      const result = await repository.saveSettings({ ...before.settings, theme: "dark" });
      expect(result.data.settings.theme).toBe("dark");
      expect(result.patch.affectedKeys).toEqual(expect.arrayContaining(["settings"]));
    });

    it("createProject appears in projects slice", async () => {
      const repository = await createRepo();
      const result = await repository.createProject({ name: "Alpha", color: "#4fb8d8" });
      expect(result.data.projects.some((project) => project.name === "Alpha")).toBe(true);
      expect(result.patch.affectedKeys).toEqual(expect.arrayContaining(["projects"]));
    });

    it("createSavedView and updateSavedView round-trip", async () => {
      const repository = await createRepo();
      const filters = {
        scope: "open" as const,
        priority: "all" as const,
        projectId: "all",
        reminder: "all" as const,
        folder: "all" as const,
        dateRange: "all" as const,
        tags: [] as string[],
        tagMatch: "any" as const,
        advancedFilter: null,
      };
      const created = await repository.createSavedView({ name: "Open", filters });
      const viewId = created.data.savedViews.find((view) => view.name === "Open")?.id;
      expect(viewId).toBeDefined();
      expect(created.patch.affectedKeys).toEqual(expect.arrayContaining(["savedViews"]));

      const updated = await repository.updateSavedView(viewId!, { name: "Open renamed", filters });
      expect(updated.data.savedViews.find((view) => view.id === viewId)?.name).toBe("Open renamed");
    });

    it("bulkDeleteTasks removes multiple tasks", async () => {
      const repository = await createRepo();
      const first = await repository.createTask({ title: "A", dueDate: "2026-06-01" });
      const second = await repository.createTask({ title: "B", dueDate: "2026-06-01" });
      const ids = [first.data.tasks.find((t) => t.title === "A")!.id, second.data.tasks.find((t) => t.title === "B")!.id];
      const deleted = await repository.bulkDeleteTasks(ids);
      expect(deleted.data.tasks.find((task) => ids.includes(task.id))).toBeUndefined();
      expect(deleted.patch.affectedKeys).toEqual(expect.arrayContaining(["tasks"]));
    });
  });

  runAgainstBoth("folder / workspace update / recurring", (createRepo) => {
    it("createWorkspaceFolder patches workspaceFolders exactly", async () => {
      const repository = await createRepo();
      const result = await repository.createWorkspaceFolder({ name: "Docs", path: "D:\\Docs" });
      expect(result.data.workspaceFolders.some((folder) => folder.name === "Docs")).toBe(true);
      expect(result.patch.affectedKeys).toEqual(["workspaceFolders"]);
    });

    it("updateWorkspace renames without full patch", async () => {
      const repository = await createRepo();
      const loaded = await repository.load();
      const result = await repository.updateWorkspace(loaded.workspaceId, { name: "Renamed", color: "#6cc083" });
      expect(result.data.workspaces.find((workspace) => workspace.id === loaded.workspaceId)?.name).toBe("Renamed");
      expect(result.patch.affectedKeys).toEqual(["workspaces"]);
    });

    it("createRecurringTask then update and disable template", async () => {
      const repository = await createRepo();
      const created = await repository.createRecurringTask({
        title: "Standup",
        dueDate: "2026-06-01",
        frequency: "daily",
        interval: 1,
        reminderOffset: null,
      });
      expect(created.patch.affectedKeys).toEqual(
        expect.arrayContaining(["recurringTaskTemplates", "tasks"]),
      );
      expect(created.patch.affectedKeys).not.toContain("settings");
      const templateId = created.data.recurringTaskTemplates.find((template) => template.title === "Standup")?.id;
      expect(templateId).toBeDefined();

      const updated = await repository.updateRecurringTaskTemplate(templateId!, { title: "Daily standup" });
      expect(updated.data.recurringTaskTemplates.find((template) => template.id === templateId)?.title).toBe(
        "Daily standup",
      );
      expect(updated.patch.affectedKeys).toEqual(["recurringTaskTemplates"]);

      const viaSeries = await repository.updateRecurringSeries(templateId!, { title: "Team standup" }, "template");
      expect(viaSeries.data.recurringTaskTemplates.find((template) => template.id === templateId)?.title).toBe(
        "Team standup",
      );
      expect(viaSeries.patch.affectedKeys).toEqual(["recurringTaskTemplates"]);

      const disabled = await repository.disableRecurringTaskTemplate(templateId!);
      expect(disabled.data.recurringTaskTemplates.find((template) => template.id === templateId)?.enabled).toBe(false);
      expect(disabled.patch.affectedKeys).toEqual(["recurringTaskTemplates"]);
    });
  });

  runAgainstBoth("workspace create/delete / openFuture", (createRepo) => {
    it("createWorkspace switches context and shows empty task list", async () => {
      const repository = await createRepo();
      await repository.createTask({ title: "Stay behind", dueDate: "2026-06-01" });
      const result = await repository.createWorkspace({ name: "Extra", color: "#6cc083" });
      expect(result.data.workspaceId).not.toBe("local-workspace");
      expect(result.data.tasks).toEqual([]);
      expect(result.patch.affectedKeys).toEqual(expect.arrayContaining(["workspaceId", "workspaces"]));
      expect(result.data.workspaces.some((workspace) => workspace.name === "Extra")).toBe(true);
    });

    it("deleteWorkspace of non-current workspace removes it from active list", async () => {
      const repository = await createRepo();
      const loaded = await repository.load();
      const originalId = loaded.workspaceId;
      const created = await repository.createWorkspace({ name: "Side", color: "#ec6f5d" });
      expect(created.data.workspaceId).not.toBe(originalId);

      const deleted = await repository.deleteWorkspace(originalId);
      expect(deleted.data.workspaces.find((workspace) => workspace.id === originalId)).toBeUndefined();
      expect(deleted.patch.affectedKeys).toEqual(expect.arrayContaining(["workspaces"]));
      expect(deleted.data.workspaceId).toBe(created.data.workspaceId);
    });

    it("updateRecurringSeries openFuture syncs open instance titles", async () => {
      const repository = await createRepo();
      const created = await repository.createRecurringTask({
        title: "Standup",
        dueDate: "2026-06-01",
        frequency: "daily",
        interval: 1,
        reminderOffset: null,
      });
      const templateId = created.data.recurringTaskTemplates.find((template) => template.title === "Standup")?.id;
      const openTaskId = created.data.tasks.find((task) => task.recurrenceTemplateId === templateId)?.id;
      expect(templateId).toBeDefined();
      expect(openTaskId).toBeDefined();

      const synced = await repository.updateRecurringSeries(templateId!, { title: "Synced standup" }, "openFuture");
      expect(synced.data.tasks.find((task) => task.id === openTaskId)?.title).toBe("Synced standup");
      expect(synced.data.recurringTaskTemplates.find((template) => template.id === templateId)?.title).toBe(
        "Synced standup",
      );
      expect(synced.patch.affectedKeys).toEqual(expect.arrayContaining(["recurringTaskTemplates", "tasks"]));
    });
  });

  runAgainstBoth("recurring completion / backup / reminders / recovery", (createRepo) => {
    it("completing a recurring task creates the next instance", async () => {
      const repository = await createRepo();
      const created = await repository.createRecurringTask({
        title: "Daily standup",
        dueDate: "2026-06-01",
        frequency: "daily",
        interval: 1,
        reminderOffset: null,
      });
      const templateId = created.data.recurringTaskTemplates[0]?.id;
      const openTask = created.data.tasks.find((task) => task.recurrenceTemplateId === templateId);
      expect(openTask).toBeDefined();

      const completed = await repository.toggleTask(openTask!.id);
      expect(completed.data.tasks.find((task) => task.id === openTask!.id)?.status).toBe("completed");
      const next = completed.data.tasks.find(
        (task) => task.recurrenceTemplateId === templateId && task.id !== openTask!.id,
      );
      expect(next?.recurrenceInstanceDate).toBe("2026-06-02");
    });

    it("disabled recurring template does not spawn a next instance on complete", async () => {
      const repository = await createRepo();
      const created = await repository.createRecurringTask({
        title: "Paused series",
        dueDate: "2026-06-01",
        frequency: "daily",
        interval: 1,
        reminderOffset: null,
      });
      const templateId = created.data.recurringTaskTemplates[0]?.id;
      const openTaskId = created.data.tasks.find((task) => task.recurrenceTemplateId === templateId)?.id;
      await repository.disableRecurringTaskTemplate(templateId!);
      const completed = await repository.toggleTask(openTaskId!);
      expect(
        completed.data.tasks.filter(
          (task) => task.recurrenceTemplateId === templateId && task.status !== "completed",
        ),
      ).toHaveLength(0);
    });

    it("updateRecurringSeries template mode leaves open instance titles unchanged", async () => {
      const repository = await createRepo();
      const created = await repository.createRecurringTask({
        title: "Original",
        dueDate: "2026-06-01",
        frequency: "daily",
        interval: 1,
        reminderOffset: null,
      });
      const templateId = created.data.recurringTaskTemplates[0]?.id;
      const openTaskId = created.data.tasks.find((task) => task.recurrenceTemplateId === templateId)?.id;
      const updated = await repository.updateRecurringSeries(templateId!, { title: "Template only" }, "template");
      expect(updated.data.recurringTaskTemplates.find((template) => template.id === templateId)?.title).toBe(
        "Template only",
      );
      expect(updated.data.tasks.find((task) => task.id === openTaskId)?.title).toBe("Original");
    });

    it("importBackup replace round-trips tasks and settings", async () => {
      const repository = await createRepo();
      await repository.createTask({ title: "Seed", dueDate: "2026-06-01" });
      const backup = await repository.exportBackup();
      const restored = await repository.importBackup(backup, "replace");
      expect(restored.data.tasks.some((task) => task.title === "Seed")).toBe(true);
      expect(restored.data.settings).toBeDefined();
    });

    it("importBackup strips unmanaged attachment paths and keeps managed ones", async () => {
      const repository = await createRepo();
      await repository.createTask({ title: "Has file", dueDate: "2026-06-01" });
      const loaded = await repository.load();
      const taskId = loaded.tasks.find((task) => task.title === "Has file")!.id;
      const exported = await repository.exportBackup();
      expect(exported.whattodoBackupVersion).not.toBe(1);
      const backup = {
        ...exported,
        attachments: [
          {
            id: "att_evil",
            task_id: taskId,
            filename: "payload.exe",
            path: String.raw`C:\Windows\System32\calc.exe`,
            mimeType: null,
            size: null,
            createdAt: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "att_ok",
            task_id: taskId,
            filename: "notes.pdf",
            path: "/app/data/attachments/att_ok/notes.pdf",
            mimeType: "application/pdf",
            size: 12,
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      } as BackupPayload;
      const restored = await repository.importBackup(backup, "replace");
      expect(restored.data.attachments.find((item) => item.id === "att_evil")?.path).toBe("");
      expect(restored.data.attachments.find((item) => item.id === "att_ok")?.filename).toBe("notes.pdf");
      expect(restored.data.attachments.find((item) => item.id === "att_ok")?.path).toBe(
        "/app/data/attachments/att_ok/notes.pdf",
      );
    });

    it("importBackup merge keeps local-only tasks", async () => {
      const repository = await createRepo();
      await repository.createTask({ title: "Keep me", dueDate: "2026-06-01" });
      const other = new LocalRepository();
      await other.load();
      await other.createTask({ title: "From backup", dueDate: "2026-06-02" });
      const backup = await other.exportBackup();
      const merged = await repository.importBackup(backup, "merge");
      expect(merged.data.tasks.some((task) => task.title === "Keep me")).toBe(true);
      expect(merged.data.tasks.some((task) => task.title === "From backup")).toBe(true);
    });

    it("imports v1 backups without recurring templates", async () => {
      const repository = await createRepo();
      const loaded = await repository.load();
      const legacy = await repository.importBackup({
        whattodoBackupVersion: 1,
        exportedAt: "2026-06-01T00:00:00.000Z",
        workspaceId: loaded.workspaceId,
        workspaces: loaded.workspaces,
        workspaceFolders: [],
        projects: [],
        tasks: [],
        reminders: [],
        settingsByWorkspace: { [loaded.workspaceId]: loaded.settings },
        savedViews: [],
      });
      expect(legacy.data.recurringTaskTemplates).toEqual([]);
    });

    it("markReminderFailed then snoozeReminder clears failure state", async () => {
      const repository = await createRepo();
      const created = await repository.createTask({
        title: "Remind me",
        dueDate: "2026-06-01",
        dueTime: "09:00",
        reminderOffset: 0,
      });
      const reminderId = created.data.reminders[0]?.id;
      expect(reminderId).toBeDefined();
      const failed = await repository.markReminderFailed(reminderId!, "boom");
      expect(failed.data.reminders.find((reminder) => reminder.id === reminderId)?.failedAt).toBeTruthy();
      expect(failed.data.reminders.find((reminder) => reminder.id === reminderId)?.lastError).toBe("boom");
      const snoozed = await repository.snoozeReminder(reminderId!, "2026-06-01T10:00:00.000Z");
      expect(snoozed.data.reminders.find((reminder) => reminder.id === reminderId)?.failedAt).toBeNull();
      expect(snoozed.data.reminders.find((reminder) => reminder.id === reminderId)?.lastError).toBeNull();
    });

    it("loadTaskPage filters by priority", async () => {
      const repository = await createRepo();
      await repository.createTask({ title: "High", dueDate: "2026-06-01", priority: "high" });
      await repository.createTask({ title: "Low", dueDate: "2026-06-01", priority: "low" });
      const page = await repository.loadTaskPage({
        workspaceId: (await repository.load()).workspaceId,
        scope: "open",
        sort: "overview",
        priority: "high",
        limit: 20,
        offset: 0,
      });
      expect(page.tasks.every((task) => task.priority === "high")).toBe(true);
      expect(page.total).toBeGreaterThanOrEqual(1);
    });

    it("loadAvailableTasks returns tasks from other workspaces", async () => {
      const repository = await createRepo();
      const first = await repository.load();
      await repository.createTask({ title: "Home task", dueDate: "2026-06-01" });
      const side = await repository.createWorkspace({ name: "Side", color: "#ec6f5d" });
      await repository.createTask({ title: "Side task", dueDate: "2026-06-02" });
      await repository.selectWorkspace(first.workspaceId);
      const available = await repository.loadAvailableTasks(first.workspaceId);
      expect(available.some((task) => task.title === "Side task")).toBe(true);
      expect(available.every((task) => task.workspaceId !== first.workspaceId)).toBe(true);
      expect(side.data.workspaceId).not.toBe(first.workspaceId);
    });

    it("loadTaskPage workspaceScope all returns tasks from multiple workspaces", async () => {
      const repository = await createRepo();
      const first = await repository.load();
      await repository.createTask({ title: "Alpha unique", dueDate: "2026-06-01" });
      await repository.createWorkspace({ name: "Other", color: "#6cc083" });
      await repository.createTask({ title: "Beta unique", dueDate: "2026-06-02" });
      const page = await repository.loadTaskPage({
        workspaceId: first.workspaceId,
        workspaceScope: "all",
        scope: "all",
        sort: "overview",
        limit: 50,
        offset: 0,
      });
      expect(page.tasks.some((task) => task.title === "Alpha unique")).toBe(true);
      expect(page.tasks.some((task) => task.title === "Beta unique")).toBe(true);
    });

    it("deleteTask then restoreTask returns the task to the active list", async () => {
      const repository = await createRepo();
      const created = await repository.createTask({ title: "Recover me", dueDate: "2026-06-01" });
      const taskId = created.data.tasks.find((task) => task.title === "Recover me")?.id;
      await repository.deleteTask(taskId!);
      expect((await repository.load()).tasks.find((task) => task.id === taskId)).toBeUndefined();
      const recovery = await repository.loadRecoveryItems();
      expect(recovery.deletedTasks.some((task) => task.id === taskId)).toBe(true);
      await repository.restoreTask(taskId!);
      expect((await repository.load()).tasks.some((task) => task.id === taskId)).toBe(true);
    });

    it("deleteWorkspace then restoreWorkspace recovers the workspace", async () => {
      const repository = await createRepo();
      const original = await repository.load();
      const created = await repository.createWorkspace({ name: "Temp", color: "#abcdef" });
      const tempId = created.data.workspaceId;
      await repository.selectWorkspace(original.workspaceId);
      await repository.deleteWorkspace(tempId);
      const recovery = await repository.loadRecoveryItems();
      expect(recovery.deletedWorkspaces.some((workspace) => workspace.id === tempId)).toBe(true);
      await repository.restoreWorkspace(tempId);
      expect((await repository.load()).workspaces.some((workspace) => workspace.id === tempId)).toBe(true);
    });

    it("loadDueReminders returns due items from other workspaces", async () => {
      const repository = await createRepo();
      const first = await repository.load();
      await repository.createTask({
        title: "Workspace A reminder",
        dueDate: "2026-06-01",
        dueTime: "09:00",
        reminderOffset: 0,
      });
      await repository.createWorkspace({ name: "Other", color: "#6cc083" });
      await repository.createTask({
        title: "Workspace B reminder",
        dueDate: "2026-06-01",
        dueTime: "10:00",
        reminderOffset: 0,
      });
      await repository.selectWorkspace(first.workspaceId);
      const due = await repository.loadDueReminders("2026-06-01T12:00:00.000Z");
      expect(due.map((item) => item.task.title).sort()).toEqual([
        "Workspace A reminder",
        "Workspace B reminder",
      ]);
    });

    it("loadTaskPage paginates without dropping earlier rows", async () => {
      const repository = await createRepo();
      for (let index = 0; index < 5; index += 1) {
        await repository.createTask({ title: `Page task ${index}`, dueDate: "2026-06-01" });
      }
      const loaded = await repository.load();
      const first = await repository.loadTaskPage({
        workspaceId: loaded.workspaceId,
        scope: "open",
        sort: "overview",
        limit: 2,
        offset: 0,
      });
      const second = await repository.loadTaskPage({
        workspaceId: loaded.workspaceId,
        scope: "open",
        sort: "overview",
        limit: 2,
        offset: 2,
      });
      expect(first.tasks).toHaveLength(2);
      expect(second.tasks).toHaveLength(2);
      expect(first.total).toBeGreaterThanOrEqual(5);
      const ids = [...first.tasks, ...second.tasks].map((task) => task.id);
      expect(new Set(ids).size).toBe(4);
    });
  });
});

describe("SqlRepository real SQLite rollback", () => {
  afterEach(() => {
    setSqliteClientForTests(null);
  });

  it("importBackup replace rolls back when a later insert fails", async () => {
    setSqliteClientForTests(createMemorySqliteClient());
    const repository = new SqlRepository();
    await repository.load();
    await repository.createTask({ title: "Keep after rollback", dueDate: "2026-06-01" });
    const backup = await repository.exportBackup();
    const seed = backup.tasks[0];
    if (!seed) {
      throw new Error("expected a seed task in the backup");
    }
    backup.tasks.push({
      ...seed,
      id: "task_missing_project",
      title: "Broken import",
      projectId: "project_does_not_exist",
    });
    await expect(repository.importBackup(backup, "replace")).rejects.toThrow();
    const loaded = await repository.load();
    expect(loaded.tasks.some((task) => task.title === "Keep after rollback")).toBe(true);
    expect(loaded.tasks.some((task) => task.title === "Broken import")).toBe(false);
  });
});
