import { describe, expect, it } from "vitest";

import type { AppData, Reminder, Task } from "./types";
import { getSnoozeUntil, groupReminderCenterItems } from "./reminderCenter";

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  workspaceId: "workspace",
  projectId: null,
  workingFolder: null,
  title: patch.title ?? patch.id ?? "Task",
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
  recurrenceTemplateId: patch.recurrenceTemplateId ?? null,
  recurrenceInstanceDate: patch.recurrenceInstanceDate ?? null,
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
  recurringTaskTemplates: [],
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "en",
    defaultReminderOffset: 30,
    defaultWorkingFolder: null,
    defaultSavedViewId: null,
    notificationsEnabled: true,
    closeToTray: true,
  },
});

describe("groupReminderCenterItems", () => {
  it("groups missed, upcoming, and fired reminders", () => {
    const data = makeData(
      [makeTask({ id: "missed" }), makeTask({ id: "upcoming" }), makeTask({ id: "fired" })],
      [
        makeReminder({ id: "r-missed", taskId: "missed", remindAt: "2026-06-01T00:00:00.000Z" }),
        makeReminder({ id: "r-upcoming", taskId: "upcoming", remindAt: "2026-06-01T00:10:00.000Z" }),
        makeReminder({
          id: "r-fired",
          taskId: "fired",
          remindAt: "2026-06-01T00:00:00.000Z",
          firedAt: "2026-06-01T00:01:00.000Z",
        }),
      ],
    );

    const groups = groupReminderCenterItems(data, new Date("2026-06-01T00:05:00.000Z").getTime());

    expect(groups.missed.map((item) => item.reminder.id)).toEqual(["r-missed"]);
    expect(groups.upcoming.map((item) => item.reminder.id)).toEqual(["r-upcoming"]);
    expect(groups.fired.map((item) => item.reminder.id)).toEqual(["r-fired"]);
  });

  it("puts failed open reminders before missed reminders", () => {
    const data = makeData(
      [makeTask({ id: "failed" }), makeTask({ id: "missed" })],
      [
        makeReminder({
          id: "r-failed",
          taskId: "failed",
          failedAt: "2026-06-01T00:03:00.000Z",
          lastError: "send failed",
        }),
        makeReminder({ id: "r-missed", taskId: "missed" }),
      ],
    );

    const groups = groupReminderCenterItems(data, new Date("2026-06-01T00:05:00.000Z").getTime());

    expect(groups.failed.map((item) => item.reminder.id)).toEqual(["r-failed"]);
    expect(groups.missed.map((item) => item.reminder.id)).toEqual(["r-missed"]);
  });

  it("uses snoozedUntil before remindAt", () => {
    const data = makeData(
      [makeTask({ id: "snoozed" })],
      [
        makeReminder({
          id: "r-snoozed",
          taskId: "snoozed",
          remindAt: "2026-06-01T00:00:00.000Z",
          snoozedUntil: "2026-06-01T00:20:00.000Z",
        }),
      ],
    );

    const groups = groupReminderCenterItems(data, new Date("2026-06-01T00:05:00.000Z").getTime());

    expect(groups.missed).toEqual([]);
    expect(groups.upcoming[0].effectiveAt).toBe("2026-06-01T00:20:00.000Z");
  });

  it("filters disabled, deleted, and completed open reminders", () => {
    const data = makeData(
      [makeTask({ id: "deleted", deletedAt: "2026-06-01T00:00:00.000Z" }), makeTask({ id: "done", status: "completed" })],
      [
        makeReminder({ id: "disabled", taskId: "missing", enabled: false }),
        makeReminder({ id: "deleted", taskId: "deleted" }),
        makeReminder({ id: "done", taskId: "done" }),
      ],
    );

    const groups = groupReminderCenterItems(data, new Date("2026-06-01T00:05:00.000Z").getTime());

    expect(groups.missed).toEqual([]);
    expect(groups.upcoming).toEqual([]);
    expect(groups.fired).toEqual([]);
  });
});

describe("getSnoozeUntil", () => {
  it("computes fixed snooze choices", () => {
    const now = new Date("2026-06-01T08:15:00.000Z");

    expect(getSnoozeUntil("tenMinutes", now)).toBe("2026-06-01T08:25:00.000Z");
    expect(getSnoozeUntil("oneHour", now)).toBe("2026-06-01T09:15:00.000Z");
  });
});
