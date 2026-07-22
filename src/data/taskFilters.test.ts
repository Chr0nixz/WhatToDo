import { describe, expect, it } from "vitest";

import type { AppData, FilterGroup, Reminder, Task } from "./types";
import { buildAppIndexes } from "./appIndexes";
import { defaultTaskViewFilters, matchesFilterGroup, taskMatchesFilters } from "./taskFilters";

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
  parentId: patch.parentId ?? null,
  tags: patch.tags ?? [],
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
  attachments: [],
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
  settingsByWorkspace: {},
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
    const context = buildAppIndexes(data.tasks, data.projects, data.reminders);

    expect(taskMatchesFilters(task, context, { ...defaultTaskViewFilters(), reminder: "with" })).toBe(true);
    expect(taskMatchesFilters(task, context, { ...defaultTaskViewFilters(), reminder: "without" })).toBe(false);
  });

  it("filters by tags using any/all/none match modes", () => {
    const task = makeTask({ id: "tagged", tags: ["urgent", "backend"] });
    const data = makeData([task]);

    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["urgent"], tagMatch: "any" })).toBe(true);
    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["urgent", "frontend"], tagMatch: "any" })).toBe(true);
    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["frontend"], tagMatch: "any" })).toBe(false);
    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["urgent", "backend"], tagMatch: "all" })).toBe(true);
    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["urgent", "frontend"], tagMatch: "all" })).toBe(false);
    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["urgent"], tagMatch: "none" })).toBe(false);
    expect(taskMatchesFilters(task, data, { ...defaultTaskViewFilters(), tags: ["frontend"], tagMatch: "none" })).toBe(true);
  });
});

describe("matchesFilterGroup", () => {
  const data = makeData([]);

  it("evaluates AND group with multiple conditions", () => {
    const task = makeTask({ priority: "high", tags: ["urgent"] });
    const group: FilterGroup = {
      operator: "AND",
      negate: false,
      conditions: [
        { field: "priority", op: "eq", value: "high" },
        { field: "tags", op: "contains", value: "urgent" },
      ],
      groups: [],
    };
    expect(matchesFilterGroup(task, group, data)).toBe(true);
  });

  it("evaluates OR group", () => {
    const task = makeTask({ priority: "low" });
    const group: FilterGroup = {
      operator: "OR",
      negate: false,
      conditions: [
        { field: "priority", op: "eq", value: "high" },
        { field: "priority", op: "eq", value: "low" },
      ],
      groups: [],
    };
    expect(matchesFilterGroup(task, group, data)).toBe(true);
  });

  it("negates a group", () => {
    const task = makeTask({ priority: "high" });
    const group: FilterGroup = {
      operator: "AND",
      negate: true,
      conditions: [{ field: "priority", op: "eq", value: "high" }],
      groups: [],
    };
    expect(matchesFilterGroup(task, group, data)).toBe(false);
  });

  it("evaluates nested subgroups", () => {
    const task = makeTask({ priority: "high", status: "todo", parentId: null });
    const group: FilterGroup = {
      operator: "AND",
      negate: false,
      conditions: [{ field: "priority", op: "eq", value: "high" }],
      groups: [
        {
          operator: "OR",
          negate: false,
          conditions: [
            { field: "status", op: "eq", value: "completed" },
            { field: "parentId", op: "isNotEmpty" },
          ],
          groups: [],
        },
      ],
    };
    // priority=high AND (status=completed OR parentId not empty) → high AND (false OR false) → false
    expect(matchesFilterGroup(task, group, data)).toBe(false);
  });

  it("supports in/notIn operators for priority", () => {
    const task = makeTask({ priority: "medium" });
    expect(
      matchesFilterGroup(task, { operator: "AND", negate: false, conditions: [{ field: "priority", op: "in", value: ["low", "medium"] }], groups: [] }, data),
    ).toBe(true);
    expect(
      matchesFilterGroup(task, { operator: "AND", negate: false, conditions: [{ field: "priority", op: "notIn", value: ["high"] }], groups: [] }, data),
    ).toBe(true);
  });

  it("supports dueDate before/after operators", () => {
    const task = makeTask({ dueDate: "2026-06-15" });
    expect(
      matchesFilterGroup(task, { operator: "AND", negate: false, conditions: [{ field: "dueDate", op: "before", value: "2026-07-01" }], groups: [] }, data),
    ).toBe(true);
    expect(
      matchesFilterGroup(task, { operator: "AND", negate: false, conditions: [{ field: "dueDate", op: "after", value: "2026-06-01" }], groups: [] }, data),
    ).toBe(true);
  });

  it("integrates advancedFilter into taskMatchesFilters", () => {
    const task = makeTask({ priority: "high", tags: ["backend"] });
    const filters = {
      ...defaultTaskViewFilters(),
      advancedFilter: {
        operator: "OR",
        negate: false,
        conditions: [
          { field: "tags", op: "contains", value: "frontend" },
          { field: "priority", op: "in", value: ["high", "urgent" as never] },
        ],
        groups: [],
      } as FilterGroup,
    };
    expect(taskMatchesFilters(task, data, filters)).toBe(true);
  });
});
