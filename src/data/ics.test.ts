import { describe, expect, it } from "vitest";

import { buildTasksIcs } from "./repository";
import type { Project, Reminder, Task } from "./types";

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

/** Minimal RFC 5545 unfolding + content-line parser for VTODO assertions. */
const unfoldIcs = (ics: string): string[] => {
  const raw = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
};

type IcsComponent = {
  name: string;
  props: Record<string, string[]>;
  components: IcsComponent[];
};

const parseContentLine = (line: string): { name: string; value: string } => {
  const colon = line.indexOf(":");
  const left = colon >= 0 ? line.slice(0, colon) : line;
  const value = colon >= 0 ? line.slice(colon + 1) : "";
  const name = left.split(";", 1)[0]!.toUpperCase();
  return { name, value };
};

const parseIcsComponents = (ics: string): IcsComponent => {
  const lines = unfoldIcs(ics);
  const root: IcsComponent = { name: "ROOT", props: {}, components: [] };
  const stack: IcsComponent[] = [root];

  for (const line of lines) {
    if (line.startsWith("BEGIN:")) {
      const name = line.slice("BEGIN:".length).toUpperCase();
      const component: IcsComponent = { name, props: {}, components: [] };
      stack[stack.length - 1]!.components.push(component);
      stack.push(component);
      continue;
    }
    if (line.startsWith("END:")) {
      stack.pop();
      continue;
    }
    const { name, value } = parseContentLine(line);
    const current = stack[stack.length - 1]!;
    if (!current.props[name]) {
      current.props[name] = [];
    }
    current.props[name]!.push(value);
  }

  return root;
};

const vtodosOf = (ics: string): IcsComponent[] => {
  const calendar = parseIcsComponents(ics).components.find((component) => component.name === "VCALENDAR");
  expect(calendar).toBeDefined();
  return calendar!.components.filter((component) => component.name === "VTODO");
};

const prop = (component: IcsComponent, name: string): string | undefined => component.props[name]?.[0];

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

