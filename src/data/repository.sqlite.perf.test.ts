import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemorySqliteClient } from "./nodeSqliteClient";
import { setSqliteClientForTests } from "./sqliteClient";
import { SqlRepository } from "./sql/sqlRepository";

/**
 * Real SQLite engine performance baseline.
 *
 * Runs against SqlRepository backed by an in-memory SQLite database
 * with real SQLite schema, foreign keys, and indexes (including v17/v18).
 * Ensures hot query paths (load, loadTaskPage, toggleTask, saveSettings)
 * execute within strict upper-bound budgets.
 */

const SEED_TASK_COUNT = 1_000;
const LOAD_BUDGET_MS = 250;
const LOAD_TASK_PAGE_BUDGET_MS = 100;
const TOGGLE_BUDGET_MS = 150;
const SAVE_SETTINGS_BUDGET_MS = 150;
const SEARCH_TASK_BUDGET_MS = 100;

const percentile = (samples: number[], p: number) => {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

describe("SqlRepository (Real SQLite) performance baseline", () => {
  let repository: SqlRepository;

  beforeEach(async () => {
    setSqliteClientForTests(createMemorySqliteClient());
    repository = new SqlRepository();
    await repository.load();

    // Seed tasks via batch-like inserts into active workspace
    const now = "2026-06-01T00:00:00.000Z";
    const backup = await repository.exportBackup();
    for (let i = 0; i < SEED_TASK_COUNT; i++) {
      backup.tasks.push({
        id: `task_perf_${i}`,
        workspaceId: "local-workspace",
        projectId: null,
        workingFolder: null,
        title: `Task #${i}`,
        notes: `Notes for task ${i}`,
        dueDate: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`,
        dueTime: i % 2 === 0 ? "10:00" : null,
        timezone: "Asia/Shanghai",
        priority: i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low",
        status: i % 4 === 0 ? "completed" : "todo",
        completedAt: i % 4 === 0 ? now : null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        recurrenceTemplateId: null,
        recurrenceInstanceDate: null,
        parentId: null,
        tags: [`tag_${i % 10}`],
      });
    }
    await repository.importBackup(backup, "replace");
  });

  afterEach(() => {
    setSqliteClientForTests(null);
  });

  it("loads repository data and executes paged queries within budget", async () => {
    const loadTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await repository.load();
      loadTimes.push(performance.now() - start);
    }

    const loadP95 = percentile(loadTimes, 95);
    expect(loadP95).toBeLessThan(LOAD_BUDGET_MS);

    const pageTimes: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const page = await repository.loadTaskPage({
        workspaceId: "local-workspace",
        scope: "open",
        sort: "dueAsc",
        limit: 20,
        offset: i * 20,
      });
      pageTimes.push(performance.now() - start);
      expect(page.tasks.length).toBeLessThanOrEqual(20);
    }

    const pageP95 = percentile(pageTimes, 95);
    expect(pageP95).toBeLessThan(LOAD_TASK_PAGE_BUDGET_MS);
  });

  it("toggles tasks and saves settings within budget", async () => {
    const toggleTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const taskId = `task_perf_${i * 10}`;
      const start = performance.now();
      await repository.toggleTask(taskId);
      toggleTimes.push(performance.now() - start);
    }

    const toggleP95 = percentile(toggleTimes, 95);
    expect(toggleP95).toBeLessThan(TOGGLE_BUDGET_MS);

    const settingsTimes: number[] = [];
    const current = await repository.load();
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await repository.saveSettings({
        ...current.settings,
        theme: i % 2 === 0 ? "dark" : "light",
      });
      settingsTimes.push(performance.now() - start);
    }

    const settingsP95 = percentile(settingsTimes, 95);
    expect(settingsP95).toBeLessThan(SAVE_SETTINGS_BUDGET_MS);
  });

  it("executes fuzzy search queries over real SQLite within budget (PERF-004)", async () => {
    const searchQueries = ["Task #5", "99", "Notes", "high", "Task #10"];
    const searchTimes: number[] = [];

    for (let i = 0; i < 10; i++) {
      const query = searchQueries[i % searchQueries.length]!;
      const start = performance.now();
      const result = await repository.loadTaskPage({
        workspaceId: "local-workspace",
        scope: "all",
        query,
        limit: 20,
        offset: 0,
        sort: "overview",
      });
      const elapsed = performance.now() - start;
      searchTimes.push(elapsed);
      expect(result.tasks.length).toBeLessThanOrEqual(20);
    }

    const searchP50 = percentile(searchTimes, 50);
    const searchP95 = percentile(searchTimes, 95);

    // Output real evidence metrics
    console.log(`PERF-004 SQLite search benchmark: P50=${searchP50.toFixed(2)}ms, P95=${searchP95.toFixed(2)}ms`);

    expect(searchP95).toBeLessThan(SEARCH_TASK_BUDGET_MS);
  });
});
