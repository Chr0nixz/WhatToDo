import { describe, expect, it } from "vitest";

import { buildTasksIcs } from "./repository";
import type { AppData, Reminder, Task } from "./types";

const pad2 = (n: number) => String(n).padStart(2, "0");

const expectedUtcFromLocal = (dueDate: string, dueTime: string): string => {
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hours, minutes] = dueTime.split(":").map(Number);
  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return `${local.getUTCFullYear()}${pad2(local.getUTCMonth() + 1)}${pad2(local.getUTCDate())}T${pad2(local.getUTCHours())}${pad2(local.getUTCMinutes())}${pad2(local.getUTCSeconds())}Z`;
};

const expectedUtcFromIso = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task_1",
  workspaceId: "local-workspace",
  projectId: null,
  workingFolder: null,
  title: "Test task",
  notes: "",
  dueDate: "2026-06-15",
  dueTime: null,
  timezone: "Asia/Shanghai",
  priority: "medium",
  status: "todo",
  completedAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  deletedAt: null,
  recurrenceTemplateId: null,
  recurrenceInstanceDate: null,
  parentId: null,
  tags: [],
  ...overrides,
});

const makeReminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: "reminder_1",
  taskId: "task_1",
  remindAt: "2026-06-15T09:30:00.000Z",
  offsetMinutes: 30,
  snoozedUntil: null,
  firedAt: null,
  failedAt: null,
  lastError: null,
  lastAttemptedAt: null,
  enabled: true,
  ...overrides,
});

const makeData = (tasks: Task[], reminders: Reminder[] = []): AppData =>
  ({
    workspaceId: "local-workspace",
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
      notificationsEnabled: false,
      closeToTray: true,
    },
    settingsByWorkspace: {},
  }) as AppData;

