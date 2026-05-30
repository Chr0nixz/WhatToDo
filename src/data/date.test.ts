import { describe, expect, it } from "vitest";

import { overdueTasks, taskCountsByDate, tasksForDate } from "./date";
import type { Task } from "./types";

const makeTask = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  workspaceId: "workspace",
  projectId: patch.projectId ?? null,
  workingFolder: patch.workingFolder ?? null,
  title: patch.title ?? "Task",
  notes: patch.notes ?? "",
  dueDate: patch.dueDate ?? "2026-05-28",
  dueTime: patch.dueTime ?? null,
  timezone: "Asia/Shanghai",
  priority: patch.priority ?? "medium",
  status: patch.status ?? "todo",
  completedAt: patch.completedAt ?? null,
  createdAt: patch.createdAt ?? "2026-05-28T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-28T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null,
  recurrenceTemplateId: patch.recurrenceTemplateId ?? null,
  recurrenceInstanceDate: patch.recurrenceInstanceDate ?? null,
});

describe("date task helpers", () => {
  it("returns loose and project tasks for the same selected date", () => {
    const tasks = [
      makeTask({ id: "loose", projectId: null, dueDate: "2026-05-28" }),
      makeTask({ id: "project", projectId: "project_1", dueDate: "2026-05-28" }),
      makeTask({ id: "other", dueDate: "2026-05-29" }),
    ];

    expect(tasksForDate(tasks, "2026-05-28").map((task) => task.id)).toEqual(["loose", "project"]);
  });

  it("excludes completed and deleted tasks from calendar counts", () => {
    const tasks = [
      makeTask({ id: "open", dueDate: "2026-05-28" }),
      makeTask({ id: "done", dueDate: "2026-05-28", status: "completed" }),
      makeTask({ id: "deleted", dueDate: "2026-05-28", deletedAt: "2026-05-28T01:00:00.000Z" }),
    ];

    expect(taskCountsByDate(tasks)).toEqual({ "2026-05-28": 1 });
  });

  it("detects overdue open tasks against a reference date", () => {
    const tasks = [
      makeTask({ id: "old", dueDate: "2026-05-27" }),
      makeTask({ id: "today", dueDate: "2026-05-28" }),
      makeTask({ id: "done-old", dueDate: "2026-05-27", status: "completed" }),
    ];

    expect(overdueTasks(tasks, "2026-05-28").map((task) => task.id)).toEqual(["old"]);
  });
});
