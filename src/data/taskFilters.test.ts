import { describe, expect, it } from "vitest";

import type { AppData, Reminder, Task } from "./types";
import { buildAppIndexes } from "./appIndexes";
import { defaultTaskViewFilters, taskMatchesFilters } from "./taskFilters";

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  workspaceId: "workspace",
  projectId: patch.projectId ?? null,
  workingFolder: patch.workingFolder ?? null,
  title: patch.title ?? "Task",
  notes: "",
  dueDate: patch.dueDate ?? "2026-06-01",
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: patch.priority ?? "medium",
  status: patch.status ?? "todo",
  completedAt: patch.completedAt ?? null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null,
  recurrenceTemplateId: patch.recurrenceTemplateId ?? null,
  recurrenceInstanceDate: patch.recurrenceInstanceDate ?? null,
});

const makeReminder = (taskId: string): Reminder => ({
  id: `reminder-${taskId}`,
  taskId,
  remindAt: "2026-06-01T00:00:00.000Z",
  offsetMinutes: 30,
  snoozedUntil: null,
  firedAt: null,
  failedAt: null,
  lastError: null,
  lastAttemptedAt: null,
  enabled: true,
});

const makeData = (tasks: Task[], reminders: Reminder[] = []): AppData => ({
  workspaceId: "workspace",
  workspaces: [],
  workspaceFolders: [],
  projects: [],
  tasks,
  deletedTasks: [],
  deletedWorkspaceFolders: [],
  availableTasks: [],
  reminders,
  savedViews: [],
  recurringTaskTemplates: [],
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "en",
    defaultReminderOffset: 30,
    defaultWorkingFolder: null,
    notificationsEnabled: true,
    closeToTray: true,
  },
});

describe("taskMatchesFilters", () => {
  it("filters by priority, project, reminder, folder, and date range", () => {
    const task = makeTask({
      id: "target",
      projectId: "project",
      workingFolder: "D:\\Project",
      priority: "high",
      dueDate: "2026-06-02",
    });
    const data = makeData([task], [makeReminder("target")]);

    expect(
      taskMatchesFilters(
        task,
        data,
        {
          ...defaultTaskViewFilters(),
          priority: "high",
          projectId: "project",
          reminder: "with",
          folder: "with",
          dateRange: "week",
        },
        "2026-06-01",
      ),
    ).toBe(true);
  });

  it("keeps overdue filtering limited to open tasks before the reference day", () => {
    const task = makeTask({ dueDate: "2026-05-30" });
    expect(taskMatchesFilters(task, makeData([task]), { ...defaultTaskViewFilters(), dateRange: "overdue" }, "2026-06-01")).toBe(
      true,
    );
  });

  it("uses precomputed reminder task ids for reminder filters", () => {
    const task = makeTask({ id: "target" });
    const data = makeData([task], [makeReminder("target")]);
    const context = buildAppIndexes(data);

    expect(taskMatchesFilters(task, context, { ...defaultTaskViewFilters(), reminder: "with" })).toBe(true);
    expect(taskMatchesFilters(task, context, { ...defaultTaskViewFilters(), reminder: "without" })).toBe(false);
  });
});