describe("buildTasksIcs", () => {
  it("produces valid VCALENDAR header and footer", () => {
    const ics = buildTasksIcs(makeData([]));
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//WhatToDo//Tasks//EN");
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("exports all-day events with VALUE=DATE and next-day DTEND", () => {
    const task = makeTask({ dueDate: "2026-06-15", dueTime: null });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260615");
    expect(ics).toContain("DTEND;VALUE=DATE:20260616");
  });

  it("exports timed events with UTC datetime ending in Z", () => {
    const task = makeTask({ dueDate: "2026-06-15", dueTime: "10:00" });
    const ics = buildTasksIcs(makeData([task]));
    const expectedStart = expectedUtcFromLocal("2026-06-15", "10:00");
    expect(ics).toContain(`DTSTART:${expectedStart}`);
    expect(ics).toContain(`DTEND:${expectedStart}`);
    expect(expectedStart).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("maps completed tasks to STATUS:COMPLETED + COMPLETED + PERCENT-COMPLETE:100", () => {
    const task = makeTask({
      status: "completed",
      completedAt: "2026-06-10T12:00:00.000Z",
    });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("STATUS:COMPLETED");
    expect(ics).toContain(`COMPLETED:${expectedUtcFromIso("2026-06-10T12:00:00.000Z")}`);
    expect(ics).toContain("PERCENT-COMPLETE:100");
  });

  it("maps cancelled tasks to STATUS:CANCELLED", () => {
    const task = makeTask({ status: "cancelled" });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("maps in_progress tasks to STATUS:IN-PROCESS + PERCENT-COMPLETE:50", () => {
    const task = makeTask({ status: "in_progress" });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("STATUS:IN-PROCESS");
    expect(ics).toContain("PERCENT-COMPLETE:50");
  });

  it("maps open tasks to STATUS:CONFIRMED", () => {
    const task = makeTask({ status: "todo" });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).not.toContain("PERCENT-COMPLETE");
    expect(ics).not.toContain("COMPLETED:");
  });

  it("maps priority to RFC 5545 PRIORITY values", () => {
    const high = makeTask({ id: "t1", priority: "high" });
    const medium = makeTask({ id: "t2", priority: "medium" });
    const low = makeTask({ id: "t3", priority: "low" });
    const ics = buildTasksIcs(makeData([high, medium, low]));
    expect(ics).toContain("PRIORITY:1");
    expect(ics).toContain("PRIORITY:5");
    expect(ics).toContain("PRIORITY:9");
  });

  it("emits DTSTAMP from task.updatedAt in UTC", () => {
    const task = makeTask({ updatedAt: "2026-06-05T08:30:00.000Z" });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain(`DTSTAMP:${expectedUtcFromIso("2026-06-05T08:30:00.000Z")}`);
  });

  it("emits VALARM for first enabled unfired reminder", () => {
    const task = makeTask({ id: "task_a", dueTime: "10:00" });
    const reminder = makeReminder({
      id: "rem_a",
      taskId: "task_a",
      offsetMinutes: 15,
      enabled: true,
      firedAt: null,
    });
    const ics = buildTasksIcs(makeData([task], [reminder]));
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("ACTION:DISPLAY");
    expect(ics).toContain("DESCRIPTION:Reminder");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("END:VALARM");
  });

  it("does not emit VALARM for fired reminders", () => {
    const task = makeTask({ id: "task_a" });
    const reminder = makeReminder({
      taskId: "task_a",
      enabled: true,
      firedAt: "2026-06-15T09:15:00.000Z",
    });
    const ics = buildTasksIcs(makeData([task], [reminder]));
    expect(ics).not.toContain("VALARM");
  });

  it("does not emit VALARM for disabled reminders", () => {
    const task = makeTask({ id: "task_a" });
    const reminder = makeReminder({
      taskId: "task_a",
      enabled: false,
      firedAt: null,
    });
    const ics = buildTasksIcs(makeData([task], [reminder]));
    expect(ics).not.toContain("VALARM");
  });

  it("escapes special characters in SUMMARY and DESCRIPTION", () => {
    const task = makeTask({
      title: "Buy milk, bread; and eggs",
      notes: "Line 1\nLine 2\\path",
    });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("SUMMARY:Buy milk\\, bread\\; and eggs");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\\\path");
  });

  it("folds long lines at 75 UTF-8 bytes with CRLF + space", () => {
    const longTitle = "A".repeat(80);
    const task = makeTask({ title: longTitle });
    const ics = buildTasksIcs(makeData([task]));
    const summaryLine = ics.split("\r\n").find((line) => line.startsWith("SUMMARY:"));
    expect(summaryLine).toBeDefined();
    // First line of folded content should be exactly "SUMMARY:" + 67 A's = 75 bytes
    expect(summaryLine).toBe(`SUMMARY:${"A".repeat(67)}`);
    // Next line should be a continuation (starts with space)
    const lines = ics.split("\r\n");
    const summaryIndex = lines.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(lines[summaryIndex + 1]).toBe(` ${"A".repeat(13)}`);
  });

  it("folds long lines with multi-byte UTF-8 characters safely", () => {
    // Each Chinese character is 3 bytes in UTF-8; "SUMMARY:" prefix is 8 bytes
    // 22 chars × 3 = 66 bytes + 8 = 74 bytes — should NOT fold (≤ 75)
    const exactTitle = "中".repeat(22);
    const task1 = makeTask({ id: "t1", title: exactTitle });
    const ics1 = buildTasksIcs(makeData([task1]));
    const summary1 = ics1.split("\r\n").find((line) => line.startsWith("SUMMARY:"));
    expect(summary1).toBe(`SUMMARY:${exactTitle}`);

    // 26 chars × 3 = 78 bytes + 8 = 86 bytes — should fold
    // First line: 75 - 8 = 67 bytes → 22 chars (66 bytes), total 74 bytes (safe, no mid-char split)
    // Second line: 26 - 22 = 4 chars remaining
    const foldTitle = "中".repeat(26);
    const task2 = makeTask({ id: "t2", title: foldTitle });
    const ics2 = buildTasksIcs(makeData([task2]));
    const lines2 = ics2.split("\r\n");
    const summaryIndex = lines2.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(lines2[summaryIndex]).toBe(`SUMMARY:${"中".repeat(22)}`); // 8 + 22×3 = 74 bytes
    expect(lines2[summaryIndex + 1]).toBe(` ${"中".repeat(4)}`); // 1 + 4×3 = 13 bytes
  });

  it("includes UID for each task", () => {
    const task = makeTask({ id: "unique_task_id" });
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).toContain("UID:unique_task_id@whattodo");
  });

  it("exports multiple tasks as multiple VEVENTs", () => {
    const tasks = [
      makeTask({ id: "t1", title: "First" }),
      makeTask({ id: "t2", title: "Second" }),
    ];
    const ics = buildTasksIcs(makeData(tasks));
    const beginCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const endCount = (ics.match(/END:VEVENT/g) ?? []).length;
    expect(beginCount).toBe(2);
    expect(endCount).toBe(2);
    expect(ics).toContain("SUMMARY:First");
    expect(ics).toContain("SUMMARY:Second");
  });

  it("emits zero VALARM when no reminders exist", () => {
    const task = makeTask();
    const ics = buildTasksIcs(makeData([task]));
    expect(ics).not.toContain("VALARM");
  });

  it("picks only the first matching reminder for VALARM", () => {
    const task = makeTask({ id: "task_a" });
    const reminders = [
      makeReminder({ id: "r1", taskId: "task_a", offsetMinutes: 10, enabled: true, firedAt: null }),
      makeReminder({ id: "r2", taskId: "task_a", offsetMinutes: 20, enabled: true, firedAt: null }),
    ];
    const ics = buildTasksIcs(makeData([task], reminders));
    expect(ics).toContain("TRIGGER:-PT10M");
    expect(ics).not.toContain("TRIGGER:-PT20M");
  });
});
