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

  it("accurately matches tags containing quotes, backslashes and wildcards in JSON (PERF-014)", () => {
    const where: string[] = [];
    const params: unknown[] = [];

    const specialTags = ['version"2.0"', "path\\to\\code", "100%", "snake_case"];
    appendTagFiltersSql(where, params, specialTags, "all");

    expect(where).toHaveLength(4);
    for (const clause of where) {
      expect(clause).toBe("tags LIKE ? ESCAPE '\\'");
    }

    // Verify pattern matching against real JSON.stringify representation in SQLite
    const sampleDbJson = JSON.stringify(['version"2.0"', "path\\to\\code", "100%", "snake_case"]);

    // Test each pattern with SQLite regex/string containment logic:
    // 1. Tag with quotes: JSON.stringify produces "version\"2.0\""
    // In SQL LIKE pattern with ESCAPE '\\', the backslash itself is escaped as \\
    const pattern0 = params[0] as string;
    expect(pattern0).toBe('%"version\\\\"2.0\\\\""%');
    expect(sampleDbJson).toContain('version\\"2.0\\"');

    // 2. Tag with backslashes: JSON.stringify produces "path\\to\\code"
    const pattern1 = params[1] as string;
    expect(pattern1).toBe('%"path\\\\\\\\to\\\\\\\\code"%');

    // 3. Tag with wildcards: % and _ must be escaped
    const pattern2 = params[2] as string;
    expect(pattern2).toBe('%"100\\%"%');

    const pattern3 = params[3] as string;
    expect(pattern3).toBe('%"snake\\_case"%');
  });

  it("generates SQL non-truth check (IS NOT 1) for negated filter groups to guard against NULL three-valued logic (PERF-021)", () => {
    const group: FilterGroup = {
      operator: "AND",
      negate: true,
      groups: [],
      conditions: [
        { field: "projectId", op: "eq", value: "p-secret" },
      ],
    };

    const where: string[] = [];
    const params: unknown[] = [];
    appendAdvancedFilterSql(where, params, group);

    expect(where.length).toBe(1);
    expect(where[0]).toBe("(project_id = ?) IS NOT 1");
    expect(params).toEqual(["p-secret"]);
  });
});
