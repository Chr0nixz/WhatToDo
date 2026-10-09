import { describe, expect, it } from "vitest";

import {
  normalizeTaskPageInput,
  appendTagFiltersSql,
  appendAdvancedFilterSql,
  taskPageComparator,
} from "@/data/taskPageQuery";
import type { FilterGroup, TaskPageInput, TaskSummary } from "@/data/types";

describe("taskPageQuery module", () => {
  it("normalizes task page inputs with sensible defaults", () => {
    const input: TaskPageInput = {
      workspaceId: "w-1",
      offset: -5,
      limit: 600,
      scope: "open",
      sort: "overview",
      tags: ["alpha", " "],
    };

    const normalized = normalizeTaskPageInput(input, "fallback-ws");
    expect(normalized.offset).toBe(0);
    expect(normalized.limit).toBe(500);
    expect(normalized.tags).toEqual(["alpha"]);
    expect(normalized.tagMatch).toBe("any");
    expect(normalized.scope).toBe("open");
  });

  it("appends tag filter SQL properly for any, all, and none", () => {
    const where: string[] = [];
    const params: unknown[] = [];

    appendTagFiltersSql(where, params, ["frontend", "backend"], "all");
    expect(where.length).toBe(2);
    expect(where[0]).toContain("tags LIKE ? ESCAPE '\\'");
    expect(params.length).toBe(2);

    const whereNone: string[] = [];
    const paramsNone: unknown[] = [];
    appendTagFiltersSql(whereNone, paramsNone, ["deprecated"], "none");
    expect(whereNone[0]).toBe("NOT (tags LIKE ? ESCAPE '\\')");
  });

  it("appends advanced condition groups into valid SQL and parameters", () => {
    const group: FilterGroup = {
      operator: "AND",
      negate: false,
      groups: [],
      conditions: [
        { field: "priority", op: "eq", value: "high" },
        { field: "status", op: "neq", value: "completed" },
        { field: "dueDate", op: "before", value: "2026-07-01" },
        { field: "hasReminder", op: "eq", value: "true" },
        { field: "projectId", op: "isEmpty", value: "" },
      ],
    };

    const where: string[] = [];
    const params: unknown[] = [];
    appendAdvancedFilterSql(where, params, group);

    expect(where.length).toBe(1);
    expect(where[0]).toContain("priority = ?");
    expect(where[0]).toContain("status <> ?");
    expect(where[0]).toContain("due_date < ?");
    expect(where[0]).toContain("EXISTS (SELECT 1 FROM reminders WHERE reminders.task_id = tasks.id AND reminders.enabled = 1)");
    expect(where[0]).toContain("project_id IS NULL");
    expect(params).toEqual(["high", "completed", "2026-07-01"]);
  });

  it("orders tasks consistently via taskPageComparator", () => {
    const taskA: TaskSummary = {
      id: "a",
      workspaceId: "w",
      projectId: null,
      title: "Task A",
      dueDate: "2026-06-01",
      dueTime: "10:00",
      timezone: "UTC",
      priority: "high",
      status: "todo",
      completedAt: null,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      deletedAt: null,
      recurrenceTemplateId: null,
      recurrenceInstanceDate: null,
      parentId: null,
      tags: [],
      workingFolder: null,
    };

    const taskB: TaskSummary = {
      ...taskA,
      id: "b",
      title: "Task B",
      dueDate: "2026-06-02",
      priority: "low",
    };

    const compDate = taskPageComparator("dueAsc");
    expect(compDate(taskA, taskB)).toBeLessThan(0);

    const compCreated = taskPageComparator("createdDesc");
    expect(compCreated(taskA, taskB)).toBe(0);
  });
});
