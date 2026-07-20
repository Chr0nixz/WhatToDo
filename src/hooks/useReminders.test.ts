import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppData, Reminder, Task } from "@/data/types";

import { dueRemindersForData, useReminders } from "./useReminders";

const sendNotification = vi.fn();
const isPermissionGranted = vi.fn();
const requestPermission = vi.fn();

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: unknown[]) => isPermissionGranted(...args),
  requestPermission: (...args: unknown[]) => requestPermission(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));

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
  recurrenceTemplateId: patch.recurrenceTemplateId ?? null,
  recurrenceInstanceDate: patch.recurrenceInstanceDate ?? null,
  parentId: null,
  tags: [],
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
  attachments: [],
  settings: {
    theme: "system",
    accentColor: "blue",
    language: "zh",
    defaultReminderOffset: 30,
    defaultWorkingFolder: null,
    defaultSavedViewId: null,
    notificationsEnabled: true,
    closeToTray: true,
  },
  settingsByWorkspace: {},
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

describe("useReminders notification failure", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    isPermissionGranted.mockResolvedValue(true);
    requestPermission.mockResolvedValue("granted");
    sendNotification.mockReset();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("marks a reminder failed when sendNotification throws", async () => {
    sendNotification.mockRejectedValue(new Error("notify boom"));
    const markReminderFired = vi.fn(async () => makeData([], []));
    const markReminderFailed = vi.fn(async () => makeData([], []));
    const past = new Date(Date.now() - 60_000).toISOString();
    const data = makeData(
      [makeTask({ id: "task-a", title: "Alpha" })],
      [makeReminder({ id: "reminder-a", taskId: "task-a", remindAt: past })],
    );

    renderHook(() => useReminders(data, markReminderFired, markReminderFailed, vi.fn()));

    await waitFor(() => {
      expect(markReminderFailed).toHaveBeenCalledWith("reminder-a", "notify boom");
    });
    expect(markReminderFired).not.toHaveBeenCalled();
  });
});
