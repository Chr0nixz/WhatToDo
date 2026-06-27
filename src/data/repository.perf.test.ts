import { describe, expect, it } from "vitest";

import { LocalRepository } from "./repository";
import type { AppData, Task } from "./types";

/**
 * Runtime performance baseline for the data layer.
 *
 * These benchmarks run against LocalRepository with a large in-memory dataset
 * (2,000 tasks) to establish CI-friendly upper-bound thresholds for the hot
 * read paths. They are NOT a substitute for real 20k-task desktop validation
 * (see docs/PERFORMANCE_VALIDATION.md), but they guard against regressions
 * that turn O(1)/O(log n) operations into O(n) or worse.
 *
 * Thresholds are generous to avoid flakiness on slow CI runners while still
 * catching algorithmic regressions (e.g. a 10x slowdown from an accidental
 * nested loop).
 */

const TASK_COUNT = 2_000;
const LOAD_BUDGET_MS = 250;
const LOAD_TASK_PAGE_BUDGET_MS = 80;
const TOGGLE_BUDGET_MS = 250;

const buildLargeSeedData = (): AppData => {
  const tasks: Task[] = Array.from({ length: TASK_COUNT }, (_, index) => ({
    id: `perf-task-${index + 1}`,
    workspaceId: "local-workspace",
    projectId: index % 4 === 0 ? `perf-project-${(index % 8) + 1}` : null,
    workingFolder: null,
    title: `Task ${index + 1}`,
    notes: "",
    dueDate: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    dueTime: index % 3 === 0 ? "09:00" : null,
    timezone: "UTC",
    priority: (["low", "medium", "high"] as const)[index % 3],
    status: index % 5 === 0 ? "completed" : "todo",
    completedAt: index % 5 === 0 ? "2026-06-01T00:00:00.000Z" : null,
    createdAt: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    updatedAt: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    deletedAt: null,
    recurrenceTemplateId: null,
    recurrenceInstanceDate: null,
    parentId: null,
    tags: [],
  }));

  return {
    workspaceId: "local-workspace",
    workspaces: [
      {
        id: "local-workspace",
        name: "Default",
        color: "#4fb8d8",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    workspaceFolders: [],
    projects: Array.from({ length: 8 }, (_, index) => ({
      id: `perf-project-${index + 1}`,
      workspaceId: "local-workspace",
      name: `Project ${index + 1}`,
      color: "#4fb8d8",
      status: "active" as const,
      dueDate: null,
      workingFolder: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
      deletedAt: null,
    })),
    tasks,
    deletedTasks: [],
    deletedWorkspaceFolders: [],
    availableTasks: [],
    reminders: [],
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
    savedViews: [],
    recurringTaskTemplates: [],
    attachments: [],
  };
};

describe("LocalRepository performance baseline", () => {
  it("loads within budget with a large dataset", async () => {
    const seed = buildLargeSeedData();
    localStorage.setItem("whattodo:data", JSON.stringify(seed));

    const repository = new LocalRepository();
    const start = performance.now();
    const data = await repository.load();
    const elapsed = performance.now() - start;

    expect(data.tasks).toHaveLength(TASK_COUNT);
    expect(elapsed).toBeLessThan(LOAD_BUDGET_MS);
  });

  it("loadTaskPage resolves within budget", async () => {
    const seed = buildLargeSeedData();
    localStorage.setItem("whattodo:data", JSON.stringify(seed));

    const repository = new LocalRepository();
    await repository.load();

    const start = performance.now();
    const result = await repository.loadTaskPage({
      workspaceId: "local-workspace",
      scope: "open",
      limit: 50,
      offset: 0,
      sort: "overview",
    });
    const elapsed = performance.now() - start;

    expect(result.tasks.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(LOAD_TASK_PAGE_BUDGET_MS);
  });

  it("toggleTask completes within budget without full reload regression", async () => {
    const seed = buildLargeSeedData();
    localStorage.setItem("whattodo:data", JSON.stringify(seed));

    const repository = new LocalRepository();
    const data = await repository.load();
    const firstTask = data.tasks[0];

    const start = performance.now();
    await repository.toggleTask(firstTask.id);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(TOGGLE_BUDGET_MS);
  });
});
