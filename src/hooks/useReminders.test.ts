import { describe, expect, it } from "vitest";

import type { AppData, Reminder, Task } from "@/data/types";

import { dueRemindersForData } from "./useReminders";

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  workspaceId: "workspace",
  projectId: null,
  workingFolder: null,
  title: patch.title ?? "Task",
  notes: "",
  dueDate: "2026-06-01",
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: "medium",
  status: patch.status ?? "todo",
  completedAt: patch.completedAt ?? null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null,
});

const makeReminder = (patch: Partial<Reminder>): Reminder => ({
  id: patch.id ?? "reminder",
  taskId: patch.taskId ?? "task",
  remindAt: patch.remindAt ?? "2026-06-01T00:00:00.000Z",
  offsetMinutes: patch.offsetMinutes ?? 30,
  snoozedUntil: patch.snoozedUntil ?? null,
  firedAt: patch.firedAt ?? null,
  failedAt: patch.failedAt ?? null,
  lastError: patch.lastError ?? null,
  lastAttemptedAt: patch.lastAttemptedAt ?? null,
  enabled: patch.enabled ?? true,
});

const makeData = (tasks: Task[], reminders: Reminder[]): AppData => ({
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
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "zh",
    defaultReminderOffset: 30,
    defaultWorkingFolder: null,
    notificationsEnabled: true,
    closeToTray: true,
  },
});

describe("dueRemindersForData", () => {
  it("returns every due reminder for open, non-deleted tasks", () => {
    const data = makeData(
      [makeTask({ id: "a" }), makeTask({ id: "b" })],
      [
        makeReminder({ id: "ra", taskId: "a", remindAt: "2026-06-01T00:00:00.000Z" }),
        makeReminder({ id: "rb", taskId: "b", remindAt: "2026-06-01T00:01:00.000Z" }),
      ],
    );

    expect(dueRemindersForData(data, new Date("2026-06-01T00:02:00.000Z").getTime()).map((item) => item.id)).toEqual([
      "ra",
      "rb",
    ]);
  });

  it("excludes disabled, fired, failed, completed, deleted, and future reminders", () => {
    const data = makeData(
      [
        makeTask({ id: "open" }),
        makeTask({ id: "done", status: "completed" }),
        makeTask({ id: "deleted", deletedAt: "2026-06-01T00:00:00.000Z" }),
      ],
      [
        makeReminder({ id: "due", taskId: "open", remindAt: "2026-06-01T00:00:00.000Z" }),
        makeReminder({ id: "future", taskId: "open", remindAt: "2026-06-01T00:10:00.000Z" }),
        makeReminder({ id: "disabled", taskId: "open", enabled: false }),
        makeReminder({ id: "fired", taskId: "open", firedAt: "2026-06-01T00:00:00.000Z" }),
        makeReminder({ id: "failed", taskId: "open", failedAt: "2026-06-01T00:00:00.000Z" }),
        makeReminder({ id: "done", taskId: "done" }),
        makeReminder({ id: "deleted", taskId: "deleted" }),
      ],
    );

    expect(dueRemindersForData(data, new Date("2026-06-01T00:02:00.000Z").getTime()).map((item) => item.id)).toEqual([
      "due",
    ]);
  });
});