const makeData = (tasks: Task[], reminders: Reminder[] = []) => ({
  tasks,
  reminders,
  projects: [] as Project[],
});

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

  it("exports all-day todos with DUE;VALUE=DATE (no VEVENT/DTEND)", () => {
    const task = makeTask({ dueDate: "2026-06-15", dueTime: null });
    const ics = buildTasksIcs(makeData([task]));
    const [todo] = vtodosOf(ics);
    expect(todo).toBeDefined();
    expect(ics).toContain("DUE;VALUE=DATE:20260615");
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).not.toContain("DTSTART");
    expect(ics).not.toContain("DTEND");
    expect(prop(todo!, "SUMMARY")).toBe("Test task");
  });

  it("exports timed todos with UTC DUE ending in Z", () => {
    const task = makeTask({ dueDate: "2026-06-15", dueTime: "10:00" });
    const ics = buildTasksIcs(makeData([task]));
    const expectedDue = expectedUtcFromLocal("2026-06-15", "10:00");
    const [todo] = vtodosOf(ics);
    expect(prop(todo!, "DUE")).toBe(expectedDue);
    expect(expectedDue).toMatch(/^\d{8}T\d{6}Z$/);
    expect(ics).not.toContain("DTEND");
  });

  it("maps completed tasks to VTODO STATUS:COMPLETED + COMPLETED + PERCENT-COMPLETE:100", () => {
    const task = makeTask({
      status: "completed",
      completedAt: "2026-06-10T12:00:00.000Z",
    });
    const ics = buildTasksIcs(makeData([task]));
    const [todo] = vtodosOf(ics);
    expect(prop(todo!, "STATUS")).toBe("COMPLETED");
    expect(prop(todo!, "COMPLETED")).toBe(expectedUtcFromIso("2026-06-10T12:00:00.000Z"));
    expect(prop(todo!, "PERCENT-COMPLETE")).toBe("100");
  });

  it("maps cancelled tasks to STATUS:CANCELLED", () => {
    const task = makeTask({ status: "cancelled" });
    const ics = buildTasksIcs(makeData([task]));
    expect(prop(vtodosOf(ics)[0]!, "STATUS")).toBe("CANCELLED");
  });

  it("maps in_progress tasks to STATUS:IN-PROCESS + PERCENT-COMPLETE:50", () => {
    const task = makeTask({ status: "in_progress" });
    const ics = buildTasksIcs(makeData([task]));
    const [todo] = vtodosOf(ics);
    expect(prop(todo!, "STATUS")).toBe("IN-PROCESS");
    expect(prop(todo!, "PERCENT-COMPLETE")).toBe("50");
  });

  it("maps open tasks to STATUS:NEEDS-ACTION (VTODO, not VEVENT CONFIRMED)", () => {
    const task = makeTask({ status: "todo" });
    const ics = buildTasksIcs(makeData([task]));
    const [todo] = vtodosOf(ics);
    expect(prop(todo!, "STATUS")).toBe("NEEDS-ACTION");
    expect(prop(todo!, "PERCENT-COMPLETE")).toBeUndefined();
    expect(prop(todo!, "COMPLETED")).toBeUndefined();
    expect(ics).not.toContain("STATUS:CONFIRMED");
  });

  it("maps priority to RFC 5545 PRIORITY values", () => {
    const high = makeTask({ id: "t1", priority: "high" });
    const medium = makeTask({ id: "t2", priority: "medium" });
    const low = makeTask({ id: "t3", priority: "low" });
    const todos = vtodosOf(buildTasksIcs(makeData([high, medium, low])));
    expect(todos.map((todo) => prop(todo, "PRIORITY"))).toEqual(["1", "5", "9"]);
  });

  it("emits DTSTAMP from task.updatedAt in UTC", () => {
    const task = makeTask({ updatedAt: "2026-06-05T08:30:00.000Z" });
    const ics = buildTasksIcs(makeData([task]));
    expect(prop(vtodosOf(ics)[0]!, "DTSTAMP")).toBe(expectedUtcFromIso("2026-06-05T08:30:00.000Z"));
  });

  it("emits CREATED and LAST-MODIFIED from task timestamps", () => {
    const task = makeTask({
      createdAt: "2026-05-01T10:00:00.000Z",
      updatedAt: "2026-06-05T08:30:00.000Z",
    });
    const ics = buildTasksIcs(makeData([task]));
    const [todo] = vtodosOf(ics);
    expect(prop(todo!, "CREATED")).toBe(expectedUtcFromIso("2026-05-01T10:00:00.000Z"));
    expect(prop(todo!, "LAST-MODIFIED")).toBe(expectedUtcFromIso("2026-06-05T08:30:00.000Z"));
  });

  it("emits CATEGORIES from project name when projectId resolves", () => {
    const project: Project = {
      id: "proj_1",
      workspaceId: "local-workspace",
      name: "Work, Ops; Labs",
      color: "#000000",
      status: "active",
      dueDate: null,
      workingFolder: null,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };
    const task = makeTask({ projectId: "proj_1" });
    const ics = buildTasksIcs({ tasks: [task], reminders: [], projects: [project] });
    expect(prop(vtodosOf(ics)[0]!, "CATEGORIES")).toBe("Work\\, Ops\\; Labs");
  });

  it("omits CATEGORIES when projectId is missing or unknown", () => {
    const withUnknown = makeTask({ projectId: "missing" });
    const withoutProject = makeTask({ projectId: null });
    expect(prop(vtodosOf(buildTasksIcs(makeData([withUnknown])))[0]!, "CATEGORIES")).toBeUndefined();
    expect(prop(vtodosOf(buildTasksIcs(makeData([withoutProject])))[0]!, "CATEGORIES")).toBeUndefined();
  });

  it("emits VALARM nested under VTODO for first enabled unfired reminder", () => {
    const task = makeTask({ id: "task_a", dueTime: "10:00" });
    const reminder = makeReminder({
      id: "rem_a",
      taskId: "task_a",
      offsetMinutes: 15,
      enabled: true,
      firedAt: null,
    });
    const ics = buildTasksIcs(makeData([task], [reminder]));
    const [todo] = vtodosOf(ics);
    const alarm = todo!.components.find((component) => component.name === "VALARM");
    expect(alarm).toBeDefined();
    expect(prop(alarm!, "ACTION")).toBe("DISPLAY");
    expect(prop(alarm!, "DESCRIPTION")).toBe("Reminder");
    expect(prop(alarm!, "TRIGGER")).toBe("-PT15M");
  });

  it("does not emit VALARM for fired reminders", () => {
    const task = makeTask({ id: "task_a" });
    const reminder = makeReminder({
      taskId: "task_a",
      enabled: true,
      firedAt: "2026-06-15T09:15:00.000Z",
    });
    const ics = buildTasksIcs(makeData([task], [reminder]));
    expect(vtodosOf(ics)[0]!.components.some((component) => component.name === "VALARM")).toBe(false);
  });

  it("does not emit VALARM for disabled reminders", () => {
    const task = makeTask({ id: "task_a" });
    const reminder = makeReminder({
      taskId: "task_a",
      enabled: false,
      firedAt: null,
    });
    const ics = buildTasksIcs(makeData([task], [reminder]));
    expect(vtodosOf(ics)[0]!.components.some((component) => component.name === "VALARM")).toBe(false);
  });

  it("escapes special characters in SUMMARY and DESCRIPTION", () => {
    const task = makeTask({
      title: "Buy milk, bread; and eggs",
      notes: "Line 1\nLine 2\\path",
    });
    const ics = buildTasksIcs(makeData([task]));
    const [todo] = vtodosOf(ics);
    expect(prop(todo!, "SUMMARY")).toBe("Buy milk\\, bread\\; and eggs");
    expect(prop(todo!, "DESCRIPTION")).toBe("Line 1\\nLine 2\\\\path");
  });

  it("folds long lines at 75 UTF-8 bytes with CRLF + space", () => {
    const longTitle = "A".repeat(80);
    const task = makeTask({ title: longTitle });
    const ics = buildTasksIcs(makeData([task]));
    const summaryLine = ics.split("\r\n").find((line) => line.startsWith("SUMMARY:"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toBe(`SUMMARY:${"A".repeat(67)}`);
    const lines = ics.split("\r\n");
    const summaryIndex = lines.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(lines[summaryIndex + 1]).toBe(` ${"A".repeat(13)}`);
    // Parser unfolds so SUMMARY is complete
    expect(prop(vtodosOf(ics)[0]!, "SUMMARY")).toBe(longTitle);
  });

  it("folds long lines with multi-byte UTF-8 characters safely", () => {
    const exactTitle = "中".repeat(22);
    const task1 = makeTask({ id: "t1", title: exactTitle });
    const ics1 = buildTasksIcs(makeData([task1]));
    const summary1 = ics1.split("\r\n").find((line) => line.startsWith("SUMMARY:"));
    expect(summary1).toBe(`SUMMARY:${exactTitle}`);

    const foldTitle = "中".repeat(26);
    const task2 = makeTask({ id: "t2", title: foldTitle });
    const ics2 = buildTasksIcs(makeData([task2]));
    const lines2 = ics2.split("\r\n");
    const summaryIndex = lines2.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(lines2[summaryIndex]).toBe(`SUMMARY:${"中".repeat(22)}`);
    expect(lines2[summaryIndex + 1]).toBe(` ${"中".repeat(4)}`);
    expect(prop(vtodosOf(ics2)[0]!, "SUMMARY")).toBe(foldTitle);
  });

  it("includes UID for each task", () => {
    const task = makeTask({ id: "unique_task_id" });
    const ics = buildTasksIcs(makeData([task]));
    expect(prop(vtodosOf(ics)[0]!, "UID")).toBe("unique_task_id@whattodo");
  });

  it("exports multiple tasks as multiple VTODOs", () => {
    const tasks = [
      makeTask({ id: "t1", title: "First" }),
      makeTask({ id: "t2", title: "Second" }),
    ];
    const ics = buildTasksIcs(makeData(tasks));
    const todos = vtodosOf(ics);
    expect(todos).toHaveLength(2);
    expect(ics).not.toMatch(/BEGIN:VEVENT/);
    expect(todos.map((todo) => prop(todo, "SUMMARY"))).toEqual(["First", "Second"]);
  });

  it("emits zero VALARM when no reminders exist", () => {
    const task = makeTask();
    const ics = buildTasksIcs(makeData([task]));
    expect(vtodosOf(ics)[0]!.components).toHaveLength(0);
  });

  it("picks only the first matching reminder for VALARM", () => {
    const task = makeTask({ id: "task_a" });
    const reminders = [
      makeReminder({ id: "r1", taskId: "task_a", offsetMinutes: 10, enabled: true, firedAt: null }),
      makeReminder({ id: "r2", taskId: "task_a", offsetMinutes: 20, enabled: true, firedAt: null }),
    ];
    const ics = buildTasksIcs(makeData([task], reminders));
    const alarm = vtodosOf(ics)[0]!.components.find((component) => component.name === "VALARM");
    expect(prop(alarm!, "TRIGGER")).toBe("-PT10M");
    expect(ics).not.toContain("TRIGGER:-PT20M");
  });

  it("never mixes VEVENT-only status values into VTODO components", () => {
    const statuses: Task["status"][] = ["todo", "in_progress", "completed", "cancelled"];
    for (const status of statuses) {
      const ics = buildTasksIcs(makeData([makeTask({ status, completedAt: status === "completed" ? "2026-06-10T12:00:00.000Z" : null })]));
      expect(ics).not.toContain("BEGIN:VEVENT");
      expect(ics).not.toContain("STATUS:CONFIRMED");
      expect(ics).not.toContain("STATUS:TENTATIVE");
      const statusValue = prop(vtodosOf(ics)[0]!, "STATUS");
      expect(["NEEDS-ACTION", "IN-PROCESS", "COMPLETED", "CANCELLED"]).toContain(statusValue);
    }
  });
});
