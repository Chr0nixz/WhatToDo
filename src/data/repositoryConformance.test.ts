import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "@tauri-apps/plugin-sql";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(),
  },
}));

import type { TodoRepository } from "./repositoryContract";
import { LocalRepository, SqlRepository } from "./repository";

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
    const makeDb = () => {
      const taskRows: Record<string, unknown>[] = [];
      const projectRows: Record<string, unknown>[] = [];
      const savedViewRows: Record<string, unknown>[] = [];
      const settingsRows: Record<string, unknown>[] = [];
      const attachmentRows: Record<string, unknown>[] = [];
      const folderRows: Record<string, unknown>[] = [];
      const templateRows: Record<string, unknown>[] = [];
      const reminderRows: Record<string, unknown>[] = [];
      const reminderEventRows: Record<string, unknown>[] = [];
      const workspaceRows: Record<string, unknown>[] = [
        {
          id: "local-workspace",
          name: "Default",
          color: "#4fb8d8",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          deleted_at: null,
        },
      ];

      return {
        execute: vi.fn(async (query: string, params: unknown[] = []) => {
          if (query.includes("INSERT INTO tasks")) {
            taskRows.unshift({
              id: params[0],
              workspace_id: params[1],
              project_id: params[2],
              working_folder: params[3],
              title: params[4],
              notes: params[5],
              due_date: params[6],
              due_time: params[7],
              timezone: params[8],
              priority: params[9],
              status: params[10],
              completed_at: params[11],
              created_at: params[12],
              updated_at: params[13],
              deleted_at: params[14],
              recurrence_template_id: params[15],
              recurrence_instance_date: params[16],
              parent_id: params[17],
              tags: params[18],
            });
          }
          if (query.includes("UPDATE tasks SET") && query.includes("deleted_at = NULL")) {
            const row = taskRows.find((item) => item.id === params[1]);
            if (row) {
              row.deleted_at = null;
              row.updated_at = params[0];
            }
          } else if (query.includes("UPDATE tasks SET") && query.includes("deleted_at")) {
            const idIndex = params.length - 1;
            const id = params[idIndex];
            const row = taskRows.find((item) => item.id === id);
            if (row) {
              row.deleted_at = params[0];
              row.updated_at = params[1];
            }
          }
          if (query.includes("UPDATE tasks SET status")) {
            const id = params[params.length - 1];
            const row = taskRows.find((item) => item.id === id);
            if (row) {
              row.status = params[0];
              row.completed_at = params[1];
              row.updated_at = params[2];
            }
          }
          if (query.includes("INSERT INTO projects")) {
            projectRows.unshift({
              id: params[0],
              workspace_id: params[1],
              name: params[2],
              color: params[3],
              status: params[4],
              due_date: params[5],
              working_folder: params[6],
              created_at: params[7],
              updated_at: params[8],
              archived_at: params[9],
              deleted_at: params[10],
            });
          }
          if (query.includes("INSERT INTO saved_views")) {
            savedViewRows.unshift({
              id: params[0],
              workspace_id: params[1],
              name: params[2],
              filters_json: params[3],
              pinned: params[4],
              created_at: params[5],
              updated_at: params[6],
            });
          }
          if (query.includes("UPDATE saved_views SET")) {
            const row = savedViewRows.find((item) => item.id === params[4]);
            if (row) {
              row.name = params[0];
              row.filters_json = params[1];
              row.pinned = params[2];
              row.updated_at = params[3];
            }
          }
          if (query.includes("DELETE FROM saved_views")) {
            const index = savedViewRows.findIndex((item) => item.id === params[0]);
            if (index >= 0) savedViewRows.splice(index, 1);
          }
          if (query.includes("INSERT INTO settings") || query.includes("ON CONFLICT(workspace_id)")) {
            settingsRows[0] = {
              workspace_id: params[0],
              theme: params[1],
              accent_color: params[2],
              language: params[3],
              default_reminder_offset: params[4],
              default_working_folder: params[5],
              default_saved_view_id: params[6],
              notifications_enabled: params[7],
              close_to_tray: params[8],
            };
          }
          if (query.includes("INSERT INTO workspaces")) {
            workspaceRows.unshift({
              id: params[0],
              name: params[1],
              color: params[2],
              created_at: params[3],
              updated_at: params[4],
              deleted_at: params[5] ?? null,
            });
          }
          if (query.includes("UPDATE workspaces SET deleted_at = NULL") || (query.includes("UPDATE workspaces SET") && query.includes("deleted_at = NULL"))) {
            const row = workspaceRows.find((item) => item.id === params[1]);
            if (row) {
              row.deleted_at = null;
              row.updated_at = params[0];
            }
          } else if (query.includes("UPDATE workspaces SET deleted_at")) {
            const row = workspaceRows.find((item) => item.id === params[2]);
            if (row) {
              row.deleted_at = params[0];
              row.updated_at = params[1];
            }
          }
          if (query.includes("INSERT INTO reminders")) {
            reminderRows.unshift({
              id: params[0],
              task_id: params[1],
              remind_at: params[2],
              offset_minutes: params[3],
              snoozed_until: params[4],
              fired_at: params[5],
              failed_at: params[6],
              last_error: params[7],
              last_attempted_at: params[8],
              enabled: params[9],
            });
          }
          if (query.includes("INSERT INTO reminder_events")) {
            reminderEventRows.unshift({
              id: params[0],
              reminder_id: params[1],
              task_id: params[2],
              event_type: params[3],
              detail: params[4],
              created_at: params[5],
            });
          }
          if (query.includes("UPDATE reminders SET failed_at")) {
            const row = reminderRows.find((item) => item.id === params[params.length - 1]);
            if (row) {
              row.failed_at = params[0];
              row.last_attempted_at = params[1];
              row.last_error = params[2];
            }
          }
          if (query.includes("UPDATE reminders SET snoozed_until")) {
            const row = reminderRows.find((item) => item.id === params[params.length - 1]);
            if (row) {
              row.snoozed_until = params[0];
              row.fired_at = null;
              row.failed_at = null;
              row.last_error = null;
            }
          }
          if (query.includes("UPDATE reminders SET fired_at")) {
            const row = reminderRows.find((item) => item.id === params[params.length - 1]);
            if (row) {
              row.fired_at = params[0];
              row.failed_at = null;
              row.last_error = null;
              row.last_attempted_at = params[1];
            }
          }
          if (query.startsWith("DELETE FROM")) {
            if (query.includes("reminder_events")) reminderEventRows.length = 0;
            if (query.includes("attachments")) attachmentRows.length = 0;
            if (query.includes("DELETE FROM reminders")) reminderRows.length = 0;
            if (query.includes("saved_views")) savedViewRows.length = 0;
            if (query.includes("DELETE FROM tasks")) taskRows.length = 0;
            if (query.includes("recurring_task_templates")) templateRows.length = 0;
            if (query.includes("workspace_folders")) folderRows.length = 0;
            if (query.includes("DELETE FROM projects")) projectRows.length = 0;
            if (query.includes("DELETE FROM settings")) settingsRows.length = 0;
            if (query.includes("DELETE FROM workspaces")) workspaceRows.length = 0;
          }
          if (query.includes("INSERT INTO workspace_folders")) {
            folderRows.unshift({
              id: params[0],
              workspace_id: params[1],
              name: params[2],
              path: params[3],
              created_at: params[4],
              updated_at: params[5],
              deleted_at: params[6],
            });
          }
          if (query.includes("UPDATE workspace_folders SET deleted_at")) {
            const row = folderRows.find((item) => item.id === params[2]);
            if (row) {
              row.deleted_at = params[0];
              row.updated_at = params[1];
            }
          }
          if (query.includes("UPDATE workspace_folders SET deleted_at = NULL")) {
            const row = folderRows.find((item) => item.id === params[1]);
            if (row) {
              row.deleted_at = null;
              row.updated_at = params[0];
            }
          }
          if (query.includes("UPDATE workspaces SET name")) {
            const row = workspaceRows.find((item) => item.id === params[3]);
            if (row) {
              row.name = params[0];
              row.color = params[1];
              row.updated_at = params[2];
            }
          }
          if (query.includes("INSERT INTO recurring_task_templates")) {
            templateRows.unshift({
              id: params[0],
              workspace_id: params[1],
              title: params[2],
              notes: params[3],
              project_id: params[4],
              working_folder: params[5],
              due_time: params[6],
              timezone: params[7],
              priority: params[8],
              reminder_offset: params[9],
              frequency: params[10],
              interval: params[11],
              by_weekday: params[12],
              anchor_date: params[13],
              end_date: params[14],
              enabled: params[15],
              parent_id: params[16],
              tags: params[17],
              created_at: params[18],
              updated_at: params[19],
              deleted_at: params[20],
            });
          }
          if (query.includes("UPDATE recurring_task_templates") && query.includes("enabled")) {
            const row = templateRows.find((item) => item.id === params[params.length - 1]);
            if (row) {
              if (query.includes("SET enabled")) {
                row.enabled = params[0];
                row.updated_at = params[1];
              } else {
                row.title = params[0];
                row.notes = params[1];
                row.updated_at = params[13];
              }
            }
          } else if (query.includes("UPDATE recurring_task_templates SET title")) {
            const row = templateRows.find((item) => item.id === params[params.length - 1]);
            if (row) {
              row.title = params[0];
              row.notes = params[1];
              row.project_id = params[2];
              row.working_folder = params[3];
              row.due_time = params[4];
              row.priority = params[5];
              row.reminder_offset = params[6];
              row.frequency = params[7];
              row.interval = params[8];
              row.by_weekday = params[9];
              row.end_date = params[10];
              row.parent_id = params[11];
              row.tags = params[12];
              row.updated_at = params[13];
            }
          }
        }),
        select: vi.fn(async (query: string, params: unknown[] = []) => {
          const filterActiveTasks = () => {
            let rows = taskRows.filter((row) => row.deleted_at == null);
            if (query.includes("workspace_id != ?")) {
              rows = rows.filter((row) => row.workspace_id !== params[0]);
            } else if (query.includes("workspace_id = ?")) {
              const workspaceId = params.find(
                (value) => typeof value === "string" && !value.includes("%") && value !== "todo" && value !== "in_progress" && value !== "completed" && value !== "cancelled" && value !== "high" && value !== "medium" && value !== "low",
              );
              if (typeof workspaceId === "string") {
                rows = rows.filter((row) => row.workspace_id === workspaceId);
              }
            }
            if (query.includes("(status = ? OR status = ?)")) {
              rows = rows.filter((row) => row.status === "todo" || row.status === "in_progress");
            }
            if (query.includes("priority = ?")) {
              const priority = params.find((value) => value === "high" || value === "medium" || value === "low");
              if (priority) {
                rows = rows.filter((row) => row.priority === priority);
              }
            }
            if (query.includes("LOWER(title) LIKE ?")) {
              const like = params.find((value) => typeof value === "string" && value.startsWith("%") && value.endsWith("%"));
              if (typeof like === "string") {
                const needle = like.slice(1, -1).toLowerCase();
                rows = rows.filter((row) => String(row.title).toLowerCase().includes(needle));
              }
            }
            return rows;
          };

          if (query.includes("COUNT(*)")) {
            return [{ total: filterActiveTasks().length }];
          }
          if (query.includes("FROM workspaces")) {
            if (query.includes("deleted_at IS NOT NULL")) {
              return workspaceRows.filter((row) => row.deleted_at != null);
            }
            if (query.includes("WHERE id = ?")) {
              return workspaceRows.filter((row) => row.id === params[0]);
            }
            return workspaceRows.filter((row) => row.deleted_at == null);
          }
          if (query.includes("FROM projects")) {
            return projectRows.filter((row) => {
              if (row.status === "archived" || row.deleted_at != null) return false;
              if (params[0] != null && query.includes("workspace_id")) {
                return row.workspace_id === params[0];
              }
              return true;
            });
          }
          if (query.includes("FROM tasks")) {
            if (query.includes("deleted_at IS NOT NULL")) {
              return taskRows.filter((row) => row.deleted_at != null && (params[0] == null || row.workspace_id === params[0]));
            }
            if (query.includes("SELECT id FROM tasks") && query.includes("recurrence_template_id")) {
              return taskRows.filter(
                (row) =>
                  row.recurrence_template_id === params[0] &&
                  row.recurrence_instance_date === params[1] &&
                  row.deleted_at == null,
              );
            }
            if (query.includes("WHERE id = ?")) {
              return taskRows.filter((row) => row.id === params[0]);
            }
            const rows = filterActiveTasks();
            if (query.includes("LIMIT ?")) {
              const limit = Number(params[params.length - 2] ?? params[params.length - 1]);
              const offset = query.includes("OFFSET") ? Number(params[params.length - 1]) : 0;
              if (Number.isFinite(limit)) {
                return rows.slice(offset, offset + limit);
              }
            }
            return rows;
          }
          if (query.includes("FROM saved_views")) {
            return savedViewRows.filter((row) => params[0] == null || row.workspace_id === params[0]);
          }
          if (query.includes("FROM settings")) {
            if (params[0] != null && query.includes("workspace_id = ?")) {
              return settingsRows.filter((row) => row.workspace_id === params[0]);
            }
            return settingsRows;
          }
          if (query.includes("FROM attachments")) {
            return attachmentRows;
          }
          if (query.includes("FROM workspace_folders")) {
            if (query.includes("deleted_at IS NOT NULL")) {
              return folderRows.filter((row) => row.deleted_at != null);
            }
            if (query.includes("WHERE id = ?")) {
              return folderRows;
            }
            return folderRows.filter((row) => row.deleted_at == null && (params[0] == null || row.workspace_id === params[0]));
          }
          if (query.includes("FROM recurring_task_templates")) {
            return templateRows.filter((row) => {
              if (row.deleted_at != null) return false;
              if (query.includes("enabled = 1") && row.enabled !== 1 && row.enabled !== true) return false;
              if (params[0] != null && (query.includes("WHERE id = ?") || query.includes("id = ?"))) {
                return row.id === params[0];
              }
              if (params[0] != null && query.includes("workspace_id")) {
                return row.workspace_id === params[0];
              }
              return true;
            });
          }
          if (query.includes("FROM reminders") || query.includes("reminders.*")) {
            return reminderRows;
          }
          if (query.includes("FROM reminder_events")) {
            return reminderEventRows;
          }
          return [];
        }),
      };
    };

    beforeEach(() => {
      vi.mocked(Database.load).mockResolvedValue(makeDb() as never);
    });

    run(async () => {
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
  });
});
